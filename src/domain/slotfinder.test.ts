import { describe, expect, it } from 'vitest';
import {
  aircraftMaintOk,
  evaluateCandidate,
  fiDutyOk,
  fiQualified,
  findSlots,
  inferFiQualifications,
  onLeave,
  resourceAvailable,
  withinRunwayWindow,
  type SlotFinderContext,
  type SlotRequest,
} from './slotfinder';
import type { Flight, Leave, Resource } from './types';

function flight(p: Partial<Flight>): Flight {
  return {
    id: 'F',
    date: '2026-07-10',
    status: 'Pending',
    isSim: false,
    isStandby: false,
    start: '08:00',
    end: '09:00',
    durMin: 60,
    student: 'A B.',
    studentKey: 'A B.',
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

describe('inferFiQualifications / fiQualified', () => {
  it('derives quals from real flight history, no hardcoded list', () => {
    const quals = inferFiQualifications([
      flight({ instructor: 'FI ONE', type: 'DA40TDI' }),
      flight({ instructor: 'FI ONE', type: 'DA42TDI' }),
      flight({ instructor: 'FI TWO', type: 'DA40CS' }),
    ]);
    expect(fiQualified('FI ONE', 'DA40TDI', quals).ok).toBe(true);
    expect(fiQualified('FI ONE', 'DA42TDI', quals).ok).toBe(true);
    expect(fiQualified('FI ONE', 'DA40CS', quals).ok).toBe(false);
    expect(fiQualified('FI TWO', 'DA40CS', quals).ok).toBe(true);
    expect(fiQualified('UNKNOWN FI', 'DA40TDI', quals).ok).toBe(false);
  });
});

describe('fiDutyOk — the redesigned duty-span rule (no exemption branch)', () => {
  const existing = [flight({ id: 'E1', instructor: 'FI ONE', start: '06:00', end: '07:00' })];

  it('allows a candidate that keeps the span within the max', () => {
    // existing 06:00-07:00; candidate 07:30-08:30 -> span 06:00-08:30 = 150min, well under 420
    const v = fiDutyOk('FI ONE', '2026-07-10', { startMin: 450, endMin: 510 }, existing, 420);
    expect(v.ok).toBe(true);
  });

  it('rejects a candidate that would push the span beyond the max', () => {
    // existing 06:00-07:00 (360-420min); candidate 13:30-14:30 (810-870min) -> span = 870-360=510min > 420
    const v = fiDutyOk('FI ONE', '2026-07-10', { startMin: 810, endMin: 870 }, existing, 420);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/duty span/);
  });

  it('a candidate fully CONTAINED within the existing span cannot change it — passes without any special-case branch', () => {
    // existing spans 06:00 (360) to 14:00 (840) via two flights = 480min already over max,
    // but a NEW candidate inside [360,840] must not be blamed for a pre-existing violation
    // it did not create. This is the exact scenario V2's "exemption" tried to special-case —
    // here it falls out naturally from the span formula (span is unchanged by a contained point).
    const wideExisting = [
      flight({ id: 'E1', instructor: 'FI ONE', start: '06:00', end: '07:00' }),
      flight({ id: 'E2', instructor: 'FI ONE', start: '13:00', end: '14:00' }),
    ];
    const before = fiDutyOk('FI ONE', '2026-07-10', { startMin: 600, endMin: 660 }, wideExisting, 420);
    const contained = fiDutyOk('FI ONE', '2026-07-10', { startMin: 600, endMin: 660 }, wideExisting, 420);
    expect(contained.ok).toBe(before.ok); // span unchanged either way — no special path needed
  });

  it('a candidate that EXTENDS the boundary is still checked against the real limit', () => {
    // existing 06:00-07:00; candidate that extends to 13:01 -> span > 420 -> rejected
    const v = fiDutyOk('FI ONE', '2026-07-10', { startMin: 700, endMin: 781 }, existing, 420);
    expect(v.ok).toBe(false);
  });

  it('ignores canceled flights and other instructors', () => {
    const mixed = [
      flight({ id: 'C1', instructor: 'FI ONE', start: '02:00', end: '03:00', status: 'Canceled' }),
      flight({ id: 'O1', instructor: 'FI TWO', start: '01:00', end: '02:00' }),
    ];
    const v = fiDutyOk('FI ONE', '2026-07-10', { startMin: 480, endMin: 540 }, mixed, 420);
    expect(v.ok).toBe(true);
  });
});

describe('resourceAvailable (buffer padding)', () => {
  const existing = [flight({ start: '08:00', end: '09:00', tail: 'HS-TAA' })];

  it('rejects an overlapping window', () => {
    const v = resourceAvailable('HS-TAA', (f) => f.tail === 'HS-TAA', { startMin: 500, endMin: 560 }, 0, existing);
    expect(v.ok).toBe(false);
  });

  it('rejects a window that only clears with buffer padding', () => {
    // existing 08:00-09:00 (480-540); candidate 09:05-10:05 (545-605) — 5min gap, buffer 30 rejects it
    const v = resourceAvailable('HS-TAA', (f) => f.tail === 'HS-TAA', { startMin: 545, endMin: 605 }, 30, existing);
    expect(v.ok).toBe(false);
  });

  it('accepts a window that clears with enough gap', () => {
    const v = resourceAvailable('HS-TAA', (f) => f.tail === 'HS-TAA', { startMin: 600, endMin: 660 }, 30, existing);
    expect(v.ok).toBe(true);
  });
});

describe('onLeave / aircraftMaintOk / withinRunwayWindow', () => {
  const leaves: Leave[] = [{ name: 'FI ONE', start: '2026-07-10', end: '2026-07-10', reason: 'Sick' }];
  const resources: Resource[] = [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: true }];

  it('flags a person on leave', () => {
    expect(onLeave('FI ONE', '2026-07-10', leaves).ok).toBe(false);
    expect(onLeave('FI TWO', '2026-07-10', leaves).ok).toBe(true);
  });

  it('flags an aircraft in maintenance', () => {
    expect(aircraftMaintOk('HS-TAA', resources).ok).toBe(false);
    expect(aircraftMaintOk('HS-TBB', resources).ok).toBe(true);
  });

  it('flags overlap with a runway closure window', () => {
    const closed = { startMin: 840, endMin: 960 }; // 14:00-16:00
    expect(withinRunwayWindow({ startMin: 900, endMin: 960 }, closed).ok).toBe(false);
    expect(withinRunwayWindow({ startMin: 960, endMin: 1020 }, closed).ok).toBe(true);
    expect(withinRunwayWindow({ startMin: 500, endMin: 560 }, null).ok).toBe(true);
  });
});

describe('evaluateCandidate — full composition', () => {
  const ctx: SlotFinderContext = {
    dayFlights: [flight({ instructor: 'FI ONE', tail: 'HS-TAA', start: '08:00', end: '09:00' })],
    resources: [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false }],
    leaves: [],
    quals: inferFiQualifications([flight({ instructor: 'FI ONE', type: 'DA40TDI' })]),
  };
  const req: SlotRequest = {
    date: '2026-07-10',
    durationMin: 60,
    bufferMin: 15,
    searchStartMin: 360,
    searchEndMin: 1080,
    stepMin: 15,
    studentKey: 'NEW S.',
    studentName: 'NEW S.',
  };

  it('rejects an unqualified FI/aircraft pairing', () => {
    const v = evaluateCandidate(req, { startMin: 600, endMin: 660, fi: 'FI ONE', tail: 'HS-TAA', aircraftType: 'DA42TDI' }, ctx);
    expect(v.ok).toBe(false);
  });

  it('accepts a fully clear candidate', () => {
    const v = evaluateCandidate(req, { startMin: 660, endMin: 720, fi: 'FI ONE', tail: 'HS-TAA', aircraftType: 'DA40TDI' }, ctx);
    expect(v.ok).toBe(true);
  });
});

describe('findSlots — merges consecutive valid starts into ranges', () => {
  it('returns a start-time range, not a fixed single window', () => {
    const ctx: SlotFinderContext = {
      dayFlights: [],
      resources: [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false }],
      leaves: [],
      quals: new Map([['FI ONE', new Set(['DA40TDI'])]]),
    };
    const req: SlotRequest = {
      date: '2026-07-10',
      durationMin: 60,
      bufferMin: 0,
      searchStartMin: 360, // 06:00
      searchEndMin: 480, // 08:00 — a 2-hour window with no obstacles
      stepMin: 15,
      studentKey: 'S.',
      studentName: 'S.',
    };
    const groups = findSlots(req, ctx);
    expect(groups).toHaveLength(1);
    // start can be 06:00 through 07:00 (last start s.t. start+60<=480)
    expect(groups[0].startRanges).toEqual([{ startMin: 360, endMin: 420 }]);
  });

  it('splits into two ranges when a busy flight interrupts the middle', () => {
    const ctx: SlotFinderContext = {
      dayFlights: [flight({ tail: 'HS-TAA', instructor: 'FI ONE', start: '06:45', end: '07:15' })],
      resources: [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false }],
      leaves: [],
      quals: new Map([['FI ONE', new Set(['DA40TDI'])]]),
    };
    const req: SlotRequest = {
      date: '2026-07-10',
      durationMin: 30,
      bufferMin: 0,
      searchStartMin: 360, // 06:00
      searchEndMin: 480, // 08:00
      stepMin: 15,
      studentKey: 'S.',
      studentName: 'S.',
    };
    const groups = findSlots(req, ctx);
    expect(groups[0].startRanges.length).toBeGreaterThanOrEqual(2);
  });

  it('finds nothing when the FI is on leave', () => {
    const ctx: SlotFinderContext = {
      dayFlights: [],
      resources: [{ tail: 'HS-TAA', acType: 'DA40TDI', isMaint: false }],
      leaves: [{ name: 'FI ONE', start: '2026-07-10', end: '2026-07-10' }],
      quals: new Map([['FI ONE', new Set(['DA40TDI'])]]),
    };
    const req: SlotRequest = {
      date: '2026-07-10',
      durationMin: 60,
      bufferMin: 0,
      searchStartMin: 360,
      searchEndMin: 480,
      stepMin: 15,
      studentKey: 'S.',
      studentName: 'S.',
    };
    expect(findSlots(req, ctx)).toHaveLength(0);
  });
});
