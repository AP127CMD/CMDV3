import { describe, expect, it } from 'vitest';
import { buildFullRecord, buildUnifiedRoster, curriculumForBatch, progUpcoming } from './curriculumProg';
import type { CurriculumRow, Flight, NgtBatchStudent, Student } from './types';

const ap127Student: Student = {
  catcId: 'C1',
  name: 'Akaravit Khwanngam',
  key: 'AKARAVIT K.',
  nick: 'A-VIT',
  fi: 'W-CHAI',
  fiFull: 'Wachai C.',
  se: 'DA40-TDI',
  batch: 'AP127',
  done: 1,
  total: 3,
  remaining: 2,
  pct: 33.3,
  nextLesson: null,
  flown: [{ lesson: 'GL 01', lessonNorm: 'GL 01', actualMins: 60, date: '2026-07-01' }],
};

const ngtStudent: NgtBatchStudent = {
  catcId: 'C2',
  name: 'Bee Somchai',
  batch: 'AP124',
  done: 1,
  total: 2,
  flown: [{ lesson: 'GL 01', lessonNorm: 'GL 01', actualMins: 60, date: '2026-07-02' }],
};

describe('buildUnifiedRoster', () => {
  it('merges AP127 Student[] with other-batch NgtBatchStudent[], preserving nick/fi only for AP127', () => {
    const roster = buildUnifiedRoster([ap127Student], { ap124: [ngtStudent], ap126: [], ap129: [] });
    expect(roster).toHaveLength(2);
    const a = roster.find((s) => s.catcId === 'C1')!;
    const b = roster.find((s) => s.catcId === 'C2')!;
    expect(a.nick).toBe('A-VIT');
    expect(b.nick).toBe('');
    expect(b.batch).toBe('AP124');
    expect(b.pct).toBeCloseTo(50);
    expect(b.key).toBe('BEE S.');
  });
});

describe('curriculumForBatch', () => {
  const curricula = {
    cur124: [{ lesson: 'A124', lessonNorm: 'A124', plannedMins: 60, plannedDate: null }] as CurriculumRow[],
    cur126: [] as CurriculumRow[],
    cur127: [{ lesson: 'A127', lessonNorm: 'A127', plannedMins: 60, plannedDate: null }] as CurriculumRow[],
  };
  it('routes AP124/AP126 to their own curriculum', () => {
    expect(curriculumForBatch('AP124', curricula)).toEqual(curricula.cur124);
  });
  it('routes AP129 to AP127s curriculum (shared syllabus)', () => {
    expect(curriculumForBatch('AP129', curricula)).toEqual(curricula.cur127);
  });
});

describe('progUpcoming', () => {
  const roster = buildUnifiedRoster([ap127Student], { ap124: [], ap126: [], ap129: [] });
  const student = roster[0];
  const curriculum: CurriculumRow[] = [
    { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: null },
    { lesson: 'GL 02', lessonNorm: 'GL 02', plannedMins: 60, plannedDate: null },
  ];
  const flight = (p: Partial<Flight>): Flight =>
    ({
      id: 'f1', date: '2026-07-05', status: 'Pending', isSim: false, isStandby: false,
      start: '08:00', end: '09:00', durMin: 60, student: 'Akaravit K.', studentKey: 'AKARAVIT K.',
      instructor: 'W-CHAI', batch: 'AP127', batchKey: 'AP127', lesson: 'GL 02', lessonNorm: 'GL 02',
      cond: null, type: 'DA40TDI', tail: 'HS-TVA', tkoff: null, ldgTime: null, airborneMin: null,
      to: null, ldg: null, inst: null, ...p,
    }) as Flight;

  it('excludes already-flown lessons and matches remaining ones to a real Pending ops flight by name', () => {
    const upcoming = progUpcoming(student, curriculum, [flight({})]);
    expect(upcoming).toHaveLength(1); // GL 01 already flown
    expect(upcoming[0]).toMatchObject({ lesson: 'GL 02', date: '2026-07-05' });
  });

  it('marks a lesson TBC when no ops flight exists yet', () => {
    const upcoming = progUpcoming(student, curriculum, []);
    expect(upcoming[0].date).toBeNull();
  });

  it('never reads Student.planned (only checks flown[] + opsFlights)', () => {
    const withPlanned: Student = { ...ap127Student, planned: [{ lesson: 'FAKE FUTURE', finishDate: '2099-01-01' } as never] };
    const roster2 = buildUnifiedRoster([withPlanned], { ap124: [], ap126: [], ap129: [] });
    const upcoming = progUpcoming(roster2[0], curriculum, []);
    expect(upcoming.every((u) => u.lesson !== 'FAKE FUTURE')).toBe(true);
  });
});

describe('buildFullRecord', () => {
  const roster = buildUnifiedRoster([ap127Student], { ap124: [], ap126: [], ap129: [] });
  const student = roster[0];
  const curriculum: CurriculumRow[] = [
    { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: null },
    { lesson: 'GL 02', lessonNorm: 'GL 02', plannedMins: 60, plannedDate: null },
  ];
  const flight = (p: Partial<Flight>): Flight =>
    ({
      id: 'f1', date: '2026-07-05', status: 'Pending', isSim: false, isStandby: false,
      start: '08:00', end: '09:00', durMin: 60, student: 'Akaravit K.', studentKey: 'AKARAVIT K.',
      instructor: 'W-CHAI', batch: 'AP127', batchKey: 'AP127', lesson: 'GL 02', lessonNorm: 'GL 02',
      cond: null, type: 'DA40TDI', tail: 'HS-TVA', tkoff: null, ldgTime: null, airborneMin: null,
      to: null, ldg: null, inst: null, ...p,
    }) as Flight;

  it('marks the flown-only lesson as "prog" source and the ops-scheduled one as "sched"', () => {
    const rows = buildFullRecord(student, curriculum, [flight({})]);
    const gl01 = rows.find((r) => r.lesson === 'GL 01')!;
    const gl02 = rows.find((r) => r.lesson === 'GL 02')!;
    expect(gl01).toMatchObject({ status: 'Completed', src: 'prog' });
    expect(gl02).toMatchObject({ status: 'Scheduled', src: 'sched' });
  });

  it('marks a lesson flown in both PROG and OPS as "both", or "review" when they disagree', () => {
    const opsCompleted = flight({ lesson: 'GL 01', lessonNorm: 'GL 01', status: 'Completed', date: '2026-07-01', durMin: 60 });
    const agree = buildFullRecord(student, curriculum, [opsCompleted]);
    expect(agree.find((r) => r.lesson === 'GL 01')!.src).toBe('both');

    const opsDisagree = flight({ lesson: 'GL 01', lessonNorm: 'GL 01', status: 'Completed', date: '2026-07-10', durMin: 60 });
    const review = buildFullRecord(student, curriculum, [opsDisagree]);
    expect(review.find((r) => r.lesson === 'GL 01')!.src).toBe('review');
  });
});
