import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, stableStringify, stripVolatile, writeJsonIfChanged } from './io';

describe('stableStringify / sha256', () => {
  it('is key-order independent', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(sha256(stableStringify({ b: 1, a: 2 }))).toBe(sha256(stableStringify({ a: 2, b: 1 })));
  });
});

describe('stripVolatile', () => {
  it('neutralizes generatedAt and fetchedAt anywhere in the document', () => {
    const a = JSON.stringify({ generatedAt: '2026-01-01', source: { fetchedAt: 'x' }, n: 1 });
    const b = JSON.stringify({ generatedAt: '2027-09-09', source: { fetchedAt: 'y' }, n: 1 });
    expect(stripVolatile(a)).toBe(stripVolatile(b));
  });
});

describe('writeJsonIfChanged (idempotence)', () => {
  it('writes once, then skips identical content even with new stamps', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap127-'));
    const p = join(dir, 'out.json');
    const v1 = { generatedAt: '2026-07-10T00:00:00Z', data: [1, 2, 3] };
    expect(writeJsonIfChanged(p, v1)).toBe(true);
    const v2 = { generatedAt: '2026-07-10T01:00:00Z', data: [1, 2, 3] }; // same data, new stamp
    expect(writeJsonIfChanged(p, v2)).toBe(false);
    // original stamp retained — lastChanged semantics
    expect(JSON.parse(readFileSync(p, 'utf8')).generatedAt).toBe('2026-07-10T00:00:00Z');
    const v3 = { generatedAt: '2026-07-10T02:00:00Z', data: [1, 2, 3, 4] }; // real change
    expect(writeJsonIfChanged(p, v3)).toBe(true);
  });
});
