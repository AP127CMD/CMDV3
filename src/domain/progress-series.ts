// Shared helpers for cumulative progress series (Race / Combined / Lead-Lag
// charts all need the same "minutes for this flown lesson" rule).

import type { CurriculumRow } from './types';

export type LeadLagMode = 'hours' | 'lessons';

/** Curriculum planned minutes for a lesson, falling back to actual minutes when unknown. */
export function curriculumMinsFor(
  curriculum: readonly CurriculumRow[],
  lesson: string,
  actualMins: number | null | undefined,
): number {
  const row = curriculum.find((c) => c.lesson === lesson);
  return row?.plannedMins ?? actualMins ?? 0;
}
