// Upcoming-lesson resolution — the SINGLE source of truth for "what's next"
// dates project-wide. Per product rule: a future lesson's date must come from
// the REAL operations flight schedule (a Pending flight), never from the
// NGT scheduler's simulated projection (Student.planned[]/finish). When a
// remaining curriculum lesson has no matching Pending ops flight yet, its
// date is "TBC" — simulated/projected schedules belong ONLY in the
// Simulation section, never presented here as if they were real.

import { isAP127Batch } from './batches';
import { normLesson } from './lessons';
import type { CurriculumRow, Flight, Student } from './types';

export interface UpcomingLesson {
  lesson: string;
  lessonNorm: string;
  /** Real scheduled date from ops, or null when not yet scheduled (TBC). */
  date: string | null;
  opsFlight: Flight | null;
}

/**
 * Remaining curriculum lessons for a student (not yet flown), each matched
 * against the REAL ops schedule for a Pending flight. Never reads
 * `student.planned` — that field is the simulator's output and must stay
 * confined to the Simulation feature.
 */
export function upcomingLessons(
  student: Student,
  curriculum: readonly CurriculumRow[],
  opsFlights: readonly Flight[],
): UpcomingLesson[] {
  const flownSet = new Set(student.flown.map((f) => f.lessonNorm || normLesson(f.lesson)));
  const remaining = curriculum.filter((c) => !flownSet.has(c.lessonNorm || normLesson(c.lesson)));

  const opsByLesson = new Map<string, Flight>();
  for (const f of opsFlights) {
    if (f.status !== 'Pending' || !isAP127Batch(f.batch)) continue;
    if (f.studentKey !== student.key) continue;
    const k = f.lessonNorm ?? normLesson(f.lesson);
    const existing = opsByLesson.get(k);
    if (!existing || (f.date && existing.date && f.date < existing.date)) opsByLesson.set(k, f);
  }

  return remaining.map((c) => {
    const key = c.lessonNorm || normLesson(c.lesson);
    const match = opsByLesson.get(key) ?? null;
    return {
      lesson: c.lesson,
      lessonNorm: key,
      date: match?.date ?? null,
      opsFlight: match,
    };
  });
}
