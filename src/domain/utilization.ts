// Aircraft / FI / SP utilization helpers, ported from V2 js/view-aircraft.js.
// Hours math: block time (durMin) by default; "effective" mode substitutes the
// curriculum's plannedMins per lesson (normalizes duration — the p107 rule).

import type { Flight } from './types';
import { addDays } from './dates';

export const U_TYPE_ORDER = [
  'DA40TDI',
  'DA40CS',
  'C172',
  'DA42TDI',
  'DA42NG',
  'R44',
  'DA40_SIM',
  'DA42_SIM',
  'R44_SIM',
] as const;

export const U_TYPE_COLORS: Readonly<Record<string, string>> = {
  DA40TDI: '#4a9eff',
  DA40CS: '#2dd4bf',
  C172: '#fb923c',
  DA42TDI: '#a78bfa',
  DA42NG: '#e879f9',
  R44: '#fbbf24',
  DA40_SIM: '#64748b',
  DA42_SIM: '#94a3b8',
  R44_SIM: '#475569',
};

export const U_TYPE_LABELS: Readonly<Record<string, string>> = {
  DA40TDI: 'DA40 TDI',
  DA40CS: 'DA40 CS',
  C172: 'C172',
  DA42TDI: 'DA42 TDI',
  DA42NG: 'DA42 NG',
  R44: 'R44 Heli',
  DA40_SIM: 'DA40 Sim',
  DA42_SIM: 'DA42 Sim',
  R44_SIM: 'R44 Sim',
};

export const PS_PALETTE = [
  '#4a9eff',
  '#2dd4bf',
  '#fb923c',
  '#a78bfa',
  '#e879f9',
  '#fbbf24',
  '#22d3ee',
  '#f87171',
  '#c084fc',
  '#86efac',
  '#fdba74',
  '#67e8f9',
] as const;

export function isSimType(acType: string | null | undefined): boolean {
  return /SIM/i.test(acType ?? '');
}

/** Normalize a tail registration: "HS TVG" / "HSTVG" / "hs-tvg" → "HS-TVG". */
export function normTail(t: string | null | undefined): string {
  if (!t) return 'UNKNOWN';
  let s = t.trim().toUpperCase().replace(/\s+-\s+|\s+/g, '-');
  if (/^HS[A-Z0-9]{3,5}$/.test(s)) s = 'HS-' + s.slice(2);
  return s;
}

export type UtilMetric = 'block' | 'airborne' | 'effective';

/**
 * Minutes for a flight under the chosen metric.
 * - block: durMin (canonical)
 * - airborne: airborneMin (reference/display comparisons only)
 * - effective: curriculum plannedMins per lesson; split lessons "/1" get the
 *   full base planned value, "/2"+ get 0 (V2 p107 uEffectiveMins)
 */
export function metricMins(
  f: Flight,
  metric: UtilMetric,
  curMap: Record<string, number> = {},
): number {
  if (metric === 'airborne') return f.airborneMin ?? 0;
  if (metric === 'effective') {
    const lesson = (f.lesson ?? '').trim();
    if (!lesson) return f.durMin ?? 0;
    if (curMap[lesson] != null) return curMap[lesson];
    if (lesson.includes('/')) {
      const base = lesson.replace(/\/\d+$/, '');
      const part = parseInt(lesson.split('/').pop() ?? '1', 10) || 1;
      return part === 1 ? (curMap[base] ?? f.durMin ?? 0) : 0;
    }
    return f.durMin ?? 0;
  }
  return f.durMin ?? 0;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Preset ranges anchored on `today` (V2 uPresetRange). */
export function presetRange(p: string, today: string): DateRange {
  if (p === '1d') return { from: today, to: today };
  if (p === '7d') return { from: addDays(today, -6), to: today };
  if (p === '30d') return { from: addDays(today, -29), to: today };
  if (p === '90d') return { from: addDays(today, -89), to: today };
  if (p === 'month') {
    const [y, m] = today.split('-');
    return { from: `${y}-${m}-01`, to: today };
  }
  return { from: addDays(today, -29), to: today };
}

export function fmtHours(h: number): string {
  return !h || h < 0.04 ? '—' : h.toFixed(1) + 'h';
}
