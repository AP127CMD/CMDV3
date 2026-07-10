// Day KPI computations, ported from V2 js/view-daily.js `stats` memo.
// Input is the already-filtered flight list for one day; hours use durMin.

import type { Flight } from './types';
import { isAP127Batch } from './batches';
import { minutesOf } from './dates';

export interface DayMix {
  sim: number;
  standby: number;
  completed: number;
  pending: number;
  canceled: number;
}

export interface DayStats {
  total: number;
  pending: number;
  completed: number;
  canceled: number;
  standby: number;
  sim: number;
  ap127: number;
  schedHours: number;
  flownHours: number;
  pendingHours: number;
  canceledHours: number;
  simHours: number;
  students: Set<string>;
  instructors: Set<string>;
  tails: Set<string>;
  batches: Set<string>;
  /** Mutually-exclusive buckets (STATUS_COLOR precedence) — each flight once. */
  mix: DayMix;
  completionRate: number | null; // completed / (completed+canceled) %
}

export function computeDayStats(flights: readonly Flight[]): DayStats {
  const s: DayStats = {
    total: 0,
    pending: 0,
    completed: 0,
    canceled: 0,
    standby: 0,
    sim: 0,
    ap127: 0,
    schedHours: 0,
    flownHours: 0,
    pendingHours: 0,
    canceledHours: 0,
    simHours: 0,
    students: new Set(),
    instructors: new Set(),
    tails: new Set(),
    batches: new Set(),
    mix: { sim: 0, standby: 0, completed: 0, pending: 0, canceled: 0 },
    completionRate: null,
  };
  for (const f of flights) {
    s.total++;
    if (f.status === 'Pending') s.pending++;
    if (f.status === 'Completed') s.completed++;
    if (f.status === 'Canceled') s.canceled++;
    if (f.isStandby) s.standby++;
    if (f.isSim) s.sim++;
    if (isAP127Batch(f.batch)) s.ap127++;
    if (f.isSim) s.mix.sim++;
    else if (f.isStandby) s.mix.standby++;
    else if (f.status === 'Completed') s.mix.completed++;
    else if (f.status === 'Canceled') s.mix.canceled++;
    else s.mix.pending++;
    const h = (f.durMin ?? 0) / 60;
    s.schedHours += h;
    if (f.status === 'Completed') s.flownHours += h;
    if (f.status === 'Pending') s.pendingHours += h;
    if (f.status === 'Canceled') s.canceledHours += h;
    if (f.isSim) s.simHours += h;
    if (f.student) s.students.add(f.student);
    if (f.instructor) s.instructors.add(f.instructor);
    if (f.tail) s.tails.add(f.tail);
    if (f.batch) s.batches.add(f.batch);
  }
  const outcome = s.completed + s.canceled;
  s.completionRate = outcome > 0 ? (s.completed / outcome) * 100 : null;
  return s;
}

export interface HourBucket {
  total: number;
  completed: number;
  ap127: number;
}

export interface HourlyPulse {
  hours: number[];
  buckets: Record<number, HourBucket>;
  max: number;
}

/** Flights-by-start-hour histogram, 06–21 (V2 schedule pulse). */
export function hourlyPulse(flights: readonly Flight[]): HourlyPulse {
  const hours: number[] = [];
  for (let h = 6; h <= 21; h++) hours.push(h);
  const buckets: Record<number, HourBucket> = Object.fromEntries(
    hours.map((h) => [h, { total: 0, completed: 0, ap127: 0 }]),
  );
  for (const f of flights) {
    const m = minutesOf(f.start);
    if (m == null) continue;
    const h = Math.floor(m / 60);
    if (!buckets[h]) continue;
    buckets[h].total++;
    if (f.status === 'Completed') buckets[h].completed++;
    if (isAP127Batch(f.batch)) buckets[h].ap127++;
  }
  const max = Math.max(1, ...hours.map((h) => buckets[h].total));
  return { hours, buckets, max };
}

/** The single hours function: block time only (encodes the durMin rule). */
export function blockHours(flights: readonly Flight[]): number {
  return flights.reduce((a, f) => a + (f.durMin ?? 0), 0) / 60;
}
