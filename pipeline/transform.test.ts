import { describe, expect, it } from 'vitest';
import { dedupeActualOnly, normalizeFlights, truncationCanary } from './transform';
import type { RawFlight } from './sources';

const rf = (p: Partial<RawFlight>): RawFlight =>
  ({
    id: p.id ?? 'BK-1',
    date: p.date ?? '2026-06-01',
    status: p.status ?? 'Pending',
    isSim: false,
    isStandby: false,
    student: 'SETASIT P.',
    lesson: 'CDGL 01',
    batch: 'AP-127',
    durMin: 60,
    ...p,
  }) as RawFlight;

describe('dedupeActualOnly', () => {
  it('removes the planned Completed twin by id', () => {
    const r = dedupeActualOnly([
      rf({ id: 'BK-1', status: 'Completed' }),
      rf({ id: 'ACTUAL_ONLY_BK-1_ACT_9', status: 'Completed', durMin: 67 }),
    ]);
    expect(r.flights.map((f) => f.id)).toEqual(['ACTUAL_ONLY_BK-1_ACT_9']);
    expect(r.removedById).toBe(1);
    expect(r.removedByKey).toBe(0);
  });

  it('falls back to student|date|lesson when the id drifted (and reports it)', () => {
    const r = dedupeActualOnly([
      rf({ id: 'BK-OLDFORMAT', status: 'Completed' }),
      rf({ id: 'ACTUAL_ONLY_BK-NEW_ACT_9', status: 'Completed' }),
    ]);
    expect(r.flights.map((f) => f.id)).toEqual(['ACTUAL_ONLY_BK-NEW_ACT_9']);
    expect(r.removedByKey).toBe(1);
    expect(r.fallbackSamples).toHaveLength(1);
  });

  it('never removes Pending/Canceled or unrelated Completed rows', () => {
    const r = dedupeActualOnly([
      rf({ id: 'BK-1', status: 'Pending' }),
      rf({ id: 'BK-2', status: 'Canceled', lesson: 'GL 09' }),
      rf({ id: 'BK-3', status: 'Completed', student: 'OTHER S.', lesson: 'XX 1' }),
      rf({ id: 'ACTUAL_ONLY_BK-9_ACT_1', status: 'Completed' }),
    ]);
    expect(r.flights).toHaveLength(4);
  });

  it('matches split-lesson suffixes via the /n strip (CDGL 04/1 vs CDGL 04)', () => {
    const r = dedupeActualOnly([
      rf({ id: 'BK-X', status: 'Completed', lesson: 'CDGL 04/1' }),
      rf({ id: 'ACTUAL_ONLY_BK-Y_ACT_1', status: 'Completed', lesson: 'CDGL 04' }),
    ]);
    expect(r.flights.map((f) => f.id)).toEqual(['ACTUAL_ONLY_BK-Y_ACT_1']);
  });
});

describe('normalizeFlights', () => {
  const students = [{ name: 'Setasit Pittayathikhun', nick: 'S-SIT' }];

  it('strips (Unplanned), flags it, and keeps the raw value', () => {
    const { flights, transforms } = normalizeFlights(
      [rf({ student: 'SETASIT P. (Unplanned)' })],
      students,
    );
    expect(flights[0].student).toBe('SETASIT P.');
    expect(flights[0].studentRaw).toBe('SETASIT P. (Unplanned)');
    expect(flights[0].flags?.unplanned).toBe(true);
    expect(transforms.unplannedStripped).toBe(1);
  });

  it('bridges callsigns to studentKey and resolves the nick', () => {
    const { flights, transforms } = normalizeFlights([rf({ student: 'S-SIT' })], students);
    expect(flights[0].studentKey).toBe('SETASIT P.');
    expect(flights[0].nick).toBe('S-SIT');
    expect(transforms.nickBridged).toBe(1);
  });

  it('excludes malformed dates and reports them', () => {
    const { flights, warnings } = normalizeFlights([rf({ id: 'BAD', date: '01/06/2026' }), rf({ id: 'OK' })], students);
    expect(flights).toHaveLength(1);
    expect(warnings.find((w) => w.code === 'MALFORMED_DATE')?.count).toBe(1);
  });

  it('derives lessonNorm / batchKey / airborneMin', () => {
    const { flights } = normalizeFlights(
      [rf({ lesson: 'CDGL 04/2', batch: 'AP-127', airborne: '01:07' } as Partial<RawFlight>)],
      students,
    );
    expect(flights[0].lessonNorm).toBe('CDGL 04');
    expect(flights[0].batchKey).toBe('AP127');
    expect(flights[0].airborneMin).toBe(67);
  });

  it('marks ACTUAL_ONLY rows', () => {
    const { flights } = normalizeFlights([rf({ id: 'ACTUAL_ONLY_BK-1_ACT_2' })], students);
    expect(flights[0].flags?.actualOnly).toBe(true);
  });
});

describe('truncationCanary', () => {
  it('fires below 70% of previous count', () => {
    expect(truncationCanary('x', 1000, 699)).toMatch(/refusing/);
    expect(truncationCanary('x', 1000, 700)).toBeNull();
    expect(truncationCanary('x', null, 5)).toBeNull();
    expect(truncationCanary('x', 0, 5)).toBeNull();
  });
});
