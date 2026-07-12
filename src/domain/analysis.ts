// School Analysis — pace/at-risk classification across all four batches
// (V2 renderAnalysis, view-program.js). A student's pace is their flown-lesson
// count inside the lookback window, judged against their OWN batch's median so
// batches at different curriculum phases aren't compared against each other.

import { addDays, dateDiff } from './dates';
import type { UnifiedStudent } from './curriculumProg';

export interface AnalysisStudent extends UnifiedStudent {
  recentN: number; // flown lessons inside the lookback window
  lastFlight: string | null;
  daysSinceLast: number | null;
}

export type PaceStatus = 'atrisk' | 'below' | 'slow' | 'onpace';

export function annotate(students: readonly UnifiedStudent[], today: string, lookbackDays: number): AnalysisStudent[] {
  const cutoff = addDays(today, -lookbackDays);
  return students.map((s) => {
    const past = s.flown.filter((f) => f.date && f.date <= today);
    const recentN = past.filter((f) => f.date >= cutoff).length;
    const lastFlight = past.map((f) => f.date).sort().at(-1) ?? null;
    const daysSinceLast = lastFlight ? dateDiff(today, lastFlight) : null;
    return { ...s, recentN, lastFlight, daysSinceLast };
  });
}

export interface BatchHealth {
  n: number;
  avgProgress: number;
  avgRecent: number;
  atRisk: number;
}

export function batchHealth(students: readonly AnalysisStudent[]): Record<string, BatchHealth> {
  const by = new Map<string, AnalysisStudent[]>();
  for (const s of students) (by.get(s.batch) ?? by.set(s.batch, []).get(s.batch)!).push(s);
  const out: Record<string, BatchHealth> = {};
  for (const [b, list] of by) {
    const n = list.length;
    out[b] = {
      n,
      avgProgress: n ? list.reduce((a, s) => a + s.pct, 0) / n : 0,
      avgRecent: n ? list.reduce((a, s) => a + s.recentN, 0) / n : 0,
      atRisk: list.filter((s) => s.daysSinceLast === null || s.daysSinceLast >= 14).length,
    };
  }
  return out;
}

/** Median recent-lesson count per batch — the pace yardstick. */
export function batchMedians(students: readonly AnalysisStudent[]): Record<string, number> {
  const by = new Map<string, number[]>();
  for (const s of students) (by.get(s.batch) ?? by.set(s.batch, []).get(s.batch)!).push(s.recentN);
  const out: Record<string, number> = {};
  for (const [b, ns] of by) {
    ns.sort((a, z) => a - z);
    const m = Math.floor(ns.length / 2);
    out[b] = ns.length ? (ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2) : 0;
  }
  return out;
}

export function paceStatus(s: AnalysisStudent, medians: Record<string, number>): PaceStatus {
  if (s.daysSinceLast === null || s.daysSinceLast >= 14) return 'atrisk';
  const med = medians[s.batch] ?? 0;
  if (med > 0 && s.recentN < med * 0.5) return 'below';
  if (med > 0 && s.recentN < med * 0.8) return 'slow';
  return 'onpace';
}

/** Mon–Fri average flights per weekday over [cutoff, today]. */
export function dowDistribution(
  records: ReadonlyArray<{ date: string }>,
  cutoff: string,
  today: string,
): { labels: string[]; avg: number[] } {
  const byDate = new Map<string, number>();
  for (const r of records) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
  const wdFlights = [0, 0, 0, 0, 0, 0, 0];
  const wdDays = [0, 0, 0, 0, 0, 0, 0];
  for (let d = cutoff; d <= today; d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    wdDays[wd]++;
    wdFlights[wd] += byDate.get(d) ?? 0;
  }
  const idx = [1, 2, 3, 4, 5];
  return {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    avg: idx.map((i) => (wdDays[i] > 0 ? +(wdFlights[i] / wdDays[i]).toFixed(1) : 0)),
  };
}

export interface LowWeek {
  weekStart: string; // Monday
  count: number;
  dropPct: number; // % below the period average
}

/** Weeks ≥25% below the period's weekly average (V2's alert rule). */
export function lowActivityWeeks(records: ReadonlyArray<{ date: string }>): { weeks: LowWeek[]; weeklyAvg: number } {
  const wkMap = new Map<string, number>();
  for (const r of records) {
    const d = new Date(r.date + 'T12:00:00Z');
    const wd = d.getUTCDay();
    const monday = addDays(r.date, -(wd === 0 ? 6 : wd - 1));
    wkMap.set(monday, (wkMap.get(monday) ?? 0) + 1);
  }
  const entries = [...wkMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const avg = entries.length ? entries.reduce((a, [, n]) => a + n, 0) / entries.length : 0;
  const weeks = entries
    .filter(([, n]) => n < avg * 0.75)
    .map(([weekStart, count]) => ({ weekStart, count, dropPct: avg > 0 ? Math.round((1 - count / avg) * 100) : 0 }));
  return { weeks, weeklyAvg: avg };
}
