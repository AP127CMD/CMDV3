// Curriculum Prog — per-student plan/progress cards across ALL FOUR batches
// (AP124/126/127/129), not just AP127. Ported from V2's Progress Detail page
// (view-program.js renderPlans/makeCard/openSpModal). AP127 already has a
// roster-merged, richly-typed Student[] (nick/fi/se); the other three batches
// only have NgtBatchStudent[] (name/done/total/flown) — V2 has the exact same
// asymmetry (AP127_ROSTER only ever covered AP127), so cards for those batches
// simply render without a nick/FI tag, matching V2 exactly.
//
// Next-lesson dates obey the project-wide rule (domain/upcoming.ts): only a
// REAL Pending ops flight counts as a date; otherwise "TBC". Never reads
// Student.planned / NgtBatchStudent.planned here.

import { ccKeyFromFull, ccNameNorm } from './names';
import { normLesson } from './lessons';
import { dateDiff } from './dates';
import type { CurriculumRow, Flight, FlownLesson, NgtBatchStudent, Student } from './types';

export const PROG_BATCHES = ['AP124', 'AP126', 'AP127', 'AP129'] as const;
export type ProgBatch = (typeof PROG_BATCHES)[number];

export interface UnifiedStudent {
  catcId: string;
  name: string;
  nick: string; // '' when unknown (non-AP127 batches)
  fi: string; // '' when unknown
  batch: string;
  done: number;
  total: number;
  pct: number;
  remaining: number;
  flown: FlownLesson[];
  key: string; // ops-style "FIRST L." key, for ops-flight name matching
}

function fromNgtBatchStudent(s: NgtBatchStudent, batch: string): UnifiedStudent {
  const total = s.total || 0;
  const done = s.done || 0;
  return {
    catcId: s.catcId,
    name: s.name,
    nick: '',
    fi: '',
    batch,
    done,
    total,
    pct: total ? (done / total) * 100 : 0,
    remaining: Math.max(0, total - done),
    flown: s.flown ?? [],
    key: ccKeyFromFull(s.name),
  };
}

function fromStudent(s: Student): UnifiedStudent {
  return {
    catcId: s.catcId,
    name: s.name,
    nick: s.nick ?? '',
    fi: s.fi ?? '',
    batch: s.batch,
    done: s.done,
    total: s.total,
    pct: s.pct,
    remaining: s.remaining,
    flown: s.flown,
    key: s.key || ccKeyFromFull(s.name),
  };
}

/** Merge AP127's roster-rich Student[] with the other 3 batches' NgtBatchStudent[]. */
export function buildUnifiedRoster(
  ap127Students: readonly Student[],
  ngtBatches: Record<string, readonly NgtBatchStudent[]>,
): UnifiedStudent[] {
  const out: UnifiedStudent[] = ap127Students.map(fromStudent);
  const batchKeyToLabel: Record<string, string> = { ap124: 'AP124', ap126: 'AP126', ap129: 'AP129' };
  for (const [key, label] of Object.entries(batchKeyToLabel)) {
    for (const s of ngtBatches[key] ?? []) out.push(fromNgtBatchStudent(s, label));
  }
  return out;
}

/** cur124/cur126/cur127 keyed by batch; AP129 shares AP127's curriculum (V2 comment: same syllabus). */
export function curriculumForBatch(batch: string, curricula: Record<string, readonly CurriculumRow[]>): readonly CurriculumRow[] {
  const b = batch.toUpperCase();
  if (b === 'AP124') return curricula.cur124 ?? [];
  if (b === 'AP126') return curricula.cur126 ?? [];
  if (b === 'AP127' || b === 'AP129') return curricula.cur127 ?? [];
  return [];
}

export interface ProgUpcoming {
  lesson: string;
  lessonNorm: string;
  date: string | null; // real ops date, or null = TBC
  opsFlight: Flight | null;
}

/**
 * Remaining curriculum lessons for a student in ANY batch, matched by name
 * against a REAL Pending ops flight. Batch-agnostic version of
 * domain/upcoming.ts's upcomingLessons (that one is AP127-only by design).
 */
export function progUpcoming(student: UnifiedStudent, curriculum: readonly CurriculumRow[], opsFlights: readonly Flight[]): ProgUpcoming[] {
  const flownSet = new Set(student.flown.map((f) => f.lessonNorm || normLesson(f.lesson)));
  const remaining = curriculum.filter((c) => !flownSet.has(c.lessonNorm || normLesson(c.lesson)));

  const opsByLesson = new Map<string, Flight>();
  for (const f of opsFlights) {
    if (f.status !== 'Pending') continue;
    if (ccKeyFromFull(ccNameNorm(f.student)) !== student.key) continue;
    const k = f.lessonNorm ?? normLesson(f.lesson);
    const existing = opsByLesson.get(k);
    if (!existing || (f.date && existing.date && f.date < existing.date)) opsByLesson.set(k, f);
  }

  return remaining.map((c) => {
    const key = c.lessonNorm || normLesson(c.lesson);
    const match = opsByLesson.get(key) ?? null;
    return { lesson: c.lesson, lessonNorm: key, date: match?.date ?? null, opsFlight: match };
  });
}

export type RecordSource = 'both' | 'review' | 'ops' | 'prog' | 'sched';

export interface ProgRecordRow {
  lesson: string;
  date: string;
  mins: number;
  status: 'Completed' | 'Scheduled';
  src: RecordSource;
}

/**
 * Full real-only record for the detail modal: PROG flown ∪ OPS flights,
 * cross-checked for agreement (V2's SP_SRC dot legend). No projected plan
 * rows — matches V2's "modal shows only real records" note exactly.
 */
export function buildFullRecord(student: UnifiedStudent, curriculum: readonly CurriculumRow[], opsFlights: readonly Flight[]): ProgRecordRow[] {
  const posMap = new Map(curriculum.map((c, i) => [c.lessonNorm || normLesson(c.lesson), i]));
  const norm = (l: string | null | undefined) => normLesson(l);

  const opsBy = new Map<string, Flight>();
  for (const f of opsFlights) {
    if (!f.student || !f.lesson || f.status === 'Canceled') continue;
    if (ccKeyFromFull(ccNameNorm(f.student)) !== student.key) continue;
    const k = norm(f.lesson);
    const prev = opsBy.get(k);
    if (!prev || (f.status === 'Completed' && prev.status !== 'Completed') || (f.status === prev.status && (f.date ?? '') < (prev.date ?? ''))) {
      opsBy.set(k, f);
    }
  }
  const flownBy = new Map<string, FlownLesson>();
  for (const f of student.flown) if (f.lesson) flownBy.set(norm(f.lesson), f);

  const keys = new Set<string>([...flownBy.keys(), ...opsBy.keys()]);
  const rows: ProgRecordRow[] = [];
  for (const k of keys) {
    const pf = flownBy.get(k);
    const op = opsBy.get(k);
    const opsDone = op?.status === 'Completed';
    const lesson = pf?.lesson || op?.lesson || k;

    if (pf || opsDone) {
      const date = pf?.date || op?.date || '';
      const mins = pf?.actualMins ?? op?.durMin ?? 0;
      let src: RecordSource;
      if (pf && opsDone) {
        const dd = dateDiff(op!.date, pf.date);
        const oM = op?.durMin ?? null;
        const pM = pf.actualMins;
        src = (dd != null && Math.abs(dd) > 1) || (oM != null && pM != null && Math.abs(oM - pM) > 20) ? 'review' : 'both';
      } else {
        src = pf ? 'prog' : 'ops';
      }
      rows.push({ lesson, date, mins, status: 'Completed', src });
    } else {
      const pos = posMap.get(k);
      if (pos != null && pos < student.done) continue; // already-done lesson index, no ops record needed
      rows.push({ lesson, date: op?.date ?? '', mins: op?.durMin ?? 0, status: 'Scheduled', src: 'sched' });
    }
  }
  rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return rows;
}
