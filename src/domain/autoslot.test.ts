import { describe, expect, it } from 'vitest';
import {
  autoPropose,
  bestSlotForStudent,
  reservationsAsFlights,
  seToAcType,
  type AutoContextBase,
  type AutoRequestBase,
  type AutoReservation,
} from './autoslot';
import { inferFiQualifications } from './slotfinder';
import type { Flight, Resource, Student } from './types';

function stu(p: Partial<Student> & { key: string; name: string; se: string }): Student {
  return {
    catcId: p.key,
    nick: p.nick ?? p.key,
    fi: '',
    fiFull: '',
    batch: 'AP127',
    done: 0,
    total: 96,
    remaining: 96,
    pct: 0,
    nextLesson: null,
    flown: [],
    ...p,
  };
}

function flight(p: Partial<Flight>): Flight {
  return {
    id: 'F',
    date: '2026-07-13',
    status: 'Pending',
    isSim: false,
    isStandby: false,
    start: '08:00',
    end: '09:00',
    durMin: 60,
    student: null,
    studentKey: null,
    instructor: 'FI ONE',
    batch: 'AP-127',
    batchKey: 'AP127',
    lesson: 'GL 01',
    lessonNorm: 'GL 01',
    cond: null,
    type: 'DA40TDI',
    tail: 'HS-TAA',
    tkoff: null,
    ldgTime: null,
    airborneMin: null,
    to: null,
    ldg: null,
    inst: null,
    ...p,
  };
}

const resources: Resource[] = [
  { tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false },
  { tail: 'HS-TBB', acType: 'DA40TDI', isMaint: false },
  { tail: 'HS-TCC', acType: 'DA40CS', isMaint: false },
];
// Both FIs qualified on both real types via history.
const quals = inferFiQualifications([
  flight({ instructor: 'FI ONE', type: 'DA40TDI' }),
  flight({ instructor: 'FI ONE', type: 'DA40CS' }),
  flight({ instructor: 'FI TWO', type: 'DA40TDI' }),
  flight({ instructor: 'FI TWO', type: 'DA40CS' }),
]);

const base: AutoRequestBase = {
  date: '2026-07-13',
  durationMin: 60,
  bufferMin: 15,
  searchStartMin: 390, // 06:30
  searchEndMin: 1080, // 18:00
};

describe('seToAcType', () => {
  it('normalizes roster SE to resource acType', () => {
    expect(seToAcType('DA40-TDI')).toBe('DA40TDI');
    expect(seToAcType('DA40-CS')).toBe('DA40CS');
  });
});

describe('bestSlotForStudent', () => {
  it('restricts tails to the SP roster aircraft type', () => {
    const s = stu({ key: 'A K.', name: 'Akaravit K.', se: 'DA40-CS' });
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [], quals };
    const best = bestSlotForStudent(s, base, ctx);
    // only HS-TCC is DA40CS
    expect(best).not.toBeNull();
    expect(best!.options.every((o) => o.tail === 'HS-TCC')).toBe(true);
  });

  it('returns the earliest valid start across all options', () => {
    const s = stu({ key: 'B K.', name: 'Bee K.', se: 'DA40-TDI' });
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [], quals };
    const best = bestSlotForStudent(s, base, ctx)!;
    expect(best.startMin).toBe(390); // 06:30, nothing in the way
  });

  it('returns null when the SP has no aircraft type match', () => {
    const s = stu({ key: 'C K.', name: 'Cee K.', se: 'DA42-NG' });
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [], quals };
    expect(bestSlotForStudent(s, base, ctx)).toBeNull();
  });
});

describe('reservationsAsFlights', () => {
  it('produces busy synthetic flights that block the same tail/FI/student', () => {
    const resv: AutoReservation[] = [
      { studentKey: 'A K.', studentName: 'Akaravit K.', nick: 'A-VIT', startMin: 420, durationMin: 60, fi: 'FI ONE', tail: 'HS-TAA', aircraftType: 'DA40TDI' },
    ];
    const fs = reservationsAsFlights(resv, '2026-07-13');
    expect(fs[0]).toMatchObject({ tail: 'HS-TAA', instructor: 'FI ONE', studentKey: 'A K.', start: '07:00', end: '08:00', status: 'Pending' });
  });
});

describe('autoPropose — ranking, status, cascade', () => {
  const students = [
    stu({ key: 'A K.', name: 'Akaravit K.', nick: 'A-VIT', se: 'DA40-TDI', done: 5 }),
    stu({ key: 'B K.', name: 'Bee K.', nick: 'B-EE', se: 'DA40-TDI', done: 10 }),
  ];

  it('keeps the given rank order and numbers ranks from 1', () => {
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [], quals };
    const props = autoPropose(students, [], base, ctx);
    expect(props.map((p) => p.rank)).toEqual([1, 2]);
    expect(props[0].student.key).toBe('A K.');
  });

  it('marks a SP who already has a real flight that day as scheduled', () => {
    const ctx: AutoContextBase = {
      dayFlights: [flight({ studentKey: 'A K.', student: 'Akaravit K.', status: 'Completed' })],
      resources,
      leaves: [],
      quals,
    };
    const props = autoPropose(students, [], base, ctx);
    expect(props.find((p) => p.student.key === 'A K.')!.status).toBe('scheduled');
  });

  it('marks a SP on leave', () => {
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [{ name: 'Bee K.', start: '2026-07-13', end: '2026-07-13' }], quals };
    const props = autoPropose(students, [], base, ctx);
    expect(props.find((p) => p.student.key === 'B K.')!.status).toBe('on-leave');
  });

  it('reflects a reservation as reserved and cascades busy state to others', () => {
    const ctx: AutoContextBase = { dayFlights: [], resources, leaves: [], quals };
    // Reserve A on the ONLY viable pairing by shrinking the fleet to one TDI tail
    const oneTail: AutoContextBase = { ...ctx, resources: [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false }] };
    const resv: AutoReservation[] = [
      { studentKey: 'A K.', studentName: 'Akaravit K.', nick: 'A-VIT', startMin: 390, durationMin: 690, fi: 'FI ONE', tail: 'HS-TAA', aircraftType: 'DA40TDI' },
    ];
    const props = autoPropose(students, resv, base, oneTail);
    const a = props.find((p) => p.student.key === 'A K.')!;
    const b = props.find((p) => p.student.key === 'B K.')!;
    expect(a.status).toBe('reserved');
    // A's reservation spans the whole search window on the only tail → B has no slot now,
    // but did in the baseline → cascade feedback shows the drop.
    expect(b.baselineOptions).toBeGreaterThan(0);
    expect(b.currentOptions).toBe(0);
    expect(b.status).toBe('no-slot');
  });
});
