import { describe, expect, it } from 'vitest';
import { holidayStalenessWarning, isWorkableDay, workableDaysBetween } from './holidays';

describe('isWorkableDay', () => {
  it('rejects weekends', () => {
    expect(isWorkableDay('2026-07-11')).toBe(false); // Sat
    expect(isWorkableDay('2026-07-12')).toBe(false); // Sun
    expect(isWorkableDay('2026-07-10')).toBe(true); // Fri
  });
  it('rejects holidays', () => {
    expect(isWorkableDay('2026-08-12')).toBe(false); // HM Queen Mother's birthday (in set)
    expect(isWorkableDay('2026-12-31')).toBe(false);
  });
});

describe('workableDaysBetween', () => {
  it('counts exclusive-start inclusive-end workable days', () => {
    // 2026-07-27 (Mon) → 2026-07-31 (Fri): 28/29/30 are holidays, 31 workable
    expect(workableDaysBetween('2026-07-27', '2026-07-31')).toBe(1);
    // plain full week Mon→Fri
    expect(workableDaysBetween('2026-07-05', '2026-07-10')).toBe(5);
  });
});

describe('holidayStalenessWarning', () => {
  it('is quiet while the set has runway', () => {
    expect(holidayStalenessWarning('2026-07-10')).toBeNull();
  });
  it('warns when the set runs out', () => {
    expect(holidayStalenessWarning('2026-12-01')).toMatch(/update the yearly holiday set/);
  });
});
