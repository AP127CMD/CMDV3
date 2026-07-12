import { describe, expect, it } from 'vitest';
import { annotate, batchHealth, batchMedians, dowDistribution, lowActivityWeeks, paceStatus } from './analysis';
import type { UnifiedStudent } from './curriculumProg';

const TODAY = '2026-07-12';

function stu(p: Partial<UnifiedStudent> & { name: string; batch: string }): UnifiedStudent {
  return {
    catcId: p.name,
    nick: '',
    fi: '',
    done: 10,
    total: 96,
    pct: 10,
    remaining: 86,
    flown: [],
    key: p.name,
    ...p,
  };
}

const fl = (date: string) => ({ date, lesson: 'GL 01', lessonNorm: 'GL 01', actualMins: 60 });

describe('annotate', () => {
  it('counts lookback flights and days since last', () => {
    const [a] = annotate([stu({ name: 'A', batch: 'AP127', flown: [fl('2026-07-01'), fl('2026-05-01')] })], TODAY, 30);
    expect(a.recentN).toBe(1); // only the July flight is inside 30d
    expect(a.lastFlight).toBe('2026-07-01');
    expect(a.daysSinceLast).toBe(11);
  });

  it('never-flown student has null last flight', () => {
    const [a] = annotate([stu({ name: 'B', batch: 'AP127' })], TODAY, 30);
    expect(a.daysSinceLast).toBeNull();
  });
});

describe('paceStatus', () => {
  const students = annotate(
    [
      stu({ name: 'FAST', batch: 'AP127', flown: [fl('2026-07-10'), fl('2026-07-09'), fl('2026-07-08'), fl('2026-07-07')] }),
      stu({ name: 'MID', batch: 'AP127', flown: [fl('2026-07-10'), fl('2026-07-09'), fl('2026-07-08')] }),
      stu({ name: 'SLOW', batch: 'AP127', flown: [fl('2026-07-10'), fl('2026-07-01')] }),
      stu({ name: 'IDLE', batch: 'AP127', flown: [fl('2026-06-01')] }),
    ],
    TODAY,
    30,
  );
  const meds = batchMedians(students);

  it('flags 14+ days idle as at-risk regardless of pace', () => {
    expect(paceStatus(students.find((s) => s.name === 'IDLE')!, meds)).toBe('atrisk');
  });
  it('classifies against the batch median', () => {
    // median of [4,3,2,1] = 2.5 → FAST/MID ≥ 80% = onpace; SLOW(2) = 2/2.5 = 80% → onpace boundary
    expect(paceStatus(students.find((s) => s.name === 'FAST')!, meds)).toBe('onpace');
    expect(paceStatus(students.find((s) => s.name === 'SLOW')!, meds)).toBe('onpace');
  });
});

describe('batchHealth', () => {
  it('aggregates per batch', () => {
    const students = annotate(
      [
        stu({ name: 'A', batch: 'AP127', pct: 20, flown: [fl('2026-07-10')] }),
        stu({ name: 'B', batch: 'AP127', pct: 40, flown: [fl('2026-05-01')] }),
        stu({ name: 'C', batch: 'AP126', pct: 80, flown: [fl('2026-07-10')] }),
      ],
      TODAY,
      30,
    );
    const h = batchHealth(students);
    expect(h.AP127.n).toBe(2);
    expect(h.AP127.avgProgress).toBe(30);
    expect(h.AP127.atRisk).toBe(1); // B idle since May
    expect(h.AP126.atRisk).toBe(0);
  });
});

describe('dowDistribution', () => {
  it('averages flights per weekday Mon–Fri', () => {
    // 2026-07-06 = Monday, 2026-07-07 = Tuesday
    const { labels, avg } = dowDistribution([{ date: '2026-07-06' }, { date: '2026-07-06' }, { date: '2026-07-07' }], '2026-07-06', '2026-07-12');
    expect(labels[0]).toBe('Mon');
    expect(avg[0]).toBe(2);
    expect(avg[1]).toBe(1);
    expect(avg[2]).toBe(0);
  });
});

describe('lowActivityWeeks', () => {
  it('flags weeks 25%+ below average', () => {
    const rec = [
      ...Array.from({ length: 10 }, () => ({ date: '2026-06-29' })), // week A: 10
      ...Array.from({ length: 10 }, () => ({ date: '2026-07-06' })), // week B: 10
      { date: '2026-07-12' }, // week of 2026-07-06? no — 07-12 is Sunday of week B... actually 07-12 is Sunday → Monday 07-06
    ];
    const { weeks, weeklyAvg } = lowActivityWeeks(rec);
    expect(weeklyAvg).toBeCloseTo(10.5);
    expect(weeks).toHaveLength(0);
    const rec2 = [...rec, { date: '2026-06-22' }]; // week of 06-22: 1 flight → far below avg
    const r2 = lowActivityWeeks(rec2);
    expect(r2.weeks.map((w) => w.weekStart)).toContain('2026-06-22');
  });
});
