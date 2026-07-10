import { describe, expect, it } from 'vitest';
import {
  behindSort,
  buildCurriculumMap,
  buildPlanDateMap,
  curriculumHours,
  dayDelta,
  idleDays,
  lastFlightDate,
  paceSort,
  plannedHoursAsOf,
  projectFinishDate,
  rankClass,
  studentHours,
  studentsAsOf,
} from './pace';
import type { CurriculumRow, Student } from './types';

const cur: CurriculumRow[] = [
  { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: '2026-05-01' },
  { lesson: 'CDGL 04', lessonNorm: 'CDGL 04', plannedMins: 90, plannedDate: '2026-05-10' },
  { lesson: 'IF 01', lessonNorm: 'IF 01', plannedMins: 120, plannedDate: '2026-06-01' },
];

function stu(p: Partial<Student>): Student {
  return {
    catcId: 'x',
    name: p.name ?? 'Test Student',
    key: 'TEST S.',
    nick: 'T-ST',
    fi: 'W-CHAI',
    fiFull: 'WUTTHICHAI L.',
    se: 'DA40-CS',
    batch: 'AP127',
    done: p.flown?.length ?? 0,
    total: 3,
    remaining: 3 - (p.flown?.length ?? 0),
    pct: 0,
    nextLesson: null,
    flown: [],
    ...p,
  };
}

const flown = (lesson: string, date: string, actualMins = 60) => ({
  lesson,
  lessonNorm: lesson,
  actualMins,
  date,
});

describe('studentsAsOf (time travel)', () => {
  const s = stu({
    flown: [flown('GL 01', '2026-05-01'), flown('CDGL 04', '2026-05-12'), flown('IF 01', '2026-06-02')],
    done: 3,
  });

  it('returns the original array in live mode', () => {
    const all = [s];
    expect(studentsAsOf(all, cur, null)).toBe(all);
  });

  it('clips flown and recomputes done/pct/remaining/nextLesson', () => {
    const [r] = studentsAsOf([s], cur, '2026-05-15');
    expect(r.done).toBe(2);
    expect(r.remaining).toBe(1);
    expect(r.pct).toBe(66.7);
    expect(r.nextLesson).toBe('IF 01');
    expect(r.flown.map((f) => f.lesson)).toEqual(['GL 01', 'CDGL 04']);
  });

  it('marks completed students COMPLETE', () => {
    const [r] = studentsAsOf([s], cur, '2026-06-30');
    expect(r.nextLesson).toBe('COMPLETE');
  });
});

describe('hours & plan math', () => {
  const curMap = buildCurriculumMap(cur);
  it('studentHours prefers curriculum plannedMins per lesson', () => {
    const s = stu({ flown: [flown('GL 01', '2026-05-01', 45), flown('ZZZ 99', '2026-05-02', 30)] });
    // GL 01 → 60 (planned), ZZZ 99 unknown → 30 actual
    expect(studentHours(s, curMap)).toBeCloseTo(1.5);
  });
  it('curriculumHours sums plannedMins', () => {
    expect(curriculumHours(cur)).toBeCloseTo(4.5);
  });
  it('plannedHoursAsOf accumulates by plannedDate', () => {
    expect(plannedHoursAsOf(cur, '2026-05-10')).toBeCloseTo(2.5);
    expect(plannedHoursAsOf(cur, '2026-04-30')).toBe(0);
  });
});

describe('idle & sorts', () => {
  const a = stu({ name: 'A', flown: [flown('GL 01', '2026-07-01')], done: 1 });
  const b = stu({ name: 'B', flown: [flown('GL 01', '2026-07-08')], done: 1 });
  const c = stu({ name: 'C', flown: [], done: 0 });

  it('idleDays measures from asOf; never-flown = 9999', () => {
    expect(idleDays(a, '2026-07-10')).toBe(9);
    expect(idleDays(b, '2026-07-10')).toBe(2);
    expect(idleDays(c, '2026-07-10')).toBe(9999);
    expect(lastFlightDate(c)).toBe('');
  });

  it('paceSort: done desc then idle asc; behindSort inverse', () => {
    expect(paceSort([a, b, c], '2026-07-10').map((s) => s.name)).toEqual(['B', 'A', 'C']);
    expect(behindSort([a, b, c], '2026-07-10').map((s) => s.name)).toEqual(['C', 'A', 'B']);
  });
});

describe('dayDelta', () => {
  const planMap = buildPlanDateMap(cur);
  it('today − planned date of last completed lesson', () => {
    const s = stu({ flown: [flown('CDGL 04', '2026-05-12')] });
    expect(dayDelta(s, planMap, '2026-05-20')).toBe(10);
  });
  it('null when never flown or lesson unknown', () => {
    expect(dayDelta(stu({ flown: [] }), planMap, '2026-05-20')).toBeNull();
    expect(dayDelta(stu({ flown: [flown('ZZZ', '2026-05-12')] }), planMap, '2026-05-20')).toBeNull();
  });
});

describe('rankClass / projectFinishDate', () => {
  it('bands ranks', () => {
    expect(rankClass(1, 28)).toBe('bad');
    expect(rankClass(4, 28)).toBe('mid');
    expect(rankClass(20, 28)).toBe('ok');
  });
  it('projects across workable days only', () => {
    // 1 lesson/workday from Fri 2026-07-10, 3 remaining:
    // Sat/Sun skipped → Mon 13, Tue 14, Wed 15
    expect(projectFinishDate(3, 1, '2026-07-10')).toBe('2026-07-15');
    expect(projectFinishDate(0, 1, '2026-07-10')).toBe('2026-07-10');
    expect(projectFinishDate(3, 0, '2026-07-10')).toBeNull();
  });
});
