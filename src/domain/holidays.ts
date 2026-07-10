import { addDays, weekdayOf } from './dates';

// ⚠ MANUAL YEARLY UPDATE — Thai public holidays + academy closures are hardcoded
// (no upstream feed exists). The pipeline's staleness canary warns when this set
// runs out less than 60 days ahead, so forgetting the update is visible instead
// of silently corrupting pace/idle projections. Ported from V2 shared.js.
export const AP127_HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-05-01',
  '2026-05-04',
  '2026-05-13',
  '2026-06-01',
  '2026-06-03',
  '2026-07-28',
  '2026-07-29',
  '2026-07-30',
  '2026-08-12',
  '2026-10-13',
  '2026-10-23',
  '2026-12-07',
  '2026-12-10',
  '2026-12-31',
]);

export function isHoliday(iso: string): boolean {
  return AP127_HOLIDAYS.has(iso);
}

/** A day the academy can fly: not a weekend, not a holiday. */
export function isWorkableDay(iso: string): boolean {
  const wd = weekdayOf(iso);
  return wd !== 0 && wd !== 6 && !isHoliday(iso);
}

/** Count workable days in (from, to] — exclusive start, inclusive end. */
export function workableDaysBetween(from: string, to: string): number {
  let n = 0;
  let cur = addDays(from, 1);
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    if (isWorkableDay(cur)) n++;
    cur = addDays(cur, 1);
  }
  return n;
}

/**
 * Staleness canary: warn when the newest known holiday is < horizonDays ahead
 * of `today` (the hardcoded set has probably run out of runway).
 */
export function holidayStalenessWarning(today: string, horizonDays = 60): string | null {
  const max = [...AP127_HOLIDAYS].sort().at(-1);
  if (!max) return 'AP127_HOLIDAYS is empty';
  if (max < addDays(today, horizonDays)) {
    return `AP127_HOLIDAYS ends ${max} — less than ${horizonDays} days ahead; update the yearly holiday set`;
  }
  return null;
}
