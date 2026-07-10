// Slot Finder — GROUND-UP REDESIGN, not a port of V2's slot-finder /
// auto-slot-finder. Per user direction, V2's constraint logic is imperfect;
// this module re-derives the domain from first principles as independent,
// composable predicates instead of one entangled busy-map builder.
//
// The specific problem this fixes: V2's FI duty-hour check had a "the slot
// is inside the FI's existing duty window, so skip the check" exemption.
// That branch is unnecessary AND was the identified smell — if a slot is
// truly contained within [existingFirst, existingLast], the duty SPAN
// (last − first) cannot change by definition, so the plain, always-applied
// span check already handles that case correctly with no special path.
// This redesign has exactly one duty rule, applied unconditionally: adding
// a flight to an FI's day must not push their span beyond the max.
//
// Constraints are independent predicates: (candidate, context) -> Verdict.
// A slot is valid only when every predicate passes — composing them is a
// simple `every()`, so "why is this slot invalid?" is always answerable by
// naming the first predicate that failed, not by reading tangled busy-map code.

import { minutesOf } from './dates';
import type { Flight, Leave, Resource } from './types';

export interface Verdict {
  ok: boolean;
  reason?: string;
}

export interface TimeWindow {
  startMin: number;
  endMin: number;
}

export const ok: Verdict = { ok: true };
export function fail(reason: string): Verdict {
  return { ok: false, reason };
}

// ── FI type-qualification (inferred from real flight history, not a stale
//    hand-maintained list — an FI is qualified on any type they've flown) ──

export function inferFiQualifications(flights: readonly Flight[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const f of flights) {
    if (!f.instructor || !f.type) continue;
    const set = map.get(f.instructor) ?? new Set<string>();
    set.add(f.type);
    map.set(f.instructor, set);
  }
  return map;
}

export function fiQualified(fi: string, aircraftType: string, quals: Map<string, Set<string>>): Verdict {
  const set = quals.get(fi);
  if (!set || !set.has(aircraftType)) return fail(`${fi} has no flight history on ${aircraftType}`);
  return ok;
}

// ── Overlap + buffer helpers ────────────────────────────────────────────

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function padded(w: TimeWindow, bufferMin: number): TimeWindow {
  return { startMin: w.startMin - bufferMin, endMin: w.endMin + bufferMin };
}

// ── Duty span (the one rule, applied unconditionally — no exemptions) ────

export const DEFAULT_MAX_DUTY_MIN = 420; // 7 hours

/** FI duty span = earliest start to latest end across all their flights that day, including the candidate. */
export function fiDutyOk(
  fi: string,
  date: string,
  candidate: TimeWindow,
  dayFlights: readonly Flight[],
  maxDutyMin = DEFAULT_MAX_DUTY_MIN,
): Verdict {
  const existing = dayFlights.filter((f) => f.instructor === fi && f.date === date && f.status !== 'Canceled');
  let first = candidate.startMin;
  let last = candidate.endMin;
  for (const f of existing) {
    const s = minutesOf(f.start);
    const e = minutesOf(f.end);
    if (s != null) first = Math.min(first, s);
    if (e != null) last = Math.max(last, e);
  }
  const span = last - first;
  if (span > maxDutyMin) return fail(`${fi} duty span would be ${Math.round(span / 60)}h (max ${maxDutyMin / 60}h)`);
  return ok;
}

// ── Resource availability (aircraft / FI / student) — one shared shape ───

export function resourceAvailable(
  label: string,
  matches: (f: Flight) => boolean,
  candidate: TimeWindow,
  bufferMin: number,
  dayFlights: readonly Flight[],
): Verdict {
  const padded_ = padded(candidate, bufferMin);
  for (const f of dayFlights) {
    if (f.status === 'Canceled' || !matches(f)) continue;
    const s = minutesOf(f.start);
    const e = minutesOf(f.end);
    if (s == null || e == null) continue;
    if (overlaps(padded_, { startMin: s, endMin: e })) {
      return fail(`${label} busy ${f.start}–${f.end}${bufferMin ? ` (±${bufferMin}m buffer)` : ''}`);
    }
  }
  return ok;
}

export function onLeave(name: string, date: string, leaves: readonly Leave[]): Verdict {
  const l = leaves.find((x) => x.name === name && date >= x.start && date <= x.end);
  return l ? fail(`${name} on leave (${l.reason ?? 'Leave'})`) : ok;
}

export function aircraftMaintOk(tail: string, resources: readonly Resource[]): Verdict {
  const r = resources.find((x) => x.tail === tail);
  return r?.isMaint ? fail(`${tail} in maintenance`) : ok;
}

export function withinRunwayWindow(candidate: TimeWindow, closed: TimeWindow | null): Verdict {
  if (!closed) return ok;
  return overlaps(candidate, closed) ? fail(`overlaps runway closure ${fmtMin(closed.startMin)}–${fmtMin(closed.endMin)}`) : ok;
}

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── Search ────────────────────────────────────────────────────────────────

export interface SlotRequest {
  date: string;
  durationMin: number;
  bufferMin: number;
  searchStartMin: number;
  searchEndMin: number;
  stepMin: number;
  studentKey: string;
  studentName: string;
  candidateFIs?: readonly string[];
  candidateTails?: readonly string[];
  runwayClosed?: TimeWindow | null;
  maxDutyMin?: number;
}

export interface SlotCandidate {
  startMin: number;
  endMin: number;
  fi: string;
  tail: string;
  aircraftType: string;
}

export interface SlotFinderContext {
  dayFlights: readonly Flight[];
  resources: readonly Resource[];
  leaves: readonly Leave[];
  quals: Map<string, Set<string>>;
}

/** Evaluate one candidate against every constraint, in order (first failure wins). */
export function evaluateCandidate(
  req: SlotRequest,
  candidate: SlotCandidate,
  ctx: SlotFinderContext,
): Verdict {
  const window: TimeWindow = { startMin: candidate.startMin, endMin: candidate.endMin };
  const checks: Verdict[] = [
    fiQualified(candidate.fi, candidate.aircraftType, ctx.quals),
    withinRunwayWindow(window, req.runwayClosed ?? null),
    onLeave(candidate.fi, req.date, ctx.leaves),
    onLeave(req.studentName, req.date, ctx.leaves),
    aircraftMaintOk(candidate.tail, ctx.resources),
    fiDutyOk(candidate.fi, req.date, window, ctx.dayFlights, req.maxDutyMin),
    resourceAvailable(candidate.tail, (f) => f.tail === candidate.tail, window, req.bufferMin, ctx.dayFlights),
    resourceAvailable(candidate.fi, (f) => f.instructor === candidate.fi, window, req.bufferMin, ctx.dayFlights),
    resourceAvailable(req.studentName, (f) => f.studentKey === req.studentKey || f.student === req.studentName, window, req.bufferMin, ctx.dayFlights),
  ];
  return checks.find((v) => !v.ok) ?? ok;
}

export interface SlotGroup {
  fi: string;
  tail: string;
  aircraftType: string;
  /** Ranges of possible START times (the flight can begin anywhere in each range and still fit). */
  startRanges: TimeWindow[];
}

/**
 * Sweep the search window in `stepMin` increments for every (FI, tail) pair.
 * A "slot" is a range of valid START times, not a single fixed window — a
 * flight in that range still satisfies every constraint at any start point
 * within it. Consecutive valid starts (gap === stepMin) merge into one range.
 */
export function findSlots(req: SlotRequest, ctx: SlotFinderContext): SlotGroup[] {
  const fis = req.candidateFIs?.length ? req.candidateFIs : [...ctx.quals.keys()];
  const tailTypes = new Map(ctx.resources.map((r) => [r.tail, r.acType]));
  const tails = req.candidateTails?.length ? req.candidateTails : [...tailTypes.keys()];

  const groups: SlotGroup[] = [];
  for (const fi of fis) {
    for (const tail of tails) {
      const aircraftType = tailTypes.get(tail) ?? '';
      const validStarts: number[] = [];
      for (let start = req.searchStartMin; start + req.durationMin <= req.searchEndMin; start += req.stepMin) {
        const candidate: SlotCandidate = { startMin: start, endMin: start + req.durationMin, fi, tail, aircraftType };
        if (evaluateCandidate(req, candidate, ctx).ok) validStarts.push(start);
      }
      if (!validStarts.length) continue;
      const startRanges: TimeWindow[] = [];
      let rangeStart = validStarts[0];
      let prev = validStarts[0];
      for (let i = 1; i < validStarts.length; i++) {
        if (validStarts[i] - prev > req.stepMin) {
          startRanges.push({ startMin: rangeStart, endMin: prev });
          rangeStart = validStarts[i];
        }
        prev = validStarts[i];
      }
      startRanges.push({ startMin: rangeStart, endMin: prev });
      groups.push({ fi, tail, aircraftType, startRanges });
    }
  }
  return groups;
}
