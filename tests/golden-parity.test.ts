// GOLDEN PARITY — the "V3 is accurate" proof.
//
// Frozen REAL upstream data (captured 2026-07-10 from the V2 mirror) is run
// through BOTH implementations:
//   • V2's actual browser code (verbatim fixture copies, evaluated in Node)
//   • V3's typed pipeline + domain layer
// and every number they can both produce must be identical.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlightDataJs, parseProgressJson, type RawFlight } from '../pipeline/sources';
import { dedupeActualOnly, normalizeFlights, normalizeStudents } from '../pipeline/transform';
import { reconcile } from '../src/domain/reconcile';

const FIX = join(__dirname, 'fixtures');

const flightJs = readFileSync(join(FIX, 'raw-flight-data.js'), 'utf8');
const progressJs = readFileSync(join(FIX, 'raw-progress-data.js'), 'utf8');

const rawFlights = parseFlightDataJs(flightJs);
const rawProgress = parseProgressJson(
  progressJs.slice(progressJs.indexOf('window.PROGRESS_DATA =') + 'window.PROGRESS_DATA ='.length).trim().replace(/;\s*$/, ''),
);

// ── V2 reference implementations, verbatim ─────────────────────────────────

/** V2 shared.js dedup IIFE, copied verbatim (JS semantics preserved). */
function v2Dedup(flightsIn: RawFlight[]): { flights: RawFlight[]; keyFallback: number } {
  const raw = flightsIn;
  const norm = (s: unknown) =>
    String(s || '')
      .trim()
      .toUpperCase()
      .replace(/\s*\(UNPLANNED\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/\/\d+\s*$/, '');
  const evtKey = (f: RawFlight) => norm(f.student) + '|' + (f.date || '') + '|' + norm(f.lesson);
  const hasActual = new Set<string>();
  const actualKeys = new Set<string>();
  raw.forEach((f) => {
    if (f.id && f.id.startsWith('ACTUAL_ONLY_')) {
      hasActual.add(f.id.slice('ACTUAL_ONLY_'.length).replace(/_ACT_\d+$/, ''));
      if (f.status === 'Completed' && f.student && f.lesson) actualKeys.add(evtKey(f));
    }
  });
  let keyFallback = 0;
  let flights = raw;
  if (hasActual.size) {
    flights = raw.filter((f) => {
      if (!f.id || f.id.startsWith('ACTUAL_ONLY_')) return true;
      if (f.status !== 'Completed') return true;
      if (hasActual.has(f.id)) return false;
      if (f.student && f.lesson && actualKeys.has(evtKey(f))) {
        keyFallback++;
        return false;
      }
      return true;
    });
  }
  return { flights, keyFallback };
}

/** Evaluate the frozen copy of V2's assets/reconcile.js and return its export. */
function loadV2Reconcile(): {
  reconcile: (fd: unknown, pd: unknown, opts?: unknown) => { rows: unknown[]; perStudent: unknown[]; totals: Record<string, unknown> };
} {
  const src = readFileSync(join(FIX, 'v2-reconcile.js'), 'utf8');
  const windowShim: Record<string, unknown> = {};
  new Function('window', src)(windowShim);
  return windowShim.AP127Reconcile as ReturnType<typeof loadV2Reconcile>;
}

// V2 app state fed to its engine: dedup + "(Unplanned)" strip, like shared.js.
function v2AppFlights(): RawFlight[] {
  const { flights } = v2Dedup(rawFlights.flights.map((f) => ({ ...f })));
  flights.forEach((f) => {
    if (f.student) f.student = f.student.replace(/\s*\(Unplanned\)\s*$/i, '').trim();
    if (f.instructor) f.instructor = f.instructor.replace(/\s*\(Unplanned\)\s*$/i, '').trim();
  });
  return flights;
}

describe('golden parity: dedup', () => {
  it('V3 dedupeActualOnly removes exactly the rows V2 removes', () => {
    const v2 = v2Dedup(rawFlights.flights.map((f) => ({ ...f })));
    const v3 = dedupeActualOnly(rawFlights.flights);
    expect(v3.flights.length).toBe(v2.flights.length);
    expect(v3.removedByKey).toBe(v2.keyFallback);
    expect(v3.flights.map((f) => f.id)).toEqual(v2.flights.map((f) => f.id));
    // sanity: the dedup actually did something on real data
    expect(v3.removedById + v3.removedByKey).toBeGreaterThan(100);
  });
});

describe('golden parity: reconcile', () => {
  it('V3 reconcile totals equal the V2 engine on the same real data', () => {
    const v2engine = loadV2Reconcile();
    const v2res = v2engine.reconcile({ flights: v2AppFlights() }, { ap127: rawProgress.ap127 });

    const v3flights = normalizeFlights(dedupeActualOnly(rawFlights.flights).flights, rawProgress.ap127).flights;
    const v3students = normalizeStudents(rawProgress.ap127);
    const v3res = reconcile(v3flights, v3students);

    expect(v3res.totals.ok).toBe(v2res.totals.ok);
    expect(v3res.totals.review).toBe(v2res.totals.review);
    expect(v3res.totals.conflict).toBe(v2res.totals.conflict);
    expect(v3res.totals.checked).toBe(v2res.totals.checked);
    expect(v3res.totals.consistency).toBe(v2res.totals.consistency);
    expect(v3res.totals.windowStart).toBe(v2res.totals.windowStart);
    expect(v3res.totals.orphanOps.sort()).toEqual((v2res.totals.orphanOps as string[]).sort());
    expect(v3res.totals.students).toBe(rawProgress.ap127.length);
  });

  it('per-student done totals survive normalization untouched', () => {
    const v3students = normalizeStudents(rawProgress.ap127);
    for (let i = 0; i < rawProgress.ap127.length; i++) {
      expect(v3students[i].done).toBe(rawProgress.ap127[i].done);
      expect(v3students[i].flown.length).toBe(rawProgress.ap127[i].flown.length);
    }
  });

  it('roster injection resolves all 28 students by name', () => {
    const v3students = normalizeStudents(rawProgress.ap127);
    const withNick = v3students.filter((s) => s.nick);
    expect(v3students.length).toBe(28);
    expect(withNick.length).toBe(28);
    const akaravit = v3students.find((s) => s.name === 'Akaravit Khwanngam');
    expect(akaravit).toMatchObject({ nick: 'A-VIT', fi: 'W-CHAI', se: 'DA40-TDI', fiFull: 'WUTTHICHAI L.' });
  });
});
