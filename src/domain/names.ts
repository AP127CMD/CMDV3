// Name normalization + bridging, ported verbatim in behavior from V2
// assets/reconcile.js. Operations stores students as "FIRSTNAME L." (upper);
// Progress stores full names "Firstname Lastname"; "(Unplanned)" ops records
// may store a FULL name or a bare CALLSIGN — all must reduce to one key.

/** "Akaravit Khwanngam" → "AKARAVIT K." (the operations-style key). */
export function ccKeyFromFull(name: string | null | undefined): string {
  const p = String(name ?? '')
    .trim()
    .split(/\s+/);
  if (!p[0]) return '';
  if (p.length < 2) return p[0].toUpperCase();
  return (p[0] + ' ' + p[1][0]).toUpperCase() + '.';
}

/** Normalize an ops student name for keying (strip "(Unplanned)", upper). */
export function ccNameNorm(name: string | null | undefined): string {
  return String(name ?? '')
    .replace(/\s*\(Unplanned\)\s*/i, '')
    .trim()
    .toUpperCase();
}

/** Strip a trailing "(Unplanned)" suffix, preserving case of the rest. */
export function stripUnplanned(name: string): string {
  return name.replace(/\s*\(Unplanned\)\s*$/i, '').trim();
}

export interface NamedStudent {
  name: string;
  nick?: string | null;
}

/**
 * Build the ops-name → canonical-key bridge for a student list.
 * Reduces any ops student string to "FIRST L.": drops "(Unplanned)", collapses
 * a full name to first+initial, and bridges a bare callsign via the nick map.
 * Unresolved strings (e.g. spelling variants) stay as their reduced form and
 * remain orphans — exactly V2's behavior.
 */
export function makeOpsStudentKey(students: readonly NamedStudent[]): (raw: string | null | undefined) => string {
  const progKeySet = new Set(students.map((s) => ccKeyFromFull(s.name)));
  const nickToKey: Record<string, string> = {};
  for (const s of students) {
    if (s.nick) nickToKey[String(s.nick).toUpperCase()] = ccKeyFromFull(s.name);
  }
  return (raw) => {
    const norm = ccNameNorm(raw);
    const reduced = ccKeyFromFull(norm);
    if (progKeySet.has(reduced)) return reduced;
    if (nickToKey[norm]) return nickToKey[norm];
    return reduced;
  };
}
