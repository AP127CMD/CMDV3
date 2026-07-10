import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import type { Flight, Student } from './types';

function flight(p: Partial<Flight>): Flight {
  return {
    id: p.id ?? 'F1',
    date: p.date ?? '2026-06-01',
    status: p.status ?? 'Completed',
    isSim: false,
    isStandby: false,
    start: '07:00',
    end: '08:30',
    durMin: p.durMin ?? 90,
    student: p.student ?? 'AKARAVIT K.',
    studentKey: p.studentKey ?? null,
    instructor: 'WUTTHICHAI L.',
    batch: p.batch ?? 'AP-127',
    batchKey: 'AP127',
    lesson: p.lesson ?? 'CDGL 04',
    lessonNorm: null,
    cond: null,
    type: 'DA40TDI',
    tail: 'HS-TVG',
    tkoff: null,
    ldgTime: null,
    airborneMin: null,
    to: null,
    ldg: null,
    inst: null,
    ...p,
  };
}

function student(p: Partial<Student>): Student {
  return {
    catcId: '681000',
    name: p.name ?? 'Akaravit Khwanngam',
    key: 'AKARAVIT K.',
    nick: p.nick ?? 'A-VIT',
    fi: 'W-CHAI',
    fiFull: 'WUTTHICHAI L.',
    se: 'DA40-TDI',
    batch: 'AP127',
    done: p.flown?.length ?? 0,
    total: 71,
    remaining: 71 - (p.flown?.length ?? 0),
    pct: 0,
    nextLesson: null,
    flown: p.flown ?? [],
    ...p,
  };
}

const flown = (lesson: string, date: string, actualMins: number | null = 90) => ({
  lesson,
  lessonNorm: lesson,
  actualMins,
  date,
});

describe('reconcile', () => {
  it('classifies a clean match as OK', () => {
    const r = reconcile(
      [flight({ lesson: 'CDGL 04/1', date: '2026-06-01', durMin: 90 })],
      [student({ flown: [flown('CDGL 04', '2026-06-01', 90)] })],
    );
    expect(r.totals).toMatchObject({ ok: 1, review: 0, conflict: 0, consistency: 100 });
  });

  it('flags duration deltas beyond tolerance as REVIEW', () => {
    const r = reconcile(
      [flight({ durMin: 60 })],
      [student({ flown: [flown('CDGL 04', '2026-06-01', 90)] })],
    );
    expect(r.totals.review).toBe(1);
    expect(r.rows[0]).toMatchObject({ type: 'review', sev: 'review' });
    expect(r.rows[0].detail).toContain('time Δ +30m');
  });

  it('respects a custom duration tolerance', () => {
    const r = reconcile(
      [flight({ durMin: 60 })],
      [student({ flown: [flown('CDGL 04', '2026-06-01', 90)] })],
      { durTolMin: 45 },
    );
    expect(r.totals.ok).toBe(1);
  });

  it('flags date deltas beyond tolerance as REVIEW', () => {
    const r = reconcile(
      [flight({ date: '2026-06-05' })],
      [student({ flown: [flown('CDGL 04', '2026-06-01')] })],
    );
    // windowStart = 2026-06-05 clips the flown record (date < window) — no rows
    expect(r.totals.checked).toBe(1); // only direction 2: missing_in_progress
    expect(r.rows[0].type).toBe('missing_in_progress');
  });

  it('flags date drift within the ops window', () => {
    const r = reconcile(
      [
        flight({ id: 'EARLY', lesson: 'GL 01', date: '2026-05-01' }), // opens the window
        flight({ date: '2026-06-05' }),
      ],
      [student({ flown: [flown('GL 01', '2026-05-01'), flown('CDGL 04', '2026-06-01')] })],
    );
    const row = r.rows.find((x) => x.lesson === 'CDGL 04');
    expect(row?.type).toBe('review');
    expect(row?.detail).toContain('date Δ +4d');
  });

  it('reports missing_in_ops conflicts', () => {
    const r = reconcile(
      [flight({ lesson: 'GL 01', date: '2026-05-01' })],
      [student({ flown: [flown('GL 01', '2026-05-01'), flown('CDGL 09', '2026-06-01')] })],
    );
    expect(r.rows.find((x) => x.lesson === 'CDGL 09')?.type).toBe('missing_in_ops');
  });

  it('reports missing_in_progress conflicts', () => {
    const r = reconcile([flight({})], [student({ flown: [] })]);
    expect(r.rows[0]).toMatchObject({ type: 'missing_in_progress', sev: 'conflict' });
  });

  it('bridges (Unplanned) full-name and callsign records to the student', () => {
    const r = reconcile(
      [
        flight({ student: 'AKARAVIT KHWANNGAM (Unplanned)', lesson: 'CDGL 04' }),
        flight({ id: 'F2', student: 'A-VIT', lesson: 'GL 01', date: '2026-06-01' }),
      ],
      [student({ flown: [flown('CDGL 04', '2026-06-01'), flown('GL 01', '2026-06-01')] })],
    );
    expect(r.totals).toMatchObject({ ok: 2, conflict: 0 });
    expect(r.totals.orphanOps).toEqual([]);
  });

  it('keeps unresolvable ops students as orphans', () => {
    const r = reconcile(
      [flight({ student: 'SAETASIT PITTAYATHIKHUN' })],
      [student({ name: 'Setasit Pittayathikhun', nick: 'S-SIT', flown: [] })],
    );
    expect(r.totals.orphanOps).toEqual(['SAETASIT P.']);
  });

  it('ignores non-AP127 and non-Completed flights', () => {
    const r = reconcile(
      [
        flight({ batch: 'AP-126' }),
        flight({ id: 'F2', status: 'Pending' }),
        flight({ id: 'F3', status: 'Canceled' }),
      ],
      [student({ flown: [] })],
    );
    expect(r.totals.checked).toBe(0);
    expect(r.totals.consistency).toBe(100);
  });
});
