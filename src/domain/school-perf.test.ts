import { describe, expect, it } from 'vitest';
import {
  buildDayMap,
  buildMonthMap,
  buildPlanMonths,
  buildSchoolCurMap,
  collectEffectiveFlights,
  collectHistoricalFlights,
  computeScorecard,
  recentDaysRange,
} from './school-perf';
import type { CurriculumRow, Student } from './types';

function stu(name: string, batch: string, flown: Array<[string, string, number]>): Student {
  return {
    catcId: name,
    name,
    key: name,
    nick: name,
    fi: '',
    fiFull: '',
    se: '',
    batch,
    done: flown.length,
    total: 10,
    remaining: 10 - flown.length,
    pct: 0,
    nextLesson: null,
    flown: flown.map(([lesson, date, mins]) => ({ lesson, lessonNorm: lesson, actualMins: mins, date })),
  };
}

describe('collectHistoricalFlights / collectEffectiveFlights', () => {
  const batches = {
    ap124: [stu('A', 'AP124', [['GL 01', '2026-07-01', 60]])],
    ap127: [
      stu('B', 'AP127', [
        ['GL 01', '2026-07-01', 55],
        ['CDIF(SIM) 10', '2026-07-02', 90],
      ]),
    ],
  };

  it('flattens flown records with batch key and SIM flag', () => {
    const recs = collectHistoricalFlights(batches);
    expect(recs).toHaveLength(3);
    const sim = recs.find((r) => r.mins === 90)!;
    expect(sim.isSim).toBe(true);
    expect(sim.batch).toBe('AP127');
  });

  it('effective mode substitutes curriculum planned minutes', () => {
    const curMap = { 'GL 01': 60 };
    const recs = collectEffectiveFlights(batches, curMap);
    // both GL 01 flights should read 60 (planned), not their actual 60/55
    const gl = recs.filter((r) => r.mins === 60);
    expect(gl.length).toBeGreaterThanOrEqual(2);
  });

  it('effective mode: split lesson /1 gets full planned, /2 gets zero', () => {
    const b = { ap127: [stu('C', 'AP127', [['X 1/1', '2026-07-01', 10], ['X 1/2', '2026-07-02', 10]])] };
    const curMap = { 'X 1': 80 };
    const recs = collectEffectiveFlights(b, curMap);
    expect(recs.find((r) => r.date === '2026-07-01')!.mins).toBe(80);
    expect(recs.find((r) => r.date === '2026-07-02')!.mins).toBe(0);
  });
});

describe('buildDayMap / buildMonthMap', () => {
  const records = [
    { date: '2026-07-01', batch: 'AP127' as const, mins: 60, isSim: false },
    { date: '2026-07-01', batch: 'AP127' as const, mins: 90, isSim: true },
    { date: '2026-07-03', batch: 'AP124' as const, mins: 60, isSim: false },
  ];

  it('includes every calendar day even with zero flights', () => {
    const days = buildDayMap(records, '2026-07-01', '2026-07-03');
    expect(days).toHaveLength(3);
    expect(days[1].n).toBe(0); // 07-02, no flights
  });

  it('separates sim from non-sim totals', () => {
    const days = buildDayMap(records, '2026-07-01', '2026-07-01');
    expect(days[0].n).toBe(1);
    expect(days[0].simN).toBe(1);
    expect(days[0].byBatch.AP127.h).toBeCloseTo(1);
    expect(days[0].byBatch.AP127.simH).toBeCloseTo(1.5);
  });

  it('rolls days up into months', () => {
    const months = buildMonthMap(records, '2026-07-01', '2026-07-03');
    expect(months).toHaveLength(1);
    expect(months[0].month).toBe('2026-07');
    expect(months[0].n).toBe(2);
    expect(months[0].byBatch.AP124.n).toBe(1);
  });
});

describe('buildSchoolCurMap / buildPlanMonths', () => {
  const cur127: CurriculumRow[] = [{ lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: '2026-07-01' }];
  const cur124: CurriculumRow[] = [{ lesson: 'X 01', lessonNorm: 'X 01', plannedMins: 90, plannedDate: '2026-08-01' }];

  it('merges curriculum minutes across batches', () => {
    const map = buildSchoolCurMap({ cur124, cur126: [], cur127 });
    expect(map['GL 01']).toBe(60);
    expect(map['X 01']).toBe(90);
  });

  it('computes planned flights/hours per month, scaled by student count', () => {
    const months = buildPlanMonths({ cur124, cur126: [], cur127 }, { AP124: 5, AP126: 0, AP127: 2 });
    const jul = months.find((m) => m.month === '2026-07')!;
    expect(jul.flights).toBe(2); // 2 AP127 students
    expect(jul.hours).toBeCloseTo((60 * 2) / 60);
    const aug = months.find((m) => m.month === '2026-08')!;
    expect(aug.flights).toBe(5);
  });
});

describe('computeScorecard', () => {
  it('computes achievement % over elapsed months only', () => {
    const monthActual = [
      { month: '2026-06', n: 45, h: 45, simN: 0, simH: 0, byBatch: {} as any },
      { month: '2026-07', n: 10, h: 10, simN: 0, simH: 0, byBatch: {} as any },
    ];
    const planMonths = [
      { month: '2026-06', flights: 50, hours: 50 },
      { month: '2026-07', flights: 50, hours: 50 },
      { month: '2026-08', flights: 50, hours: 50 }, // future — must be excluded
    ];
    const r = computeScorecard(monthActual, planMonths, '2026-07-15');
    expect(r.plannedFlights).toBe(100); // only June + July
    expect(r.actualFlights).toBe(55);
    expect(r.achievementFlightsPct).toBeCloseTo(55);
  });

  it('flags pace status by hours achievement thresholds', () => {
    const planMonths = [{ month: '2026-07', flights: 100, hours: 100 }];
    const onTrack = computeScorecard([{ month: '2026-07', n: 96, h: 96, simN: 0, simH: 0, byBatch: {} as any }], planMonths, '2026-07-31');
    expect(onTrack.paceStatus).toBe('on-track');
    const caution = computeScorecard([{ month: '2026-07', n: 85, h: 85, simN: 0, simH: 0, byBatch: {} as any }], planMonths, '2026-07-31');
    expect(caution.paceStatus).toBe('caution');
    const behind = computeScorecard([{ month: '2026-07', n: 50, h: 50, simN: 0, simH: 0, byBatch: {} as any }], planMonths, '2026-07-31');
    expect(behind.paceStatus).toBe('behind');
  });

  it('returns unknown pace status when there is no plan data', () => {
    const r = computeScorecard([], [], '2026-07-15');
    expect(r.paceStatus).toBe('unknown');
    expect(r.achievementHoursPct).toBeNull();
  });
});

describe('recentDaysRange', () => {
  it('returns n days ending at today, oldest first', () => {
    const r = recentDaysRange('2026-07-10', 5);
    expect(r).toEqual(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']);
  });
});
