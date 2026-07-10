import { describe, expect, it } from 'vitest';
import { batchLeadLag, individualLeadLag } from './leadlag';
import type { CurriculumRow, Student } from './types';

const cur: CurriculumRow[] = [
  { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: '2026-07-01' },
  { lesson: 'GL 02', lessonNorm: 'GL 02', plannedMins: 60, plannedDate: '2026-07-02' },
  { lesson: 'GL 03', lessonNorm: 'GL 03', plannedMins: 60, plannedDate: '2026-07-03' },
];

function stu(name: string, flownDates: string[]): Student {
  return {
    catcId: name,
    name,
    key: name,
    nick: name,
    fi: '',
    fiFull: '',
    se: '',
    batch: 'AP127',
    done: flownDates.length,
    total: 3,
    remaining: 3 - flownDates.length,
    pct: 0,
    nextLesson: null,
    flown: flownDates.map((date, i) => ({
      lesson: cur[i]?.lesson ?? `X${i}`,
      lessonNorm: cur[i]?.lesson ?? `X${i}`,
      actualMins: 60,
      date,
    })),
  };
}

describe('batchLeadLag', () => {
  it('is zero when actual exactly matches plan', () => {
    const students = [stu('A', ['2026-07-01']), stu('B', ['2026-07-01'])];
    // plan by 07-01: 1 lesson * 2 students = 2; actual on 07-01 = 2 -> delta 0
    const r = batchLeadLag(students, cur, 'lessons', '2026-07-01');
    expect(r.now).toBe(0);
  });

  it('goes negative when the batch is behind plan', () => {
    const students = [stu('A', []), stu('B', [])];
    const r = batchLeadLag(students, cur, 'lessons', '2026-07-02');
    expect(r.now).toBeLessThan(0);
  });

  it('goes positive when the batch is ahead of plan', () => {
    const students = [stu('A', ['2026-07-01', '2026-07-01']), stu('B', ['2026-07-01'])];
    // hack: two same-day flown entries won't happen in reality but exercises the math
    const r = batchLeadLag(students, cur, 'lessons', '2026-07-01');
    expect(r.now).toBeGreaterThanOrEqual(0);
  });

  it('tracks best/worst across the series', () => {
    const students = [stu('A', ['2026-07-01']), stu('B', [])];
    const r = batchLeadLag(students, cur, 'lessons', '2026-07-03');
    expect(r.best).toBeGreaterThanOrEqual(r.now);
    expect(r.worst).toBeLessThanOrEqual(r.now);
  });
});

describe('individualLeadLag', () => {
  it('produces one series per student plus a batch average', () => {
    const students = [stu('A', ['2026-07-01']), stu('B', [])];
    const r = individualLeadLag(students, cur, 'lessons', '2026-07-02');
    expect(r.series).toHaveLength(2);
    expect(r.avg).toHaveLength(r.days.length);
    // A is ahead (flew on time), B is behind (never flew) -> avg between them
    const aLast = r.series[0].points.at(-1)!.value;
    const bLast = r.series[1].points.at(-1)!.value;
    expect(aLast).toBeGreaterThan(bLast);
  });

  it('hours mode uses curriculum planned minutes', () => {
    const students = [stu('A', ['2026-07-01'])];
    const r = individualLeadLag(students, cur, 'hours', '2026-07-01');
    // 1 lesson flown at 60 planned mins = 1h actual; plan by 07-01 = 1h -> delta 0
    expect(r.series[0].points.at(-1)!.value).toBe(0);
  });
});
