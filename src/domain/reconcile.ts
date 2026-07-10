// Cross-Check reconciliation engine — behavior-identical port of V2
// assets/reconcile.js. Compares the two independent AP-127 data sources
// (Operations flights vs Progress flown lessons) and classifies every
// pairing as OK / REVIEW / CONFLICT. Pure: no DOM, no globals.

import { ccKeyFromFull, makeOpsStudentKey } from './names';
import { normLesson } from './lessons';
import { isAP127Batch } from './batches';
import { dateDiff } from './dates';
import type { Flight, Student } from './types';

export interface ReconcileOpts {
  /** Duration tolerance in minutes before a pairing becomes REVIEW. */
  durTolMin?: number;
  /** Date tolerance in days before a pairing becomes REVIEW. */
  dateTolDays?: number;
}

export type ReconcileRowType = 'missing_in_ops' | 'missing_in_progress' | 'review';

export interface ReconcileRow {
  student: string;
  nick: string;
  key: string;
  lesson: string;
  date: string;
  type: ReconcileRowType;
  sev: 'conflict' | 'review';
  detail: string;
  opsDate?: string;
  opsMin?: number | null;
  progMin?: number | null;
}

export interface ReconcilePerStudent {
  name: string;
  nick: string;
  key: string;
  matched: boolean;
  progDone: number;
  ccCompleted: number;
  ok: number;
  review: number;
  conflict: number;
  checked: number;
}

export interface ReconcileTotals {
  students: number;
  ok: number;
  review: number;
  conflict: number;
  checked: number;
  consistency: number; // percent, ok/checked
  orphanOps: string[];
  windowStart: string;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  perStudent: ReconcilePerStudent[];
  totals: ReconcileTotals;
}

export function reconcile(
  flights: readonly Flight[],
  students: readonly Student[],
  opts: ReconcileOpts = {},
): ReconcileResult {
  const durTol = opts.durTolMin ?? 20;
  const dateTol = opts.dateTolDays ?? 1;

  const opsStudentKey = makeOpsStudentKey(students);

  // Completed AP-127 ops flights, grouped by canonical student key.
  const ccByStudent: Record<string, Flight[]> = {};
  let ccMinDate: string | null = null;
  for (const f of flights) {
    if (!isAP127Batch(f.batch) || f.status !== 'Completed' || !f.student || !f.lesson) continue;
    const k = f.studentKey ?? opsStudentKey(f.student);
    (ccByStudent[k] ??= []).push(f);
    if (f.date && (!ccMinDate || f.date < ccMinDate)) ccMinDate = f.date;
  }

  // Only compare within the window both sources cover: operations history is a
  // rolling window; progress goes back further. Flown lessons earlier than the
  // earliest ops record can't be cross-checked and aren't real conflicts.
  const windowStart = ccMinDate ?? '0000-00-00';

  const rows: ReconcileRow[] = [];
  const perStudent: ReconcilePerStudent[] = [];

  for (const s of students) {
    const key = ccKeyFromFull(s.name);
    const ccList = ccByStudent[key] ?? [];
    const ccByLesson: Record<string, Flight[]> = {};
    for (const f of ccList) (ccByLesson[normLesson(f.lesson)] ??= []).push(f);

    const flown = (s.flown ?? []).filter((f) => f.date && f.date >= windowStart);
    const flownLessons = new Set(flown.map((f) => normLesson(f.lesson)));
    let ok = 0;
    let review = 0;
    let conflict = 0;

    // Direction 1: Progress → Operations
    for (const pf of flown) {
      const nl = normLesson(pf.lesson);
      const matches = ccByLesson[nl] ?? [];
      if (!matches.length) {
        rows.push({
          student: s.name,
          nick: s.nick,
          key,
          lesson: pf.lesson,
          date: pf.date,
          type: 'missing_in_ops',
          sev: 'conflict',
          detail: 'Logged in Progress but no matching Completed flight in Operations',
        });
        conflict++;
        continue;
      }
      const exact = matches.find((m) => m.date === pf.date);
      const m =
        exact ??
        [...matches].sort(
          (a, b) =>
            Math.abs(dateDiff(a.date, pf.date) ?? 0) - Math.abs(dateDiff(b.date, pf.date) ?? 0),
        )[0];
      const ccMin = m.durMin;
      const pMin = pf.actualMins;
      const issues: string[] = [];
      const dd = dateDiff(m.date, pf.date);
      if (!exact && dd != null && Math.abs(dd) > dateTol) {
        issues.push(`date Δ ${dd > 0 ? '+' : ''}${dd}d (ops ${m.date})`);
      }
      if (ccMin != null && pMin != null && Math.abs(ccMin - pMin) > durTol) {
        issues.push(
          `time Δ ${pMin - ccMin > 0 ? '+' : ''}${pMin - ccMin}m (ops ${ccMin}m · prog ${pMin}m)`,
        );
      }
      if (issues.length) {
        rows.push({
          student: s.name,
          nick: s.nick,
          key,
          lesson: pf.lesson,
          date: pf.date,
          type: 'review',
          sev: 'review',
          detail: issues.join('; '),
          opsDate: m.date,
          opsMin: ccMin,
          progMin: pMin,
        });
        review++;
      } else {
        ok++;
      }
    }

    // Direction 2: Operations → Progress
    for (const nl of Object.keys(ccByLesson)) {
      if (!flownLessons.has(nl)) {
        const f = ccByLesson[nl][0];
        rows.push({
          student: s.name,
          nick: s.nick,
          key,
          lesson: f.lesson ?? nl,
          date: f.date,
          type: 'missing_in_progress',
          sev: 'conflict',
          detail: 'Completed in Operations but not logged in Progress',
        });
        conflict++;
      }
    }

    perStudent.push({
      name: s.name,
      nick: s.nick,
      key,
      matched: ccList.length > 0,
      progDone: s.done ?? (s.flown ?? []).length,
      ccCompleted: ccList.length,
      ok,
      review,
      conflict,
      checked: ok + review + conflict,
    });
  }

  const progKeys = new Set(students.map((s) => ccKeyFromFull(s.name)));
  const orphanOps = Object.keys(ccByStudent).filter((k) => !progKeys.has(k));

  const ok = perStudent.reduce((a, s) => a + s.ok, 0);
  const review = perStudent.reduce((a, s) => a + s.review, 0);
  const conflict = perStudent.reduce((a, s) => a + s.conflict, 0);
  const checked = ok + review + conflict;

  return {
    rows,
    perStudent,
    totals: {
      students: students.length,
      ok,
      review,
      conflict,
      checked,
      consistency: checked ? Math.round((ok / checked) * 100) : 100,
      orphanOps,
      windowStart,
    },
  };
}
