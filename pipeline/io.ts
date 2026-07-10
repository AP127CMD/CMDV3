// Pipeline I/O primitives: resilient fetch, stable hashing, write-if-changed.
// Patterns mirror V2 scripts/refresh_snapshots.mjs (3 retries / 15s backoff,
// only-commit-on-real-change), which have run cleanly in CI since 2026-05-31.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FetchOpts {
  attempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
  minBytes?: number;
}

export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<string> {
  const attempts = opts.attempts ?? 3;
  const backoffMs = opts.backoffMs ?? 15_000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const minBytes = opts.minBytes ?? 100;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'ap127-cmdv3-ingest' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < minBytes) throw new Error(`response too small (${text.length} bytes)`);
      return text;
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        console.warn(`  retry ${i}/${attempts - 1} for ${url}: ${String(e)}`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw new Error(`fetch failed after ${attempts} attempts: ${url} — ${String(lastErr)}`);
}

/** Deterministic JSON: object keys sorted at every level. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export function sha256(text: string): string {
  return 'sha256:' + createHash('sha256').update(text).digest('hex');
}

export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Write pretty JSON only when the content differs from what's on disk after
 * stripping volatile fields (generatedAt / fetchedAt). Returns true if written.
 */
export function writeJsonIfChanged(path: string, value: unknown): boolean {
  const next = JSON.stringify(value, null, 1);
  if (existsSync(path)) {
    const prev = readFileSync(path, 'utf8');
    if (stripVolatile(prev) === stripVolatile(next)) return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}

/** Remove run-stamp fields so "no real change" compares equal (V2 strip()). */
export function stripVolatile(json: string): string {
  return json
    .replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":""')
    .replace(/"fetchedAt":\s*"[^"]*"/g, '"fetchedAt":""');
}
