// Ingest-time data hygiene — the typed, tested home of what V2 did in browser
// IIFEs (js/shared.js): ACTUAL_ONLY dedup with key fallback, "(Unplanned)"
// stripping, roster injection by NAME, date validation. The app receives
// clean data and performs no repair.

import type { RawFlight, RawFlightData, RawProgressStudent, RawProgress } from './sources';
import type { CurriculumRow, Flight, FlightStatus, Student, ValidationIssue } from '../src/domain/types';
import { makeOpsStudentKey, stripUnplanned, ccKeyFromFull } from '../src/domain/names';
import { normLesson, hmToMin } from '../src/domain/lessons';
import { normBatch, isAP127Batch } from '../src/domain/batches';
import { ROSTER_BY_KEY, AP127_ROSTER } from '../src/domain/roster';
import { validDate } from '../src/domain/dates';

export interface DedupeResult {
  flights: RawFlight[];
  removedById: number;
  removedByKey: number;
  fallbackSamples: string[];
}

/**
 * When ACTUAL_ONLY_X_ACT_N exists, remove the planned X entry if Completed —
 * the actual entry is the truth (planned completed rows have to=0/ldg=0).
 * Fallback: same student|date|lesson event when the id no longer derives
 * (the SANGYAI P. / PDXC 30 upstream-drift class) — surfaced as a warning.
 */
export function dedupeActualOnly(raw: RawFlight[]): DedupeResult {
  const norm = (s: unknown) =>
    String(s ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s*\(UNPLANNED\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/\/\d+\s*$/, '');
  const evtKey = (f: RawFlight) => norm(f.student) + '|' + (f.date || '') + '|' + norm(f.lesson);

  const hasActual = new Set<string>();
  const actualKeys = new Set<string>();
  for (const f of raw) {
    if (f.id && f.id.startsWith('ACTUAL_ONLY_')) {
      hasActual.add(f.id.slice('ACTUAL_ONLY_'.length).replace(/_ACT_\d+$/, ''));
      if (f.status === 'Completed' && f.student && f.lesson) actualKeys.add(evtKey(f));
    }
  }
  let removedById = 0;
  let removedByKey = 0;
  const fallbackSamples: string[] = [];
  if (!hasActual.size) return { flights: raw, removedById, removedByKey, fallbackSamples };

  const flights = raw.filter((f) => {
    if (!f.id || f.id.startsWith('ACTUAL_ONLY_')) return true;
    if (f.status !== 'Completed') return true;
    if (hasActual.has(f.id)) {
      removedById++;
      return false;
    }
    if (f.student && f.lesson && actualKeys.has(evtKey(f))) {
      removedByKey++;
      if (fallbackSamples.length < 8) fallbackSamples.push(evtKey(f));
      return false;
    }
    return true;
  });
  return { flights, removedById, removedByKey, fallbackSamples };
}

export interface NormalizeFlightsResult {
  flights: Flight[];
  transforms: Record<string, number>;
  warnings: ValidationIssue[];
}

const VALID_STATUS: ReadonlySet<string> = new Set(['Pending', 'Completed', 'Canceled']);

/**
 * Raw flights → normalized, enriched Flight[]. `students` powers the nick
 * bridge (pass the freshest progress students available — previous snapshot
 * is fine when the live fetch failed; roster nicks are stable).
 */
export function normalizeFlights(
  raw: RawFlight[],
  students: ReadonlyArray<{ name: string; nick?: string | null }>,
): NormalizeFlightsResult {
  const opsKey = makeOpsStudentKey(
    students.length ? students : AP127_ROSTER.map(([name, nick]) => ({ name, nick })),
  );
  const warnings: ValidationIssue[] = [];
  const badDates: string[] = [];
  const badStatus: string[] = [];
  const badDur: string[] = [];
  const dupIds: string[] = [];
  const seen = new Set<string>();
  let unplannedStripped = 0;
  let nickBridged = 0;

  const flights: Flight[] = [];
  for (const f of raw) {
    if (f.date && !validDate(f.date)) {
      if (badDates.length < 8) badDates.push(`${f.id}:${f.date}`);
      else badDates.push('');
      continue; // malformed dates are excluded from output (listed in manifest)
    }
    if (seen.has(f.id)) dupIds.push(f.id);
    seen.add(f.id);

    const status: FlightStatus = VALID_STATUS.has(f.status) ? (f.status as FlightStatus) : 'Pending';
    if (!VALID_STATUS.has(f.status) && badStatus.length < 8) badStatus.push(`${f.id}:${f.status}`);

    const durMin = f.durMin ?? hmToMin(f.duration ?? null);
    if (durMin != null && (durMin < 0 || durMin > 600) && badDur.length < 8) {
      badDur.push(`${f.id}:${durMin}`);
    }

    const rawStudent = f.student ?? null;
    const student = rawStudent ? stripUnplanned(rawStudent) : null;
    const rawInstructor = f.instructor ?? null;
    const instructor = rawInstructor ? stripUnplanned(rawInstructor) : null;
    const unplanned = (rawStudent != null && student !== rawStudent) || (rawInstructor != null && instructor !== rawInstructor);
    if (unplanned) unplannedStripped++;

    let studentKey: string | null = null;
    let nick: string | null = null;
    if (student && isAP127Batch(f.batch)) {
      studentKey = opsKey(student);
      if (studentKey !== ccKeyFromFull(student).toUpperCase() && studentKey !== student.toUpperCase()) {
        nickBridged++;
      }
      nick = ROSTER_BY_KEY[studentKey]?.nick ?? null;
    } else if (student) {
      studentKey = ccKeyFromFull(student);
    }

    const actualOnly = f.id.startsWith('ACTUAL_ONLY_');
    const flags: Flight['flags'] = {};
    if (actualOnly) flags.actualOnly = true;
    if (unplanned) flags.unplanned = true;

    flights.push({
      id: f.id,
      date: f.date,
      status,
      isSim: !!f.isSim,
      isStandby: !!f.isStandby,
      start: f.start ?? null,
      end: f.end ?? null,
      durMin,
      student,
      ...(unplanned && rawStudent ? { studentRaw: rawStudent } : {}),
      studentKey,
      nick,
      instructor,
      batch: f.batch ?? null,
      batchKey: f.batch ? normBatch(f.batch) : null,
      lesson: f.lesson ?? null,
      lessonNorm: f.lesson ? normLesson(f.lesson) : null,
      cond: f.cond ?? null,
      type: f.type ?? null,
      tail: f.tail ?? null,
      tkoff: f.tkoff ?? null,
      ldgTime: f.ldgTime ?? null,
      airborneMin: hmToMin(f.airborne ?? null),
      to: f.to ?? null,
      ldg: f.ldg ?? null,
      inst: f.inst ?? null,
      ...(Object.keys(flags).length ? { flags } : {}),
    });
  }

  if (badDates.length) {
    warnings.push({
      code: 'MALFORMED_DATE',
      message: 'flights with malformed dates were excluded',
      count: badDates.length,
      samples: badDates.filter(Boolean),
    });
  }
  if (badStatus.length) {
    warnings.push({ code: 'UNKNOWN_STATUS', message: 'status outside enum, coerced to Pending', count: badStatus.length, samples: badStatus });
  }
  if (badDur.length) {
    warnings.push({ code: 'DURATION_RANGE', message: 'durMin outside 0–600', count: badDur.length, samples: badDur });
  }
  if (dupIds.length) {
    warnings.push({ code: 'DUPLICATE_ID', message: 'duplicate flight ids', count: dupIds.length, samples: dupIds.slice(0, 8) });
  }

  return {
    flights,
    transforms: { unplannedStripped, nickBridged },
    warnings,
  };
}

// ── Progress ───────────────────────────────────────────────────────────────

export interface NormalizeProgressResult {
  students: Student[];
  curriculum: CurriculumRow[];
  rosterCoverage: { matched: number; missingFromFeed: string[]; unknownInFeed: string[] };
  warnings: ValidationIssue[];
}

export function normalizeProgress(raw: RawProgress): NormalizeProgressResult {
  const students = normalizeStudents(raw.ap127);
  const curriculum = normalizeCurriculum(raw.cur127);

  const feedKeys = new Set(students.map((s) => s.key));
  const missingFromFeed = AP127_ROSTER.filter(([name]) => !feedKeys.has(ccKeyFromFull(name))).map(
    ([name]) => name,
  );
  const rosterKeys = new Set(Object.keys(ROSTER_BY_KEY));
  const unknownInFeed = students.filter((s) => !rosterKeys.has(s.key)).map((s) => s.name);

  const warnings: ValidationIssue[] = [];
  if (missingFromFeed.length) {
    warnings.push({
      code: 'ROSTER_MISSING',
      message: 'roster students absent from the progress feed (upstream usually self-heals; do NOT fabricate)',
      count: missingFromFeed.length,
      samples: missingFromFeed,
    });
  }
  if (unknownInFeed.length) {
    warnings.push({
      code: 'ROSTER_UNKNOWN',
      message: 'progress feed students not in the AP127 roster',
      count: unknownInFeed.length,
      samples: unknownInFeed,
    });
  }

  return {
    students,
    curriculum,
    rosterCoverage: {
      matched: students.length - unknownInFeed.length,
      missingFromFeed,
      unknownInFeed,
    },
    warnings,
  };
}

export function normalizeStudents(rawStudents: RawProgressStudent[]): Student[] {
  return rawStudents.map((s) => {
    const key = ccKeyFromFull(s.name);
    const r = ROSTER_BY_KEY[key]; // by NAME, never by index (V2 integrity fix)
    return {
      catcId: s.catc_id,
      name: s.name,
      key,
      nick: r?.nick ?? '',
      fi: r?.fi ?? '',
      fiFull: r?.fiFull ?? '',
      se: r?.se ?? '',
      batch: s.batch || 'AP127',
      done: s.done,
      total: s.total,
      remaining: s.remaining ?? Math.max(0, s.total - s.done),
      pct: s.pct ?? (s.total ? +((s.done / s.total) * 100).toFixed(1) : 0),
      nextLesson: s.next_lesson ?? null,
      flown: (s.flown ?? []).map((f) => ({
        lesson: f.lesson,
        lessonNorm: normLesson(f.lesson),
        actualMins: f.actual_mins ?? hmToMin(f.actual_ft ?? null),
        date: f.date,
      })),
      ...(s.planned
        ? { planned: s.planned.map((p) => ({ lesson: p.lesson, date: p.date, mins: p.mins ?? null })) }
        : {}),
    };
  });
}

export function normalizeCurriculum(rawCur: Array<{ lesson: string; planned_mins?: number | null; planned_date?: string | null }>): CurriculumRow[] {
  return rawCur.map((c) => ({
    lesson: c.lesson,
    lessonNorm: normLesson(c.lesson),
    plannedMins: c.planned_mins ?? null,
    plannedDate: c.planned_date ?? null,
  }));
}

// ── Truncation canary ──────────────────────────────────────────────────────

/** Error when the new record count drops >30% vs the previous committed file. */
export function truncationCanary(label: string, prevCount: number | null, nextCount: number): string | null {
  if (prevCount == null || prevCount === 0) return null;
  if (nextCount < prevCount * 0.7) {
    return `${label}: record count dropped ${prevCount} → ${nextCount} (>30%) — refusing suspected truncated payload`;
  }
  return null;
}

/** Convenience used by the ingest to validate the RawFlightData envelope. */
export function flightEnvelopeCounts(d: RawFlightData): Record<string, number> {
  return {
    flights: d.flights.length,
    instructors: d.instructors.length,
    resources: d.resources.length,
    leaves: d.leaves.length,
  };
}
