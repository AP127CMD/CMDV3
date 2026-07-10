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
