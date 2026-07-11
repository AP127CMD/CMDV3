import { describe, expect, it } from 'vitest';
import { extractFlyableDate, fleetCrossCheck, normFleetDate, parseCSVRow, parseDueIn, parseFleetCSV } from './fleetSheet';

describe('parseCSVRow', () => {
  it('splits on commas and respects quoted fields', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseCSVRow('a,"b, still b",c')).toEqual(['a', 'b, still b', 'c']);
  });
});

describe('parseDueIn', () => {
  it('parses HH:MM into display + total hours', () => {
    expect(parseDueIn('12:30')).toEqual({ display: '12:30', totalHours: 12.5 });
  });
  it('handles N/A and empty', () => {
    expect(parseDueIn('N/A')).toEqual({ display: 'N/A', totalHours: null });
    expect(parseDueIn(undefined)).toEqual({ display: '—', totalHours: null });
  });
});

describe('extractFlyableDate', () => {
  it('extracts a date from "flyable on D Mon, YYYY" remarks', () => {
    expect(extractFlyableDate('AOG (flyable on 15 Aug, 2026)')).toEqual({ display: '15 Aug 2026', iso: '2026-08-15' });
  });
  it('returns null when no match', () => {
    expect(extractFlyableDate('routine check')).toBeNull();
    expect(extractFlyableDate(null)).toBeNull();
  });
});

describe('normFleetDate', () => {
  it('passes through ISO dates', () => {
    expect(normFleetDate('2026-07-10')).toBe('2026-07-10');
  });
  it('converts DD-Mon-YYYY', () => {
    expect(normFleetDate('5-Aug-2026')).toBe('2026-08-05');
  });
  it('returns null for N/A or unparseable', () => {
    expect(normFleetDate('N/A')).toBeNull();
    expect(normFleetDate('garbage')).toBeNull();
  });
});

describe('parseFleetCSV', () => {
  it('parses meta row + aircraft rows, skipping the header row', () => {
    const text = [
      'a,b,c,15 Jul 2026 09:00,d,e,f',
      'header,row,skip',
      '1,HS-TVA,Diamond DA40 TDI,Yes,10-Jul-2026,05:30,1-Jan-2026,120,1-Feb-2026,90,Full,(routine)',
      '2,HS-TVB,Diamond DA40 CS,No,09-Jul-2026,00:00,1-Jan-2026,-5,1-Feb-2026,200,Full,"(AOG flyable on 20 Jul, 2026)"',
    ].join('\n');
    const { meta, aircraft } = parseFleetCSV(text);
    expect(meta.lastUpdate).toBe('15 Jul 2026 09:00');
    expect(aircraft).toHaveLength(2);
    expect(aircraft[0]).toMatchObject({ reg: 'HS-TVA', flyable: true, acCertDays: 120 });
    expect(aircraft[1]).toMatchObject({ reg: 'HS-TVB', flyable: false, acCertDays: -5 });
    expect(aircraft[1].flyableDate).toEqual({ display: '20 Jul 2026', iso: '2026-07-20' });
  });

  it('returns empty aircraft for too-short input', () => {
    expect(parseFleetCSV('one\ntwo').aircraft).toEqual([]);
  });
});

describe('fleetCrossCheck', () => {
  const aircraft = [
    { item: '1', reg: 'HS-TVA', model: 'DA40 TDI', flyable: true, lastFlight: '', lastFlightIso: null, dueInDisplay: '', dueInHours: null, acCertDate: '', acCertDays: null, coaCertDate: '', coaCertDays: null, insurance: '', remarks: '', flyableDate: null },
    { item: '2', reg: 'HS-TVB', model: 'DA40 TDI', flyable: false, lastFlight: '', lastFlightIso: null, dueInDisplay: '', dueInHours: null, acCertDate: '', acCertDays: null, coaCertDate: '', coaCertDays: null, insurance: '', remarks: '', flyableDate: null },
    { item: '3', reg: 'HS-TVC', model: 'DA40 TDI', flyable: true, lastFlight: '', lastFlightIso: null, dueInDisplay: '', dueInHours: null, acCertDate: '', acCertDays: null, coaCertDate: '', coaCertDays: null, insurance: '', remarks: '', flyableDate: null },
  ];
  const resources = [
    { tail: 'HS-TVA', acType: 'DA40TDI', isMaint: false }, // agrees: flyable both
    { tail: 'HS-TVB', acType: 'DA40TDI', isMaint: false }, // conflict: sheet says grounded, ops says flyable
  ];

  it('flags conflicts and sheet-only (missing from ops) rows, conflicts sorted first', () => {
    const rows = fleetCrossCheck(aircraft, resources);
    expect(rows[0]).toMatchObject({ conflict: true, missing: false });
    expect(rows[0].sheet.reg).toBe('HS-TVB');
    const missingRow = rows.find((r) => r.sheet.reg === 'HS-TVC')!;
    expect(missingRow.missing).toBe(true);
    const okRow = rows.find((r) => r.sheet.reg === 'HS-TVA')!;
    expect(okRow.conflict).toBe(false);
    expect(okRow.missing).toBe(false);
  });
});
