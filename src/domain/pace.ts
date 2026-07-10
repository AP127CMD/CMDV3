// AP-127 cohort pace / idle / time-travel calculations, ported from V2
// js/view-cohort.js. All functions are pure; "asOf" drives time travel by
// clipping each student's flown[] — no historical snapshots involved.

import type { CurriculumRow, Student } from './types';
import { dateDiff } from './dates';
import { isWorkableDay } from './holidays';
import { addDays } from './dates';

/** lesson → plannedMins map from the curriculum. */
export function buildCurriculumMap(cur: readonly CurriculumRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of cur) if (c.lesson && c.plannedMins != null) map[c.lesson] = c.plannedMins;
  return map;
}

/**
 * Time travel: view the cohort as of a past date. Each student's flown[] is
 * clipped to `date <= asOf` and done/pct/remaining/nextLesson recomputed.
 * `asOf === null` means live — the original array is returned untouched.
 */
export function studentsAsOf(
  students: readonly Student[],
  curriculum: readonly CurriculumRow[],
  asOf: string | null,
): readonly Student[] {
  if (!asOf) return students;
  return students.map((s) => {
    const flown = (s.flown ?? []).filter((f) => f.date && f.date <= asOf);
    const total = s.total || 0;
    const done = flown.length;
    const flownSet = new Set(flown.map((f) => (f.lesson || '').toUpperCase().trim()));
    const nx = curriculum.find((c) => !flownSet.has((c.lesson || '').toUpperCase().trim()));
    return {
      ...s,
      flown,
      done,
      pct: total ? +((done / total) * 100).toFixed(1) : 0,
      remaining: Math.max(0, total - done),
      nextLesson: nx ? nx.lesson : 'COMPLETE',
    };
  });
}

/** Minutes for one flown record (actual mins, 0 when absent). */
export function flightMins(f: { actualMins?: number | null }): number {
  return f.actualMins ?? 0;
}

/**
 * A student's hours-done, V2 rule (ap127Hours): per flown lesson use the
 * curriculum's plannedMins when the lesson is known, else the actual minutes.
 */
export function studentHours(s: Student, curMap: Record<string, number>): number {
  return (s.flown ?? []).reduce((a, f) => a + (curMap[f.lesson] ?? flightMins(f)), 0) / 60;
}

/** Total curriculum hours (sum of plannedMins). */
export function curriculumHours(cur: readonly CurriculumRow[]): number {
  return cur.reduce((a, c) => a + (c.plannedMins ?? 0), 0) / 60;
}

/** Curriculum hours planned to be complete by `today` (plannedDate <= today). */
export function plannedHoursAsOf(cur: readonly CurriculumRow[], today: string): number {
  return (
    cur
      .filter((c) => c.plannedDate && c.plannedDate <= today)
      .reduce((a, c) => a + (c.plannedMins ?? 0), 0) / 60
  );
}

/** Latest flown date ('' when none). */
export function lastFlightDate(s: Student): string {
  return (
    (s.flown ?? [])
      .map((f) => f.date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? ''
  );
}

/** Days since last flight as of `asOf` (9999 when never flown — sorts last). */
export function idleDays(s: Student, asOf: string): number {
  const last = lastFlightDate(s);
  return last && asOf ? Math.max(0, dateDiff(asOf, last) ?? 0) : 9999;
}

/** V2 idle color rule: ≤2 fine, ≤5 warning, >5 alert. */
export function idleColorVar(d: number): string {
  if (d <= 2) return 'var(--ink)';
  if (d <= 5) return 'var(--col-pending)';
  return 'var(--col-cancel)';
}

/** Most-ahead first (done desc, then idle asc). */
export function paceSort(arr: readonly Student[], asOf: string): Student[] {
  return [...arr].sort(
    (a, b) => (b.done || 0) - (a.done || 0) || idleDays(a, asOf) - idleDays(b, asOf),
  );
}

/** Most-behind first (done asc, then idle desc). */
export function behindSort(arr: readonly Student[], asOf: string): Student[] {
  return [...arr].sort(
    (a, b) => (a.done || 0) - (b.done || 0) || idleDays(b, asOf) - idleDays(a, asOf),
  );
}

/**
 * Day delta for a student: today − planned date of their last completed
 * lesson. Positive = behind plan. Null when unknowable.
 */
export function dayDelta(
  s: Student,
  planMap: Record<string, string>,
  today: string,
): number | null {
  const last = (s.flown ?? []).at(-1);
  if (!last) return null;
  const planDate = planMap[last.lesson];
  if (!planDate) return null;
  return dateDiff(today, planDate);
}

/** lesson → plannedDate map. */
export function buildPlanDateMap(cur: readonly CurriculumRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of cur) if (c.lesson && c.plannedDate) map[c.lesson] = c.plannedDate;
  return map;
}

/** Rank band for the ranking table (V2 ap127RankClass). */
export function rankClass(rank: number, total: number): 'bad' | 'mid' | 'ok' {
  if (rank <= 3) return 'bad';
  if (rank <= Math.ceil(total * 0.4)) return 'mid';
  return 'ok';
}

/**
 * Naive completion projection: at `paceLessonsPerWorkday` (measured over a
 * recent window), on which date does the student clear `remaining` lessons?
 * Walks workable days only (weekends + holidays skipped). Null when pace ≤ 0.
 */
export function projectFinishDate(
  remaining: number,
  paceLessonsPerWorkday: number,
  from: string,
  maxDays = 800,
): string | null {
  if (remaining <= 0) return from;
  if (paceLessonsPerWorkday <= 0) return null;
  let acc = 0;
  let cur = from;
  for (let i = 0; i < maxDays; i++) {
    cur = addDays(cur, 1);
    if (!isWorkableDay(cur)) continue;
    acc += paceLessonsPerWorkday;
    if (acc >= remaining) return cur;
  }
  return null;
}

// ── Pace Monitor (V2 renderAP127Pace) ─────────────────────────────────────

export interface PaceMonitorResult {
  rangeStart: string;
  rangeDays: number;
  actHrs: number;
  actLessons: number;
  remHrsBatch: number;
  remLessonsBatch: number;
  daysRemaining: number | null; // to planEnd
  neededHrsPerDay: number | null;
  neededLessonsPerDay: number | null;
  gapHrsPerDay: number | null; // actual - needed (positive = ahead)
  gapLessonsPerDay: number | null;
  n: number; // student count
}

/**
 * Batch pace over a window ending at `today`: actual hours/lessons flown vs
 * what's still needed per day to hit `planEnd` (V2 renderAP127Pace). Pass
 * `rangeDays = 0` for "all time" (measured from `batchStart`).
 */
export function paceMonitor(
  students: readonly Student[],
  curriculum: readonly CurriculumRow[],
  curMap: Record<string, number>,
  today: string,
  rangeDays: number,
  batchStart: string,
): PaceMonitorResult {
  const n = students.length || 1;
  const rangeStart = rangeDays === 0 ? batchStart : addDays(today, -rangeDays);
  const effRangeDays = rangeDays === 0 ? Math.max(1, dateDiff(today, batchStart) ?? 1) : rangeDays;

  let actHrs = 0;
  let actLessons = 0;
  for (const s of students) {
    for (const f of s.flown ?? []) {
      if (!f.date || f.date < rangeStart || f.date > today) continue;
      actHrs += (curMap[f.lesson] ?? flightMins(f)) / 60;
      actLessons++;
    }
  }

  const totalHrsDone = students.reduce((a, s) => a + studentHours(s, curMap), 0);
  const totalLesDone = students.reduce((a, s) => a + s.done, 0);
  const currHrs = curriculumHours(curriculum);
  const currLessons = curriculum.length || students[0]?.total || 0;
  const remHrsBatch = Math.max(currHrs * n - totalHrsDone, 0);
  const remLessonsBatch = Math.max(currLessons * n - totalLesDone, 0);

  const planEnd = curriculum
    .map((c) => c.plannedDate)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const daysRemaining = planEnd ? Math.max(dateDiff(planEnd, today) ?? 0, 0) : null;

  const neededHrsPerDay = daysRemaining ? remHrsBatch / daysRemaining : null;
  const neededLessonsPerDay = daysRemaining ? remLessonsBatch / daysRemaining : null;
  const actualHrsPerDay = actHrs / effRangeDays;
  const actualLessonsPerDay = actLessons / effRangeDays;

  return {
    rangeStart,
    rangeDays: effRangeDays,
    actHrs,
    actLessons,
    remHrsBatch,
    remLessonsBatch,
    daysRemaining,
    neededHrsPerDay,
    neededLessonsPerDay,
    gapHrsPerDay: neededHrsPerDay == null ? null : actualHrsPerDay - neededHrsPerDay,
    gapLessonsPerDay: neededLessonsPerDay == null ? null : actualLessonsPerDay - neededLessonsPerDay,
    n,
  };
}

export interface EtcStudentResult {
  student: Student;
  etc: string | null;
  atRisk: boolean;
}

export interface EtcResult {
  planEnd: string | null;
  cohortEtc: string | null;
  onTrack: number;
  atRisk: number;
  avgDelayDays: number | null;
  perStudent: EtcStudentResult[];
}

/**
 * Estimated-time-to-completion, all-time pace per student (V2's ETC box).
 * A student is "at risk" when their ETC falls after the curriculum plan end.
 */
export function etcProjection(
  students: readonly Student[],
  curriculum: readonly CurriculumRow[],
  curMap: Record<string, number>,
  today: string,
  batchStart: string,
): EtcResult {
  const daysFromStart = Math.max(dateDiff(today, batchStart) ?? 1, 1);
  const currHrs = curriculumHours(curriculum);
  const planEnd = curriculum
    .map((c) => c.plannedDate)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null;

  const perStudent: EtcStudentResult[] = students.map((s) => {
    const hrs = studentHours(s, curMap);
    const rem = Math.max(currHrs - hrs, 0);
    const pace = hrs / daysFromStart;
    let etc: string | null = null;
    if (rem <= 0) etc = today;
    else if (pace > 0) {
      let acc = 0;
      let cur = today;
      for (let i = 0; i < 2000; i++) {
        cur = addDays(cur, 1);
        acc += pace;
        if (acc >= rem) {
          etc = cur;
          break;
        }
      }
    }
    const atRisk = !etc || (planEnd != null && etc > planEnd);
    return { student: s, etc, atRisk };
  });

  const onTrack = perStudent.filter((p) => !p.atRisk).length;
  const atRisk = perStudent.length - onTrack;
  const delays = perStudent
    .filter((p) => p.atRisk && p.etc && planEnd)
    .map((p) => dateDiff(p.etc!, planEnd!) ?? 0)
    .filter((d) => d > 0);
  const avgDelayDays = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null;

  const avgHrsDone = students.reduce((a, s) => a + studentHours(s, curMap), 0) / (students.length || 1);
  const avgRem = Math.max(currHrs - avgHrsDone, 0);
  const cohortPace = avgHrsDone / daysFromStart;
  let cohortEtc: string | null = null;
  if (avgRem <= 0) cohortEtc = today;
  else if (cohortPace > 0) {
    let acc = 0;
    let cur = today;
    for (let i = 0; i < 2000; i++) {
      cur = addDays(cur, 1);
      acc += cohortPace;
      if (acc >= avgRem) {
        cohortEtc = cur;
        break;
      }
    }
  }

  return { planEnd, cohortEtc, onTrack, atRisk, avgDelayDays, perStudent };
}

// ── Pace bands (3-way ahead/mid/behind split by lessons done) ────────────

export interface PaceBand {
  band: 'ahead' | 'mid' | 'behind';
  lo: number;
  hi: number;
  students: Student[];
}

/** V2's 3-band split: divides the done-count spread into thirds. */
export function paceBands(students: readonly Student[]): PaceBand[] {
  if (!students.length) return [];
  const dones = students.map((s) => s.done);
  const leaderDone = Math.max(...dones);
  const lagDone = Math.min(...dones);
  const spread = Math.max(leaderDone - lagDone, 1);
  const step = Math.max(Math.ceil(spread / 3), 1);
  const aheadLo = leaderDone - step + 1;
  const midLo = leaderDone - 2 * step + 1;

  const ahead: Student[] = [];
  const mid: Student[] = [];
  const behind: Student[] = [];
  for (const s of students) {
    if (s.done >= aheadLo) ahead.push(s);
    else if (s.done >= midLo) mid.push(s);
    else behind.push(s);
  }
  return [
    { band: 'ahead', lo: aheadLo, hi: leaderDone, students: ahead },
    { band: 'mid', lo: midLo, hi: aheadLo - 1, students: mid },
    { band: 'behind', lo: lagDone, hi: midLo - 1, students: behind },
  ];
}
