import { describe, expect, it } from 'vitest';
import {
  addDays,
  bkkNowMin,
  bkkToday,
  dateDiff,
  dayRange,
  fmtDay,
  minutesOf,
  validDate,
  weekdayOf,
} from './dates';

describe('bkkToday', () => {
  it('returns the Bangkok calendar day regardless of viewer offset', () => {
    // 2026-07-09 18:30 UTC = 2026-07-10 01:30 Bangkok (+7) — already "tomorrow" in BKK
    expect(bkkToday(new Date('2026-07-09T18:30:00Z'))).toBe('2026-07-10');
    // 2026-07-09 16:59 UTC = 2026-07-09 23:59 BKK — still the 9th
    expect(bkkToday(new Date('2026-07-09T16:59:00Z'))).toBe('2026-07-09');
    // exact BKK midnight boundary
    expect(bkkToday(new Date('2026-07-09T17:00:00Z'))).toBe('2026-07-10');
  });
});

describe('bkkNowMin', () => {
  it('returns minutes since Bangkok midnight', () => {
    // 02:30 UTC = 09:30 BKK = 570 min
    expect(bkkNowMin(new Date('2026-07-10T02:30:00Z'))).toBe(570);
    // 17:00 UTC = 00:00 BKK next day
    expect(bkkNowMin(new Date('2026-07-10T17:00:00Z'))).toBe(0);
    expect(bkkNowMin(new Date('2026-07-10T16:59:00Z'))).toBe(23 * 60 + 59);
  });
});

describe('validDate', () => {
  it('accepts well-formed dates only', () => {
    expect(validDate('2026-07-10')).toBe(true);
    expect(validDate('2026-7-10')).toBe(false);
    expect(validDate('10/07/2026')).toBe(false);
    expect(validDate('')).toBe(false);
    expect(validDate(null)).toBe(false);
    expect(validDate('2026-13-45')).toBe(false);
  });
});

describe('dateDiff / addDays / dayRange', () => {
  it('computes whole-day differences', () => {
    expect(dateDiff('2026-07-10', '2026-07-01')).toBe(9);
    expect(dateDiff('2026-07-01', '2026-07-10')).toBe(-9);
    expect(dateDiff('2026-07-10', null)).toBeNull();
    expect(dateDiff('bad', '2026-07-10')).toBeNull();
  });
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('builds inclusive ranges', () => {
    expect(dayRange('2026-07-08', '2026-07-10')).toEqual(['2026-07-08', '2026-07-09', '2026-07-10']);
  });
});

describe('fmtDay / minutesOf / weekdayOf', () => {
  it('formats day parts', () => {
    expect(fmtDay('2026-07-10')).toEqual({ wd: 'FRI', mo: 'JUL', day: 10, y: 2026 });
  });
  it('parses HH:MM', () => {
    expect(minutesOf('07:30')).toBe(450);
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf('x')).toBeNull();
  });
  it('weekday: 2026-07-12 is a Sunday', () => {
    expect(weekdayOf('2026-07-12')).toBe(0);
    expect(weekdayOf('2026-07-11')).toBe(6);
  });
});
