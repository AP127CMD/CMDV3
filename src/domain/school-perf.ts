// School Performance — plan vs actual across all 4 batches. Actuals ALWAYS
// come from real flown[] records (Student.flown, never Student.planned —
// see domain/upcoming.ts for the project-wide rule on simulated data).
// Plan baseline = curriculum.plannedDate/plannedMins (a fixed syllabus
// target, not a live simulation — safe to use for "vs plan" comparisons).

import { addDays, dayRange } from './dates';
import { isSimLesson } from './lessons';
import type { CurriculumRow, Student } from './types';

export type HoursMode = 'actual' | 'effective';

export const SCHOOL_BATCHES = ['AP124', 'AP126', 'AP127', 'AP129'] as const;
export type SchoolBatch = (typeof SCHOOL_BATCHES)[number];

export interface FlightRecord {
  date: string;
  batch: SchoolBatch;
  mins: number;
  isSim: boolean;
}

function batchKeyOf(raw: string): SchoolBatch | null {
  const k = raw.toUpperCase();
  return (SCHOOL_BATCHES as readonly string[]).includes(k) ? (k as SchoolBatch) : null;
}

export interface SchoolCurricula {
  cur124: readonly CurriculumRow[];
  cur126: readonly CurriculumRow[];
  cur127: readonly CurriculumRow[];
}

/** lesson → plannedMins, merged across every batch's curriculum. */
export function buildSchoolCurMap(curricula: Record<string, readonly CurriculumRow[]>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const cur of [curricula.cur124 ?? [], curricula.cur126 ?? [], curricula.cur127 ?? []]) {
    for (const c of cur) if (c.lesson && c.plannedMins != null) map[c.lesson] = c.plannedMins;
  }
  return map;
}

/** Real flown lessons across all batches, block-time minutes (V2 collectHistoricalFlights). */
export function collectHistoricalFlights(
  batches: Record<string, readonly Student[]>,
): FlightRecord[] {
  const out: FlightRecord[] = [];
  for (const [batchKey, students] of Object.entries(batches)) {
    const b = batchKeyOf(batchKey);
    if (!b) continue;
    for (const s of students) {
      for (const f of s.flown) {
        if (!f.date) continue;
        out.push({ date: f.date, batch: b, mins: f.actualMins ?? 0, isSim: isSimLesson(f.lesson) });
      }
    }
  }
  return out;
}

/**
 * Same as collectHistoricalFlights but each lesson is credited its
 * curriculum-planned minutes (normalizes duration anomalies). Split lessons
 * ("LESSON/1", "LESSON/2") credit the full planned value only on part 1.
 */
export function collectEffectiveFlights(
  batches: Record<string, readonly Student[]>,
  curMap: Record<string, number>,
): FlightRecord[] {
  const out: FlightRecord[] = [];
  for (const [batchKey, students] of Object.entries(batches)) {
    const b = batchKeyOf(batchKey);
    if (!b) continue;
    for (const s of students) {
      for (const f of s.flown) {
        if (!f.date) continue;
        const lesson = f.lesson.trim();
        let mins: number;
        if (curMap[lesson] != null) mins = curMap[lesson];
        else if (lesson.includes('/')) {
          const base = lesson.replace(/\/\d+$/, '');
          const part = parseInt(lesson.split('/').pop() ?? '1', 10) || 1;
          mins = part === 1 ? (curMap[base] ?? f.actualMins ?? 0) : 0;
        } else {
          mins = f.actualMins ?? 0;
        }
        out.push({ date: f.date, batch: b, mins, isSim: isSimLesson(f.lesson) });
      }
    }
  }
  return out;
}

export interface DayAgg {
  date: string;
  n: number;
  h: number;
  simN: number;
  simH: number;
  byBatch: Record<SchoolBatch, { n: number; h: number; simN: number; simH: number }>;
}

function emptyBatchAgg(): Record<SchoolBatch, { n: number; h: number; simN: number; simH: number }> {
  return Object.fromEntries(SCHOOL_BATCHES.map((b) => [b, { n: 0, h: 0, simN: 0, simH: 0 }])) as Record<
    SchoolBatch,
    { n: number; h: number; simN: number; simH: number }
  >;
}

/** Per-day aggregation, every calendar day in [from, to] included (even zero-flight days). */
export function buildDayMap(records: readonly FlightRecord[], from: string, to: string): DayAgg[] {
  const byDate = new Map<string, DayAgg>();
  for (const d of dayRange(from, to)) byDate.set(d, { date: d, n: 0, h: 0, simN: 0, simH: 0, byBatch: emptyBatchAgg() });
  for (const r of records) {
    if (r.date < from || r.date > to) continue;
    const agg = byDate.get(r.date);
    if (!agg) continue;
    const h = r.mins / 60;
    if (r.isSim) {
      agg.simN++;
      agg.simH += h;
      agg.byBatch[r.batch].simN++;
      agg.byBatch[r.batch].simH += h;
    } else {
      agg.n++;
      agg.h += h;
      agg.byBatch[r.batch].n++;
      agg.byBatch[r.batch].h += h;
    }
  }
  return [...byDate.values()];
}

export interface MonthAgg {
  month: string; // YYYY-MM
  n: number;
  h: number;
  simN: number;
  simH: number;
  byBatch: Record<SchoolBatch, { n: number; h: number; simN: number; simH: number }>;
}

export function buildMonthMap(records: readonly FlightRecord[], from: string, to: string): MonthAgg[] {
  const days = buildDayMap(records, from, to);
  const byMonth = new Map<string, MonthAgg>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    const agg = byMonth.get(m) ?? {
      month: m,
      n: 0,
      h: 0,
      simN: 0,
      simH: 0,
      byBatch: emptyBatchAgg(),
    };
    agg.n += d.n;
    agg.h += d.h;
    agg.simN += d.simN;
    agg.simH += d.simH;
    for (const b of SCHOOL_BATCHES) {
      agg.byBatch[b].n += d.byBatch[b].n;
      agg.byBatch[b].h += d.byBatch[b].h;
      agg.byBatch[b].simN += d.byBatch[b].simN;
      agg.byBatch[b].simH += d.byBatch[b].simH;
    }
    byMonth.set(m, agg);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ── Plan baseline (from curriculum, fixed syllabus target) ────────────────

export interface PlanMonth {
  month: string;
  flights: number;
  hours: number;
}

/** Planned flights/hours per month, from curriculum.plannedDate × student count in that batch. */
export function buildPlanMonths(
  curricula: Record<string, readonly CurriculumRow[]>,
  studentCounts: Record<'AP124' | 'AP126' | 'AP127', number>,
): PlanMonth[] {
  const byMonth = new Map<string, PlanMonth>();
  const rows: Array<[readonly CurriculumRow[], number]> = [
    [curricula.cur124 ?? [], studentCounts.AP124],
    [curricula.cur126 ?? [], studentCounts.AP126],
    [curricula.cur127 ?? [], studentCounts.AP127],
  ];
  for (const [cur, n] of rows) {
    for (const c of cur) {
      if (!c.plannedDate) continue;
      const m = c.plannedDate.slice(0, 7);
      const agg = byMonth.get(m) ?? { month: m, flights: 0, hours: 0 };
      agg.flights += n;
      agg.hours += ((c.plannedMins ?? 0) * n) / 60;
      byMonth.set(m, agg);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ── Scorecard KPIs ──────────────────────────────────────────────────────

export interface ScorecardResult {
  achievementFlightsPct: number | null;
  achievementHoursPct: number | null;
  thisMonthFlightsPct: number | null;
  thisMonthHoursPct: number | null;
  shortfallFlights: number;
  shortfallHours: number;
  paceStatus: 'on-track' | 'caution' | 'behind' | 'unknown';
  actualFlights: number;
  actualHours: number;
  plannedFlights: number;
  plannedHours: number;
}

/** V2 renderScorecard's 7-tile core, condensed. Elapsed months only (month_end <= today). */
export function computeScorecard(monthActual: readonly MonthAgg[], planMonths: readonly PlanMonth[], today: string): ScorecardResult {
  const currentMonth = today.slice(0, 7);
  const elapsed = planMonths.filter((p) => p.month <= currentMonth);
  const actualByMonth = new Map(monthActual.map((m) => [m.month, m]));

  let actualFlights = 0;
  let actualHours = 0;
  let plannedFlights = 0;
  let plannedHours = 0;
  for (const p of elapsed) {
    const a = actualByMonth.get(p.month);
    actualFlights += a?.n ?? 0;
    actualHours += a?.h ?? 0;
    plannedFlights += p.flights;
    plannedHours += p.hours;
  }

  const achievementFlightsPct = plannedFlights > 0 ? (actualFlights / plannedFlights) * 100 : null;
  const achievementHoursPct = plannedHours > 0 ? (actualHours / plannedHours) * 100 : null;

  const thisMonth = planMonths.find((p) => p.month === currentMonth);
  const thisActual = actualByMonth.get(currentMonth);
  const thisMonthFlightsPct = thisMonth && thisMonth.flights > 0 ? ((thisActual?.n ?? 0) / thisMonth.flights) * 100 : null;
  const thisMonthHoursPct = thisMonth && thisMonth.hours > 0 ? ((thisActual?.h ?? 0) / thisMonth.hours) * 100 : null;

  const shortfallFlights = actualFlights - plannedFlights;
  const shortfallHours = actualHours - plannedHours;

  const paceStatus: ScorecardResult['paceStatus'] =
    achievementHoursPct == null ? 'unknown' : achievementHoursPct >= 95 ? 'on-track' : achievementHoursPct >= 80 ? 'caution' : 'behind';

  return {
    achievementFlightsPct,
    achievementHoursPct,
    thisMonthFlightsPct,
    thisMonthHoursPct,
    shortfallFlights,
    shortfallHours,
    paceStatus,
    actualFlights,
    actualHours,
    plannedFlights,
    plannedHours,
  };
}

/** Last-N-calendar-days window ending at `today` (inclusive), oldest first. */
export function recentDaysRange(today: string, n: number): string[] {
  return dayRange(addDays(today, -(n - 1)), today);
}
