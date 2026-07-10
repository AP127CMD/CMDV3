// Bangkok-anchored date utilities, ported from V2 shared.js (p95/p109 fix class).
// CATC operates UTC+7 with no DST: every "today"/"now" in the app must be the
// Asia/Bangkok calendar day/time, independent of the viewer's device timezone.

const bkkDayFmt: Intl.DateTimeFormat | null = (() => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
  } catch {
    return null;
  }
})();

/** Current calendar date in Asia/Bangkok as YYYY-MM-DD. */
export function bkkToday(now: Date = new Date()): string {
  if (bkkDayFmt) return bkkDayFmt.format(now);
  // Fallback: fixed UTC+7 applied to the absolute epoch (never the viewer's offset).
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

const bkkTimeFmt: Intl.DateTimeFormat | null = (() => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
})();

/** Current time-of-day in Asia/Bangkok as minutes since midnight (Gantt NOW-line). */
export function bkkNowMin(now: Date = new Date()): number {
  if (bkkTimeFmt) {
    const parts = bkkTimeFmt.formatToParts(now);
    const h = +(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = +(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  }
  const b = new Date(now.getTime() + 7 * 3600_000);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
}

/** True only for a well-formed YYYY-MM-DD the Date parser accepts. */
export function validDate(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(new Date(s + 'T00:00:00').getTime())
  );
}

/** Whole-day difference a − b in days (null on bad input). */
export function dateDiff(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ad = new Date(a + 'T00:00:00Z').getTime();
  const bd = new Date(b + 'T00:00:00Z').getTime();
  if (Number.isNaN(ad) || Number.isNaN(bd)) return null;
  return Math.round((ad - bd) / 86_400_000);
}

/** iso + n days → YYYY-MM-DD (UTC-noon anchor avoids DST edges). */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every calendar day from start to end inclusive (caps at 1000 days). */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Split a YYYY-MM-DD into display parts. */
export function fmtDay(d: string): { wd: string; mo: string; day: number; y: number } {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return { wd: WD[dt.getUTCDay()], mo: MO[m - 1], day, y };
}

/** "HH:MM" → minutes since midnight (null when absent/malformed). */
export function minutesOf(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d+):(\d+)/);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Weekday of a YYYY-MM-DD (0=Sunday … 6=Saturday). */
export function weekdayOf(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

/** Days since the Unix epoch for a YYYY-MM-DD — a plain numeric x-axis unit. */
export function dayNumber(iso: string): number {
  return Math.floor(new Date(iso + 'T12:00:00Z').getTime() / 86_400_000);
}

/** Inverse of dayNumber(). */
export function isoFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
