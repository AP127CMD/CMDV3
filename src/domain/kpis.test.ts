import { describe, expect, it } from 'vitest';
import { blockHours, computeDayStats, hourlyPulse } from './kpis';
import type { Flight } from './types';

const f = (p: Partial<Flight>): Flight =>
  ({
    id: Math.random().toString(36).slice(2),
    date: '2026-07-10',
    status: 'Pending',
    isSim: false,
    isStandby: false,
    start: '07:00',
    end: '08:00',
    durMin: 60,
    student: 'A K.',
    studentKey: 'A K.',
    instructor: 'FI X.',
    batch: 'AP-127',
    batchKey: 'AP127',
    lesson: 'GL 01',
    lessonNorm: 'GL 01',
    cond: null,
    type: 'DA40TDI',
    tail: 'HS-TVG',
    tkoff: null,
    ldgTime: null,
    airborneMin: 55,
    to: null,
    ldg: null,
    inst: null,
    ...p,
  }) as Flight;

describe('computeDayStats', () => {
  const flights = [
    f({ status: 'Completed', durMin: 90 }),
    f({ status: 'Pending', isStandby: true, durMin: 60, batch: 'AP-126', batchKey: 'AP126' }),
    f({ status: 'Canceled', durMin: 30 }),
    f({ status: 'Completed', isSim: true, durMin: 120, tail: 'SIM-1' }),
  ];
  const s = computeDayStats(flights);

  it('counts overlapping status buckets', () => {
    expect(s.total).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.canceled).toBe(1);
    expect(s.standby).toBe(1);
    expect(s.sim).toBe(1);
    expect(s.ap127).toBe(3);
  });

  it('mutually-exclusive mix follows STATUS_COLOR precedence (sim > standby > status)', () => {
    expect(s.mix).toEqual({ sim: 1, standby: 1, completed: 1, pending: 0, canceled: 1 });
  });

  it('hours always use durMin (block time), never airborne', () => {
    expect(s.schedHours).toBeCloseTo(5);
    expect(s.flownHours).toBeCloseTo(3.5); // 90 + 120 sim, both Completed
    expect(s.pendingHours).toBeCloseTo(1);
    expect(s.canceledHours).toBeCloseTo(0.5);
    expect(s.simHours).toBeCloseTo(2);
  });

  it('completionRate = completed/(completed+canceled)', () => {
    expect(s.completionRate).toBeCloseTo((2 / 3) * 100);
  });

  it('null completionRate when no outcomes', () => {
    expect(computeDayStats([f({ status: 'Pending' })]).completionRate).toBeNull();
  });
});

describe('hourlyPulse', () => {
  it('buckets by start hour 06–21', () => {
    const p = hourlyPulse([f({ start: '07:15' }), f({ start: '07:45', status: 'Completed' }), f({ start: '22:30' })]);
    expect(p.buckets[7].total).toBe(2);
    expect(p.buckets[7].completed).toBe(1);
    expect(p.buckets[7].ap127).toBe(2);
    expect(p.max).toBe(2);
  });
});

describe('blockHours', () => {
  it('sums durMin only', () => {
    expect(blockHours([f({ durMin: 90, airborneMin: 10 }), f({ durMin: 30 })])).toBeCloseTo(2);
  });
});
