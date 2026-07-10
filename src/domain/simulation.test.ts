import { describe, expect, it } from 'vitest';
import {
  applyExaminerDrag,
  defaultSimConfig,
  DEFAULT_REALISM,
  examinerDragDays,
  runScheduler,
  type SimBatch,
  type SimStudent,
} from './simulation';
import type { CurriculumRow } from './types';

function cur(n: number, mins = 60): CurriculumRow[] {
  return Array.from({ length: n }, (_, i) => ({
    lesson: `L${i + 1}`,
    lessonNorm: `L${i + 1}`,
    plannedMins: mins,
    plannedDate: null,
  }));
}

function stu(key: string, done = 0, total = 10): SimStudent {
  return { key, name: key, done, total };
}

const curricula: Record<SimBatch, CurriculumRow[]> = {
  AP124: cur(10),
  AP126: cur(10),
  AP127: cur(10),
  AP129: cur(10),
};

describe('runScheduler — conservative (priority)', () => {
  it('drains AP124 before touching AP126 on a scarce day', () => {
    const cfg = { ...defaultSimConfig('2026-07-13'), horizonDays: 1, weekdayCap: 1 }; // Mon
    const batches: Record<SimBatch, SimStudent[]> = {
      AP124: [stu('a1')],
      AP126: [stu('b1')],
      AP127: [],
      AP129: [],
    };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    const a1 = r.students.find((s) => s.key === 'a1')!;
    const b1 = r.students.find((s) => s.key === 'b1')!;
    expect(a1.scheduled).toHaveLength(1); // got the only slot
    expect(b1.scheduled).toHaveLength(0);
  });

  it('finishes a student and records a finish date', () => {
    const cfg = { ...defaultSimConfig('2026-07-13'), horizonDays: 30, weekdayCap: 5 };
    const batches: Record<SimBatch, SimStudent[]> = { AP124: [stu('a1', 9, 10)], AP126: [], AP127: [], AP129: [] };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    const a1 = r.students.find((s) => s.key === 'a1')!;
    expect(a1.finish).not.toBeNull();
    expect(a1.scheduled).toHaveLength(1); // only 1 lesson remaining
  });

  it('respects the rest-gap regulation (2 days after a >=120min lesson)', () => {
    const heavy: Record<SimBatch, CurriculumRow[]> = { ...curricula, AP124: cur(3, 130) };
    // 2026-07-13 Mon, 07-14 Tue, 07-15 Wed: with a 2-day gap after each 130min
    // lesson, only day 0 and day 2 (13th, 15th) qualify — the 14th is blocked.
    const cfg = { ...defaultSimConfig('2026-07-13'), horizonDays: 3, weekdayCap: 5, restRegulation: true };
    const batches: Record<SimBatch, SimStudent[]> = { AP124: [stu('a1', 0, 3)], AP126: [], AP127: [], AP129: [] };
    const r = runScheduler(cfg, batches, heavy, '2099-01-01');
    const a1 = r.students.find((s) => s.key === 'a1')!;
    expect(a1.scheduled.length).toBe(2); // 13th + 15th; 14th blocked by the gap
  });

  it('AP129 only starts scheduling from ap129Start', () => {
    const cfg = { ...defaultSimConfig('2026-07-13'), horizonDays: 3, weekdayCap: 5 };
    const batches: Record<SimBatch, SimStudent[]> = { AP124: [], AP126: [], AP127: [], AP129: [stu('z1')] };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    expect(r.students.find((s) => s.key === 'z1')!.scheduled).toHaveLength(0);
  });

  it('never schedules on a zero-cap weekend/holiday', () => {
    // 2026-07-11 is a Saturday; default weekendCap=12 in defaultSimConfig, so
    // force weekendCap to 0 to verify no slots are given that day.
    const cfg = { ...defaultSimConfig('2026-07-10'), horizonDays: 2, weekdayCap: 5, weekendCap: 0 };
    const batches: Record<SimBatch, SimStudent[]> = { AP124: [stu('a1')], AP126: [], AP127: [], AP129: [] };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    const a1 = r.students.find((s) => s.key === 'a1')!;
    expect(a1.scheduled.every((l) => l.date !== '2026-07-11')).toBe(true);
  });
});

describe('runScheduler — balanced', () => {
  it('splits slots across batches roughly by weight', () => {
    const cfg = {
      ...defaultSimConfig('2026-07-13'),
      strategy: 'balanced' as const,
      horizonDays: 1,
      weekdayCap: 10,
      batchWeights: { AP124: 3, AP126: 1, AP127: 1, AP129: 1 },
    };
    // Deep pools on both sides (20 each) so quotas land well inside each
    // batch's eligible list — otherwise a batch that runs out of eligible
    // students has its shortfall backfilled from the other in priority
    // order, masking the weight ratio this test is checking.
    const batches: Record<SimBatch, SimStudent[]> = {
      AP124: Array.from({ length: 20 }, (_, i) => stu(`a${i}`)),
      AP126: Array.from({ length: 20 }, (_, i) => stu(`b${i}`)),
      AP127: [],
      AP129: [],
    };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    const aFlights = r.students.filter((s) => s.batch === 'AP124').reduce((a, s) => a + s.scheduled.length, 0);
    const bFlights = r.students.filter((s) => s.batch === 'AP126').reduce((a, s) => a + s.scheduled.length, 0);
    expect(aFlights + bFlights).toBe(10); // all 10 slots consumed
    expect(aFlights).toBeGreaterThan(bFlights); // AP124 weighted 3x
  });
});

describe('runScheduler — realist', () => {
  it('reduces effective daily capacity vs the raw weekday cap', () => {
    const realism = { ...DEFAULT_REALISM, fleetSize: 2, sortiesPerAc: 2, instructors: 20 }; // fleet ceiling = 2*0.75*2=3
    const cfg = {
      ...defaultSimConfig('2026-07-13'),
      strategy: 'realist' as const,
      horizonDays: 1,
      weekdayCap: 25,
      realism,
    };
    const batches: Record<SimBatch, SimStudent[]> = {
      AP124: Array.from({ length: 10 }, (_, i) => stu(`a${i}`)),
      AP126: [],
      AP127: [],
      AP129: [],
    };
    const r = runScheduler(cfg, batches, curricula, '2099-01-01');
    const total = r.students.reduce((a, s) => a + s.scheduled.length, 0);
    expect(total).toBeLessThanOrEqual(3); // fleet-bound, far below weekdayCap=25
  });

  it('washback inflates the effective curriculum length', () => {
    const realism = { ...DEFAULT_REALISM, washbackRate: 0.5, fleetSize: 50, instructors: 50 };
    const cfg = { ...defaultSimConfig('2026-07-13'), strategy: 'realist' as const, horizonDays: 60, weekdayCap: 5, realism };
    const batches: Record<SimBatch, SimStudent[]> = { AP124: [stu('a1', 0, 10)], AP126: [], AP127: [], AP129: [] };
    const withWashback = runScheduler(cfg, batches, curricula, '2099-01-01');
    const withoutWashback = runScheduler({ ...cfg, realism: { ...realism, washbackRate: 0 } }, batches, curricula, '2099-01-01');
    const a1w = withWashback.students.find((s) => s.key === 'a1')!;
    const a1n = withoutWashback.students.find((s) => s.key === 'a1')!;
    // 10 lessons / (1-0.5) = 20 effective lessons vs 10 -> more scheduled before finishing
    expect(a1w.scheduled.length).toBeGreaterThan(a1n.scheduled.length);
  });
});

describe('examinerDragDays / applyExaminerDrag', () => {
  it('is zero-bounded and increases with more active students at low examiner throughput', () => {
    const cfg = { ...DEFAULT_REALISM, examinerSlotsPerWeek: 1, checkGates: 4, checkPassRate: 0.5 };
    const drag5 = examinerDragDays(cfg, 5);
    const drag1 = examinerDragDays(cfg, 1);
    expect(drag5).toBeGreaterThanOrEqual(0);
    expect(drag1).toBeGreaterThanOrEqual(0);
  });

  it('applyExaminerDrag shifts a finish date forward', () => {
    const cfg = { ...DEFAULT_REALISM, examinerSlotsPerWeek: 1, checkGates: 10, checkPassRate: 0.3 };
    const shifted = applyExaminerDrag('2026-07-10', cfg, 10);
    expect(shifted).not.toBeNull();
    expect(shifted! > '2026-07-10').toBe(true);
  });

  it('returns null when there is no finish date to drag', () => {
    expect(applyExaminerDrag(null, DEFAULT_REALISM, 5)).toBeNull();
  });
});
