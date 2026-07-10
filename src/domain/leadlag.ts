// Batch / individual lead-lag history: cumulative actual − cumulative plan
// over time (V2 buildAP127HistBatch / buildAP127HistSolo). Positive = ahead
// of the curriculum baseline, negative = behind.

import type { CurriculumRow, Student } from './types';
import { dayRange } from './dates';
import { curriculumMinsFor, type LeadLagMode } from './progress-series';

export interface DeltaPoint {
  date: string;
  value: number;
}

export interface BatchLeadLagResult {
  points: DeltaPoint[];
  now: number;
  best: number;
  worst: number;
}

/** cumulative actual (batch total) − cumulative plan (curriculum × n), by day. */
export function batchLeadLag(
  students: readonly Student[],
  curriculum: readonly CurriculumRow[],
  mode: LeadLagMode,
  today: string,
): BatchLeadLagResult {
  const n = students.length || 1;
  const flownDates = students
    .flatMap((s) => s.flown.map((f) => f.date))
    .filter(Boolean)
    .sort();
  const start = flownDates[0] ?? today;
  const days = dayRange(start, today);

  const actualByDate: Record<string, number> = {};
  for (const s of students) {
    for (const f of s.flown) {
      if (!f.date || f.date > today) continue;
      const v = mode === 'hours' ? curriculumMinsFor(curriculum, f.lesson, f.actualMins) / 60 : 1;
      actualByDate[f.date] = (actualByDate[f.date] ?? 0) + v;
    }
  }
  const planByDate: Record<string, number> = {};
  for (const c of curriculum) {
    if (!c.plannedDate || c.plannedDate > today) continue;
    const v = mode === 'hours' ? ((c.plannedMins ?? 0) * n) / 60 : n;
    planByDate[c.plannedDate] = (planByDate[c.plannedDate] ?? 0) + v;
  }

  let rAct = 0;
  let rPlan = 0;
  const points: DeltaPoint[] = days.map((d) => {
    rAct += actualByDate[d] ?? 0;
    rPlan += planByDate[d] ?? 0;
    return { date: d, value: +(rAct - rPlan).toFixed(2) };
  });
  const values = points.map((p) => p.value);
  return {
    points,
    now: values.at(-1) ?? 0,
    best: values.length ? Math.max(...values) : 0,
    worst: values.length ? Math.min(...values) : 0,
  };
}

export interface IndividualSeries {
  student: Student;
  points: DeltaPoint[];
}

export interface IndividualLeadLagResult {
  days: string[];
  series: IndividualSeries[];
  avg: DeltaPoint[];
}

/** Per-student cumulative actual − cumulative plan, plus the batch average line. */
export function individualLeadLag(
  students: readonly Student[],
  curriculum: readonly CurriculumRow[],
  mode: LeadLagMode,
  today: string,
): IndividualLeadLagResult {
  const flownDates = students
    .flatMap((s) => s.flown.map((f) => f.date))
    .filter(Boolean)
    .sort();
  const start = flownDates[0] ?? today;
  const days = dayRange(start, today);

  const planByDate: Record<string, number> = {};
  for (const c of curriculum) {
    if (!c.plannedDate || c.plannedDate > today) continue;
    const v = mode === 'hours' ? (c.plannedMins ?? 0) / 60 : 1;
    planByDate[c.plannedDate] = (planByDate[c.plannedDate] ?? 0) + v;
  }
  let rPlan = 0;
  const planCum = days.map((d) => {
    rPlan += planByDate[d] ?? 0;
    return +rPlan.toFixed(2);
  });

  const series: IndividualSeries[] = students.map((s) => {
    const byDate: Record<string, number> = {};
    for (const f of s.flown) {
      if (!f.date || f.date > today) continue;
      const v = mode === 'hours' ? curriculumMinsFor(curriculum, f.lesson, f.actualMins) / 60 : 1;
      byDate[f.date] = (byDate[f.date] ?? 0) + v;
    }
    let rAct = 0;
    const points = days.map((d, i) => {
      rAct += byDate[d] ?? 0;
      return { date: d, value: +(rAct - planCum[i]).toFixed(2) };
    });
    return { student: s, points };
  });

  const avg: DeltaPoint[] = days.map((d, i) => {
    const vals = series.map((s) => s.points[i].value);
    const m = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { date: d, value: +m.toFixed(2) };
  });

  return { days, series, avg };
}
