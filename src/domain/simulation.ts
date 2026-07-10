// Unified Simulation engine — consolidates V2's three separate schedulers
// (Simulation/Sim2/Sim3) into ONE model with a strategy switch, per user
// direction ("Simulation should be one complete tab, not three"). This is
// the ONLY place in the app where a simulated/projected schedule may be
// computed or displayed — see domain/upcoming.ts for the project-wide rule
// that every other view must use the real ops schedule instead.

import { addDays, dayNumber } from './dates';
import { isWorkableDay, isHoliday } from './holidays';
import type { CurriculumRow } from './types';

export type SchedulingStrategy = 'conservative' | 'balanced' | 'realist';
export const SIM_BATCHES = ['AP124', 'AP126', 'AP127', 'AP129'] as const;
export type SimBatch = (typeof SIM_BATCHES)[number];

export interface SimStudent {
  key: string;
  name: string;
  done: number;
  total: number;
}

export interface RealismConfig {
  fleetSize: number;
  availability: number; // 0-1, fraction of fleet up each day
  sortiesPerAc: number;
  instructors: number;
  instructorAvail: number;
  sortiesPerInstr: number;
  weatherByMonth: Record<number, number>; // 1-12 -> cancellation fraction
  washbackRate: number; // 0-1
  attritionPerPhase: number; // 0-1
  phases: number;
  examinerSlotsPerWeek: number;
  checkGates: number;
  checkPassRate: number; // 0-1
}

export const DEFAULT_REALISM: RealismConfig = {
  fleetSize: 12,
  availability: 0.75,
  sortiesPerAc: 4,
  instructors: 14,
  instructorAvail: 0.85,
  sortiesPerInstr: 2,
  weatherByMonth: { 1: 0.1, 2: 0.1, 3: 0.15, 4: 0.15, 5: 0.25, 6: 0.3, 7: 0.35, 8: 0.4, 9: 0.35, 10: 0.25, 11: 0.15, 12: 0.1 },
  washbackRate: 0.15,
  attritionPerPhase: 0.04,
  phases: 4,
  examinerSlotsPerWeek: 5,
  checkGates: 4,
  checkPassRate: 0.85,
};

export interface SimConfig {
  strategy: SchedulingStrategy;
  startDate: string;
  horizonDays: number;
  weekdayCap: number; // flights/day (hourMode off) — kept simple: flights only
  weekendCap: number;
  holidayCap: number;
  restRegulation: boolean;
  /** balanced only */
  batchWeights: Record<SimBatch, number>;
  /** conservative only: override priority order (defaults AP124,AP126,AP127,AP129) */
  priorityOrder?: SimBatch[];
  realism?: RealismConfig;
}

export function defaultSimConfig(startDate: string): SimConfig {
  return {
    strategy: 'conservative',
    startDate,
    horizonDays: 400,
    weekdayCap: 25,
    weekendCap: 12,
    holidayCap: 12,
    restRegulation: false,
    batchWeights: { AP124: 1, AP126: 1, AP127: 1, AP129: 1 },
  };
}

interface OpDay {
  date: string;
  cap: number;
  isWE: boolean;
  isHol: boolean;
}

function operatingDays(cfg: SimConfig): OpDay[] {
  const days: OpDay[] = [];
  let cur = cfg.startDate;
  const month = (d: string) => parseInt(d.slice(5, 7), 10);
  for (let i = 0; i < cfg.horizonDays; i++) {
    const workable = isWorkableDay(cur);
    const hol = isHoliday(cur);
    const we = !workable && !hol;
    let cap = workable ? cfg.weekdayCap : hol ? cfg.holidayCap : we ? cfg.weekendCap : 0;
    if (cfg.strategy === 'realist' && cfg.realism) {
      const weather = 1 - (cfg.realism.weatherByMonth[month(cur)] ?? 0);
      const fleetCeiling = cfg.realism.fleetSize * cfg.realism.availability * cfg.realism.sortiesPerAc;
      const instrCeiling = cfg.realism.instructors * cfg.realism.instructorAvail * cfg.realism.sortiesPerInstr;
      cap = Math.floor(weather * Math.min(cap, fleetCeiling, instrCeiling));
    }
    days.push({ date: cur, cap, isWE: we, isHol: hol });
    cur = addDays(cur, 1);
  }
  return days;
}

interface StudentState {
  key: string;
  name: string;
  batch: SimBatch;
  doneIdx: number; // index into that batch's curriculum
  lastFlightDay: number | null; // day-number of last scheduled lesson
  lastMins: number;
}

export interface ScheduledLesson {
  date: string;
  lesson: string;
  mins: number;
}

export interface StudentProjection {
  key: string;
  name: string;
  batch: SimBatch;
  scheduled: ScheduledLesson[];
  finish: string | null; // null = not finished within horizon
}

export interface MonthCapacity {
  month: string;
  byBatch: Record<SimBatch, number>; // flights consumed
  total: number;
}

export interface SchedulerResult {
  students: StudentProjection[];
  monthly: MonthCapacity[];
  finishByBatch: Record<SimBatch, string | null>; // latest finish per batch
  overallFinish: string | null;
  atRiskCount: number; // students not finished within horizon
}

/** Rest-gap in days required before a student's next lesson. */
function restGapDays(cfg: SimConfig, lastMins: number): number {
  return cfg.restRegulation && lastMins >= 120 ? 2 : 1;
}

/**
 * The unified scheduler. `strategy` picks the allocation rule:
 *  - conservative: fixed priority order, one batch drains before the next gets slots
 *  - balanced: slots split across batches proportional to batchWeights × eligible count
 *  - realist: same allocation as conservative, but operates over a REDUCED daily
 *    cap (weather/fleet/instructor ceiling) and an INFLATED curriculum (washback)
 */
export function runScheduler(
  cfg: SimConfig,
  batches: Record<SimBatch, readonly SimStudent[]>,
  curricula: Record<SimBatch, readonly CurriculumRow[]>,
  ap129Start: string,
): SchedulerResult {
  const days = operatingDays(cfg);
  const washback = cfg.strategy === 'realist' && cfg.realism ? cfg.realism.washbackRate : 0;

  // Effective curriculum length per batch (washback inflates lesson count).
  const curLenFor = (b: SimBatch): number => {
    const base = curricula[b]?.length ?? 0;
    if (!washback) return base;
    return Math.ceil(base * (1 / (1 - washback)));
  };

  const students: StudentState[] = [];
  for (const b of SIM_BATCHES) {
    for (const s of batches[b] ?? []) {
      students.push({ key: s.key, name: s.name, batch: b, doneIdx: s.done, lastFlightDay: null, lastMins: 0 });
    }
  }

  const priority = cfg.priorityOrder ?? (['AP124', 'AP126', 'AP127'] as SimBatch[]);
  const projections = new Map<string, StudentProjection>(
    students.map((s) => [s.key, { key: s.key, name: s.name, batch: s.batch, scheduled: [], finish: null }]),
  );
  const monthly = new Map<string, MonthCapacity>();

  for (const day of days) {
    if (day.cap <= 0) continue;
    let slots = day.cap;
    const dayNum = dayNumber(day.date);
    const eligibleFor = (b: SimBatch) =>
      students
        .filter((s) => s.batch === b && s.doneIdx < curLenFor(b))
        .filter((s) => s.batch !== 'AP129' || day.date >= ap129Start)
        .filter((s) => s.lastFlightDay == null || dayNum - s.lastFlightDay >= restGapDays(cfg, s.lastMins))
        .sort((a, b2) => curLenFor(a.batch) - a.doneIdx - (curLenFor(b2.batch) - b2.doneIdx)).reverse();

    const allocate = (s: StudentState) => {
      if (slots <= 0) return false;
      const curArr = curricula[s.batch] ?? [];
      const lessonIdx = s.doneIdx % Math.max(curArr.length, 1);
      const row = curArr[lessonIdx];
      const lessonName = row?.lesson ?? `${s.batch} L${s.doneIdx + 1}`;
      const mins = row?.plannedMins ?? 60;
      const proj = projections.get(s.key)!;
      proj.scheduled.push({ date: day.date, lesson: lessonName, mins });
      s.doneIdx++;
      s.lastFlightDay = dayNum;
      s.lastMins = mins;
      slots--;
      const m = day.date.slice(0, 7);
      const agg = monthly.get(m) ?? { month: m, byBatch: { AP124: 0, AP126: 0, AP127: 0, AP129: 0 }, total: 0 };
      agg.byBatch[s.batch]++;
      agg.total++;
      monthly.set(m, agg);
      if (s.doneIdx >= curLenFor(s.batch) && !proj.finish) proj.finish = day.date;
      return true;
    };

    if (cfg.strategy === 'balanced') {
      const elig: Record<SimBatch, StudentState[]> = { AP124: [], AP126: [], AP127: [], AP129: [] };
      for (const b of SIM_BATCHES) elig[b] = eligibleFor(b);
      const totalW = SIM_BATCHES.reduce((a, b) => a + cfg.batchWeights[b] * elig[b].length, 0) || 1;
      for (const b of SIM_BATCHES) {
        const quota = Math.round((slots * (cfg.batchWeights[b] * elig[b].length)) / totalW);
        let given = 0;
        for (const s of elig[b]) {
          if (given >= quota || slots <= 0) break;
          if (allocate(s)) given++;
        }
      }
      // spend any leftover slots in priority order
      for (const b of [...priority, 'AP129'] as SimBatch[]) {
        for (const s of eligibleFor(b)) {
          if (slots <= 0) break;
          allocate(s);
        }
      }
    } else {
      for (const b of [...priority, 'AP129'] as SimBatch[]) {
        for (const s of eligibleFor(b)) {
          if (slots <= 0) break;
          allocate(s);
        }
      }
    }
  }

  const finishByBatch: Record<SimBatch, string | null> = { AP124: null, AP126: null, AP127: null, AP129: null };
  let atRiskCount = 0;
  for (const s of students) {
    const proj = projections.get(s.key)!;
    if (!proj.finish) atRiskCount++;
    else if (!finishByBatch[s.batch] || proj.finish > finishByBatch[s.batch]!) finishByBatch[s.batch] = proj.finish;
  }
  const overallFinish = SIM_BATCHES.map((b) => finishByBatch[b]).filter(Boolean).sort().at(-1) ?? null;

  return {
    students: [...projections.values()],
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    finishByBatch,
    overallFinish,
    atRiskCount,
  };
}

/** Examiner-queue finish-date drag, in days (V2 Sim3 formula, realist mode only). */
export function examinerDragDays(cfg: RealismConfig, activeStudents: number): number {
  const retakeMultiplier = 1 + (1 - cfg.checkPassRate);
  const demand = cfg.checkGates * retakeMultiplier * activeStudents;
  const weeksNeeded = demand / Math.max(1, cfg.examinerSlotsPerWeek);
  const drag = ((weeksNeeded * 7) / Math.max(1, activeStudents)) * Math.min(activeStudents, 6) * 0.5;
  return Math.max(0, Math.min(400, drag));
}

/** Apply examiner drag to a finish date. */
export function applyExaminerDrag(finish: string | null, cfg: RealismConfig, activeStudents: number): string | null {
  if (!finish) return null;
  return addDays(finish, Math.round(examinerDragDays(cfg, activeStudents)));
}
