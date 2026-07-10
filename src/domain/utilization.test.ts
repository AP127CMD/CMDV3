import { describe, expect, it } from 'vitest';
import { fmtHours, isSimType, metricMins, normTail, presetRange } from './utilization';
import type { Flight } from './types';

const f = (p: Partial<Flight>): Flight =>
  ({
    id: 'x',
    date: '2026-07-01',
    status: 'Completed',
    isSim: false,
    isStandby: false,
    start: null,
    end: null,
    durMin: 60,
    student: null,
    studentKey: null,
    instructor: null,
    batch: null,
    batchKey: null,
    lesson: null,
    lessonNorm: null,
    cond: null,
    type: null,
    tail: null,
    tkoff: null,
    ldgTime: null,
    airborneMin: 50,
    to: null,
    ldg: null,
    inst: null,
    ...p,
  }) as Flight;

describe('normTail', () => {
  it('normalizes registrations', () => {
    expect(normTail('HS TVG')).toBe('HS-TVG');
    expect(normTail('hstvg')).toBe('HS-TVG');
    expect(normTail('HS-TVG')).toBe('HS-TVG');
    expect(normTail(null)).toBe('UNKNOWN');
  });
});

describe('metricMins', () => {
  const curMap = { 'CDGL 04': 90, 'XC 01': 300 };
  it('block uses durMin', () => {
    expect(metricMins(f({ durMin: 75 }), 'block')).toBe(75);
  });
  it('airborne uses airborneMin', () => {
    expect(metricMins(f({ airborneMin: 42 }), 'airborne')).toBe(42);
  });
  it('effective substitutes curriculum plannedMins', () => {
    expect(metricMins(f({ lesson: 'XC 01', durMin: 60 }), 'effective', curMap)).toBe(300);
  });
  it('effective: split /1 gets full base planned, /2+ gets 0', () => {
    expect(metricMins(f({ lesson: 'CDGL 04/1', durMin: 45 }), 'effective', curMap)).toBe(90);
    expect(metricMins(f({ lesson: 'CDGL 04/2', durMin: 45 }), 'effective', curMap)).toBe(0);
  });
  it('effective: unknown lesson falls back to block', () => {
    expect(metricMins(f({ lesson: 'ZZZ 9', durMin: 45 }), 'effective', curMap)).toBe(45);
  });
});

describe('presetRange / helpers', () => {
  it('computes anchored ranges', () => {
    expect(presetRange('1d', '2026-07-10')).toEqual({ from: '2026-07-10', to: '2026-07-10' });
    expect(presetRange('7d', '2026-07-10')).toEqual({ from: '2026-07-04', to: '2026-07-10' });
    expect(presetRange('month', '2026-07-10')).toEqual({ from: '2026-07-01', to: '2026-07-10' });
  });
  it('formats hours', () => {
    expect(fmtHours(0)).toBe('—');
    expect(fmtHours(1.25)).toBe('1.3h');
  });
  it('detects sim types', () => {
    expect(isSimType('DA40_SIM')).toBe(true);
    expect(isSimType('DA40TDI')).toBe(false);
  });
});
