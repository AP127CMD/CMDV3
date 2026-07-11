// Pure parsers for the CATC fleet-status Google Sheet (published CSV). Ported
// from V2's view-aircraft.js so the interpretation of dates/cert-days/remarks
// stays identical. Fetching lives in data/fleetSheet.ts — this module has no
// DOM/network dependency so it's directly unit-testable.

export interface FleetAircraft {
  item: string;
  reg: string;
  model: string;
  flyable: boolean;
  lastFlight: string;
  lastFlightIso: string | null;
  dueInDisplay: string;
  dueInHours: number | null;
  acCertDate: string;
  acCertDays: number | null;
  coaCertDate: string;
  coaCertDays: number | null;
  insurance: string;
  remarks: string;
  flyableDate: { display: string; iso: string } | null;
}

export interface FleetSheetData {
  meta: { lastUpdate: string; updatedBy: string };
  aircraft: FleetAircraft[];
}

export function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) {
      fields.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  fields.push(cur.trim());
  return fields;
}

export function parseDueIn(raw: string | undefined): { display: string; totalHours: number | null } {
  if (!raw || raw === 'N/A' || !raw.trim()) return { display: raw || '—', totalHours: null };
  const p = raw.trim().split(':');
  if (p.length < 2) return { display: raw, totalHours: null };
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1].padStart(2, '0'), 10);
  return { display: `${p[0]}:${p[1].padStart(2, '0')}`, totalHours: isNaN(h) || isNaN(m) ? null : h + m / 60 };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function extractFlyableDate(remarks: string | null | undefined): { display: string; iso: string } | null {
  if (!remarks) return null;
  const m = remarks.match(/flyable\s+on\s+(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{2,4})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return null;
  const yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  return { display: `${day} ${m[2].slice(0, 3)} ${yr}`, iso: `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function normFleetDate(s: string | undefined): string | null {
  if (!s || s === 'N/A') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;
}

export function parseFleetCSV(csvText: string): FleetSheetData {
  const lines = csvText.trim().split('\n');
  if (lines.length < 3) return { meta: { lastUpdate: '', updatedBy: '' }, aircraft: [] };
  const r0 = parseCSVRow(lines[0]);
  const meta = { lastUpdate: r0[3] || '', updatedBy: r0[6] || '' };
  const aircraft: FleetAircraft[] = [];
  const toInt = (s: string | undefined) => {
    const x = parseInt(String(s ?? '').replace(/,/g, ''), 10);
    return isNaN(x) ? null : x;
  };
  for (let i = 2; i < lines.length; i++) {
    const f = parseCSVRow(lines[i]);
    if (!f[0] || !f[1]) continue;
    const rawRemarks = (f[11] || '').replace(/^\(|\)$/g, '').trim();
    const dueIn = parseDueIn(f[5]);
    aircraft.push({
      item: f[0],
      reg: f[1],
      model: f[2] || '',
      flyable: (f[3] || '').toLowerCase() === 'yes',
      lastFlight: f[4] || '',
      lastFlightIso: normFleetDate(f[4]),
      dueInDisplay: dueIn.display,
      dueInHours: dueIn.totalHours,
      acCertDate: f[6] || '',
      acCertDays: toInt(f[7]),
      coaCertDate: f[8] || '',
      coaCertDays: toInt(f[9]),
      insurance: f[10] || '',
      remarks: rawRemarks,
      flyableDate: extractFlyableDate(rawRemarks),
    });
  }
  return { meta, aircraft };
}

export interface FleetCrossCheckRow {
  sheet: FleetAircraft;
  ops: { tail: string; acType: string; isMaint: boolean } | null;
  opsFly: boolean | null;
  sheetFly: boolean;
  conflict: boolean;
  missing: boolean;
}

/** Compare Sheet "Flyable?" against ops resources' isMaint — flags conflicts + sheet-only tails. */
export function fleetCrossCheck(
  aircraft: readonly FleetAircraft[],
  resources: readonly { tail: string; acType: string; isMaint: boolean }[],
): FleetCrossCheckRow[] {
  const opsMap = new Map<string, { tail: string; acType: string; isMaint: boolean }>();
  for (const r of resources) {
    if (!r.tail || /SIM|Classroom/i.test(r.acType || '')) continue;
    opsMap.set(r.tail, r);
  }
  const rows = aircraft.map((sheet) => {
    const ops = opsMap.get(sheet.reg) ?? null;
    const opsFly = ops ? !ops.isMaint : null;
    const sheetFly = sheet.flyable;
    const conflict = ops !== null && opsFly !== sheetFly;
    const missing = ops === null;
    return { sheet, ops, opsFly, sheetFly, conflict, missing };
  });
  rows.sort((a, b) => {
    const ra = a.conflict ? 0 : a.missing ? 1 : 2;
    const rb = b.conflict ? 0 : b.missing ? 1 : 2;
    return ra !== rb ? ra - rb : a.sheet.reg.localeCompare(b.sheet.reg);
  });
  return rows;
}

export function certDaysColor(d: number | null): 'expired' | 'critical' | 'warn' | 'ok' | 'unknown' {
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= 60) return 'critical';
  if (d <= 120) return 'warn';
  return 'ok';
}
