import { describe, expect, it } from 'vitest';
import { buildCurriculumMap, etcProjection, paceBands, paceMonitor } from './pace';
import type { CurriculumRow, Student } from './types';

const cur: CurriculumRow[] = [
  { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: '2026-07-01' },
  { lesson: 'GL 02', lessonNorm: 'GL 02', plannedMins: 60, plannedDate: '2026-07-10' },
  { lesson: 'GL 03', lessonNorm: 'GL 03', plannedMins: 60, plannedDate: '2026-07-20' },
];

function stu(name: string, done: string[]): Student {
  return {
    catcId: name,
    name,
    key: name,
    nick: name,
    fi: '',
    fiFull: '',
    se: '',
    batch: 'AP127',
    done: done.length,
    total: 3,
    remaining: 3 - done.length,
    pct: 0,
    nextLesson: null,
    flown: done.map((date, i) => ({
      lesson: cur[i]?.lesson ?? `X${i}`,
      lessonNorm: cur[i]?.lesson ?? `X${i}`,
      actualMins: 60,
      date,
    })),
  };
}

describe('paceMonitor', () => {
  const students = [stu('A', ['2026-07-05']), stu('B', ['2026-07-06'])];
  const curMap = buildCurriculumMap(cur);

  it('measures actual flights/hours within the range', () => {
    const r = paceMonitor(students, cur, curMap, '2026-07-10', 7, '2026-07-01');
    expect(r.actLessons).toBe(2);
    expect(r.actHrs).toBeCloseTo(2);
  });

  it('all-time range (0) spans from batchStart', () => {
    const r = paceMonitor(students, cur, curMap, '2026-07-10', 0, '2026-07-01');
    expect(r.rangeStart).toBe('2026-07-01');
    expect(r.rangeDays).toBe(9);
  });

  it('computes remaining batch hours/lessons and needed pace to planEnd', () => {
    const r = paceMonitor(students, cur, curMap, '2026-07-10', 7, '2026-07-01');
    // 2 students * 3 lessons = 6 total; 2 done -> 4 remaining
    expect(r.remLessonsBatch).toBe(4);
    expect(r.daysRemaining).toBe(10); // planEnd 07-20 - today 07-10
    expect(r.neededLessonsPerDay).toBeCloseTo(0.4);
  });
});

describe('etcProjection', () => {
  it('flags students whose projected finish is after plan end', () => {
    const students = [stu('Fast', ['2026-07-01', '2026-07-02', '2026-07-03']), stu('Slow', [])];
    const r = etcProjection(students, cur, buildCurriculumMap(cur), '2026-07-05', '2026-07-01');
    const fast = r.perStudent.find((p) => p.student.name === 'Fast')!;
    const slow = r.perStudent.find((p) => p.student.name === 'Slow')!;
    expect(fast.atRisk).toBe(false);
    expect(fast.etc).toBe('2026-07-05'); // already done (rem=0)
    expect(slow.atRisk).toBe(true); // never flown -> no pace -> at risk
    expect(slow.etc).toBeNull();
  });

  it('counts onTrack/atRisk and computes an average delay', () => {
    const students = [stu('Fast', ['2026-07-01', '2026-07-02', '2026-07-03']), stu('Slow', [])];
    const r = etcProjection(students, cur, buildCurriculumMap(cur), '2026-07-05', '2026-07-01');
    expect(r.onTrack + r.atRisk).toBe(2);
    expect(r.onTrack).toBe(1);
  });
});

describe('paceBands', () => {
  it('splits the cohort into ahead/mid/behind thirds by lessons done', () => {
    const students = [
      stu('A', ['2026-07-01', '2026-07-02', '2026-07-03']), // done 3
      stu('B', ['2026-07-01', '2026-07-02']), // done 2
      stu('C', []), // done 0
    ];
    const bands = paceBands(students);
    expect(bands).toHaveLength(3);
    expect(bands[0].band).toBe('ahead');
    expect(bands[0].students.map((s) => s.name)).toContain('A');
    expect(bands[2].band).toBe('behind');
    expect(bands[2].students.map((s) => s.name)).toContain('C');
  });

  it('returns empty for an empty cohort', () => {
    expect(paceBands([])).toEqual([]);
  });
});
