import { describe, expect, it } from 'vitest';
import { ccKeyFromFull, ccNameNorm, makeOpsStudentKey, stripUnplanned } from './names';

describe('ccKeyFromFull', () => {
  it('collapses full names to FIRST L.', () => {
    expect(ccKeyFromFull('Akaravit Khwanngam')).toBe('AKARAVIT K.');
    expect(ccKeyFromFull('AKARAVIT KHWANNGAM')).toBe('AKARAVIT K.');
    expect(ccKeyFromFull('Anusorn')).toBe('ANUSORN');
    expect(ccKeyFromFull('')).toBe('');
    expect(ccKeyFromFull(null)).toBe('');
  });
  it('is idempotent on already-keyed forms', () => {
    expect(ccKeyFromFull('AKARAVIT K.')).toBe('AKARAVIT K.');
  });
});

describe('ccNameNorm / stripUnplanned', () => {
  it('strips (Unplanned) and uppercases', () => {
    expect(ccNameNorm('Pichakorn Jirapinyo (Unplanned)')).toBe('PICHAKORN JIRAPINYO');
    expect(ccNameNorm(' p-korn ')).toBe('P-KORN');
  });
  it('stripUnplanned preserves case', () => {
    expect(stripUnplanned('SETASIT P. (Unplanned)')).toBe('SETASIT P.');
    expect(stripUnplanned('SETASIT P.')).toBe('SETASIT P.');
  });
});

describe('makeOpsStudentKey (nick bridge)', () => {
  const students = [
    { name: 'Pichakorn Jirapinyo', nick: 'P-KORN' },
    { name: 'Akaravit Khwanngam', nick: 'A-VIT' },
  ];
  const key = makeOpsStudentKey(students);

  it('passes through the standard FIRST L. form', () => {
    expect(key('PICHAKORN J.')).toBe('PICHAKORN J.');
  });
  it('collapses a full name (Unplanned record)', () => {
    expect(key('PICHAKORN JIRAPINYO (Unplanned)')).toBe('PICHAKORN J.');
  });
  it('bridges a bare callsign via the nick map', () => {
    expect(key('P-KORN')).toBe('PICHAKORN J.');
    expect(key('a-vit')).toBe('AKARAVIT K.');
  });
  it('leaves unresolved spelling variants as orphans (reduced form)', () => {
    expect(key('SAETASIT PITTAYATHIKHUN')).toBe('SAETASIT P.');
  });
});
