// Lesson-code helpers, ported from V2 assets/reconcile.js.

/** Normalize a lesson code: upper, collapse spaces, drop trailing "/n" repeat marker. */
export function normLesson(l: string | null | undefined): string {
  return String(l ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\/\d+\s*$/, '');
}

/** "H:MM" / "HH:MM" → minutes (null when absent/malformed). */
export function hmToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+):(\d+)/);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** SIM lessons carry "(SIM)" in the code, e.g. "CDIF(SIM) 56". */
export function isSimLesson(code: string | null | undefined): boolean {
  return /\(SIM\)/i.test(String(code ?? ''));
}

export interface PhaseDef {
  k: string;
  label: string;
  color: string;
}

const PHASE_DEFS: Array<PhaseDef & { test: RegExp }> = [
  { k: 'CDGL', label: 'CDGL', test: /^CDGL/i, color: '#fb923c' },
  { k: 'GL', label: 'GL', test: /^GL/i, color: '#4ade80' },
  { k: 'IF', label: 'IF/IL', test: /^(IF|IL)/i, color: '#38bdf8' },
  { k: 'XV', label: 'XV/XI', test: /^(XV|XI)/i, color: '#a78bfa' },
  { k: 'NL', label: 'NL', test: /^NL/i, color: '#818cf8' },
  { k: 'SP', label: 'SP/PIC', test: /^(SP|PIC)/i, color: '#f59e0b' },
  { k: 'M', label: 'M', test: /^M/i, color: '#f472b6' },
];

export const PHASE_OTHER: PhaseDef = { k: 'OTH', label: 'Other', color: '#6b7280' };

/** Classify a lesson code into its curriculum phase (V2 ap127LessonPhase). */
export function lessonPhase(code: string | null | undefined): PhaseDef {
  const c = String(code ?? '').trim();
  if (!c) return PHASE_OTHER;
  for (const d of PHASE_DEFS) if (d.test.test(c)) return d;
  return PHASE_OTHER;
}
