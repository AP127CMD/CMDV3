import { describe, expect, it } from 'vitest';
import { upcomingLessons } from './upcoming';
import type { CurriculumRow, Flight, Student } from './types';

const cur: CurriculumRow[] = [
  { lesson: 'GL 01', lessonNorm: 'GL 01', plannedMins: 60, plannedDate: '2026-05-01' },
  { lesson: 'GL 02', lessonNorm: 'GL 02', plannedMins: 60, plannedDate: '2026-05-02' },
  { lesson: 'GL 03', lessonNorm: 'GL 03', plannedMins: 60, plannedDate: '2026-05-03' },
];

const student: Student = {
  catcId: 'x',
  name: 'Test Student',
  key: 'TEST S.',
  nick: 'T-ST',
  fi: '',
  fiFull: '',
  se: '',
  batch: 'AP127',
  done: 1,
  total: 3,
  remaining: 2,
  pct: 33.3,
  nextLesson: 'GL 02',
  flown: [{ lesson: 'GL 01', lessonNorm: 'GL 01', actualMins: 60, date: '2026-05-01' }],
  // Simulated scheduler output — must NEVER be read by upcomingLessons.
  planned: [
    { lesson: 'GL 02', date: '2099-01-01', mins: 60 },
    { lesson: 'GL 03', date: '2099-01-02', mins: 60 },
  ],
};

function flight(p: Partial<Flight>): Flight {
  return {
    id: 'F1',
    date: '2026-05-10',
    status: 'Pending',
    isSim: false,
    isStandby: false,
    start: '07:00',
    end: '08:00',
    durMin: 60,
    student: 'TEST S.',
    studentKey: 'TEST S.',
    instructor: null,
    batch: 'AP-127',
    batchKey: 'AP127',
    lesson: 'GL 02',
    lessonNorm: 'GL 02',
    cond: null,
    type: null,
    tail: null,
    tkoff: null,
    ldgTime: null,
    airborneMin: null,
    to: null,
    ldg: null,
    inst: null,
    ...p,
  };
}

describe('upcomingLessons', () => {
  it('returns remaining curriculum lessons, excluding flown ones', () => {
    const rows = upcomingLessons(student, cur, []);
    expect(rows.map((r) => r.lesson)).toEqual(['GL 02', 'GL 03']);
  });

  it('uses the REAL ops Pending flight date, never student.planned', () => {
    const rows = upcomingLessons(student, cur, [flight({})]);
    const gl02 = rows.find((r) => r.lesson === 'GL 02')!;
    expect(gl02.date).toBe('2026-05-10'); // real ops date
    expect(gl02.date).not.toBe('2099-01-01'); // NOT the simulated planned date
    expect(gl02.opsFlight).not.toBeNull();
  });

  it('marks lessons with no matching ops flight as TBC (null date)', () => {
    const rows = upcomingLessons(student, cur, []);
    const gl03 = rows.find((r) => r.lesson === 'GL 03')!;
    expect(gl03.date).toBeNull();
    expect(gl03.opsFlight).toBeNull();
  });

  it('ignores non-Pending or non-AP127 or other-student flights', () => {
    const rows = upcomingLessons(student, cur, [
      flight({ id: 'F2', status: 'Completed' }),
      flight({ id: 'F3', batch: 'AP-126' }),
      flight({ id: 'F4', studentKey: 'OTHER S.' }),
    ]);
    expect(rows.find((r) => r.lesson === 'GL 02')!.date).toBeNull();
  });

  it('picks the earliest Pending match when duplicates exist', () => {
    const rows = upcomingLessons(student, cur, [
      flight({ id: 'A', date: '2026-06-01' }),
      flight({ id: 'B', date: '2026-05-15' }),
    ]);
    expect(rows.find((r) => r.lesson === 'GL 02')!.date).toBe('2026-05-15');
  });
});
