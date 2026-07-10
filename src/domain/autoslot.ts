// Auto Slot Finder — the dispatcher workflow V2's Auto Slot Finder provides,
// rebuilt on the clean constraint engine (slotfinder.ts) + pace ranking
// (pace.ts). Ranks AP-127 SPs by curriculum pace (most-behind first), finds
// each one's earliest valid slot, and lets the dispatcher reserve them one by
// one — each reservation becoming "busy" for everyone searched after it
// (cascade feedback), so the proposal set stays internally consistent.
//
// This replaces the manual slot finder (single ad-hoc lookup). The underlying
// constraint predicates are unchanged and still independently testable.

import type { Flight, Leave, Resource, Student } from './types';
import { idleDays } from './pace';
import { findSlots, type SlotFinderContext, type SlotRequest, type TimeWindow } from './slotfinder';

/** "DA40-TDI" → "DA40TDI" so a SP's roster aircraft type matches a resource acType. */
export function seToAcType(se: string): string {
  return String(se ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

export interface AutoReservation {
  studentKey: string;
  studentName: string;
  nick: string;
  startMin: number;
  durationMin: number;
  fi: string;
  tail: string;
  aircraftType: string;
}

/** A reserved slot becomes a synthetic Pending flight so availability/duty checks see it. */
export function reservationsAsFlights(reservations: readonly AutoReservation[], date: string): Flight[] {
  return reservations.map((r, i) => ({
    id: `__RESERVED_${i}`,
    date,
    status: 'Pending' as const,
    isSim: false,
    isStandby: false,
    start: fmtMin(r.startMin),
    end: fmtMin(r.startMin + r.durationMin),
    durMin: r.durationMin,
    student: r.studentName,
    studentKey: r.studentKey,
    nick: r.nick,
    instructor: r.fi,
    batch: 'AP-127',
    batchKey: 'AP127',
    lesson: '(reserved)',
    lessonNorm: '(RESERVED)',
    cond: null,
    type: r.aircraftType,
    tail: r.tail,
    tkoff: null,
    ldgTime: null,
    airborneMin: null,
    to: null,
    ldg: null,
    inst: null,
  }));
}

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface SlotOption {
  fi: string;
  tail: string;
  aircraftType: string;
  earliestStart: number;
}

export interface BestSlot {
  startMin: number;
  endMin: number;
  fi: string;
  tail: string;
  aircraftType: string;
  /** All (FI, tail) pairs that have any valid slot, earliest-start first — the reserve picker's options. */
  options: SlotOption[];
}

export interface AutoRequestBase {
  date: string;
  durationMin: number;
  bufferMin: number;
  searchStartMin: number;
  searchEndMin: number;
  runwayClosed?: TimeWindow | null;
  candidateFIs?: readonly string[];
  candidateTails?: readonly string[];
  maxDutyMin?: number;
}

/** Earliest valid slot for one SP, restricted to their roster aircraft type. Null when none. */
export function bestSlotForStudent(student: Student, base: AutoRequestBase, ctx: SlotFinderContext): BestSlot | null {
  const acType = seToAcType(student.se);
  const typedTails = ctx.resources.filter((r) => seToAcType(r.acType) === acType).map((r) => r.tail);
  const tails = base.candidateTails?.length
    ? base.candidateTails.filter((t) => typedTails.includes(t))
    : typedTails;
  if (!tails.length) return null;

  const req: SlotRequest = {
    date: base.date,
    durationMin: base.durationMin,
    bufferMin: base.bufferMin,
    searchStartMin: base.searchStartMin,
    searchEndMin: base.searchEndMin,
    stepMin: 15,
    studentKey: student.key,
    studentName: student.name,
    candidateFIs: base.candidateFIs,
    candidateTails: tails,
    runwayClosed: base.runwayClosed ?? null,
    maxDutyMin: base.maxDutyMin,
  };

  const groups = findSlots(req, ctx);
  if (!groups.length) return null;

  const options: SlotOption[] = groups
    .map((g) => ({ fi: g.fi, tail: g.tail, aircraftType: g.aircraftType, earliestStart: g.startRanges[0].startMin }))
    .sort((a, b) => a.earliestStart - b.earliestStart || a.fi.localeCompare(b.fi));

  const best = options[0];
  return {
    startMin: best.earliestStart,
    endMin: best.earliestStart + base.durationMin,
    fi: best.fi,
    tail: best.tail,
    aircraftType: best.aircraftType,
    options,
  };
}

export type SpStatus = 'proposed' | 'reserved' | 'no-slot' | 'on-leave' | 'scheduled';

export interface SpProposal {
  student: Student;
  rank: number;
  idle: number;
  status: SpStatus;
  best: BestSlot | null;
  reservation: AutoReservation | null;
  /** Cascade feedback: how many options existed before any reservations vs. now. */
  baselineOptions: number;
  currentOptions: number;
}

export interface AutoContextBase {
  dayFlights: readonly Flight[];
  resources: readonly Resource[];
  leaves: readonly Leave[];
  quals: Map<string, Set<string>>;
}

/**
 * Ranked proposals for a list of SPs (already pace-sorted, most-behind first).
 * Reservations are injected as busy flights for un-reserved SPs (cascade); a
 * baseline pass (no reservations) powers the "blocked by earlier bookings" cue.
 */
export function autoPropose(
  rankedStudents: readonly Student[],
  reservations: readonly AutoReservation[],
  base: AutoRequestBase,
  ctxBase: AutoContextBase,
): SpProposal[] {
  const reservedByKey = new Map(reservations.map((r) => [r.studentKey, r]));
  const resvFlights = reservationsAsFlights(reservations, base.date);

  const ctxWithReservations: SlotFinderContext = {
    ...ctxBase,
    dayFlights: [...ctxBase.dayFlights, ...resvFlights],
  };
  const ctxBaseline: SlotFinderContext = { ...ctxBase };

  return rankedStudents.map((student, i) => {
    const rank = i + 1;
    const idle = idleDays(student, base.date);
    const existing = reservedByKey.get(student.key);

    // Already reserved this session
    if (existing) {
      return { student, rank, idle, status: 'reserved', best: null, reservation: existing, baselineOptions: 0, currentOptions: 0 };
    }
    // On leave that day
    if (ctxBase.leaves.some((l) => l.name === student.name && base.date >= l.start && base.date <= l.end)) {
      return { student, rank, idle, status: 'on-leave', best: null, reservation: null, baselineOptions: 0, currentOptions: 0 };
    }
    // Already has a real non-canceled flight scheduled that day
    if (
      ctxBase.dayFlights.some(
        (f) => f.status !== 'Canceled' && (f.studentKey === student.key || f.student === student.name),
      )
    ) {
      return { student, rank, idle, status: 'scheduled', best: null, reservation: null, baselineOptions: 0, currentOptions: 0 };
    }

    const baseline = bestSlotForStudent(student, base, ctxBaseline);
    const current = bestSlotForStudent(student, base, ctxWithReservations);
    return {
      student,
      rank,
      idle,
      status: current ? 'proposed' : 'no-slot',
      best: current,
      reservation: null,
      baselineOptions: baseline?.options.length ?? 0,
      currentOptions: current?.options.length ?? 0,
    };
  });
}
