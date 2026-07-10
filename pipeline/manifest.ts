// Provenance assembly: content hashes, last-changed stamps, diffs vs the
// previously committed snapshot. This is the traceability spine the UI reads.

import type { Flight, Manifest, SourceManifest, Student, ValidationIssue } from '../src/domain/types';
import { sha256, stableStringify, stripVolatile } from './io';

export const PIPELINE_VERSION = '3.0.0';
export const SCHEMA_VERSION = 1;

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  changedFields?: Record<string, number>;
}

/** Generic keyed-record diff with per-field change counting. */
export function diffRecords<T extends Record<string, unknown>>(
  prev: readonly T[] | null,
  next: readonly T[],
  keyOf: (r: T) => string,
  fields: readonly string[],
): DiffSummary | null {
  if (!prev) return null;
  const prevMap = new Map(prev.map((r) => [keyOf(r), r]));
  const nextMap = new Map(next.map((r) => [keyOf(r), r]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  const changedFields: Record<string, number> = {};
  for (const k of nextMap.keys()) if (!prevMap.has(k)) added++;
  for (const k of prevMap.keys()) if (!nextMap.has(k)) removed++;
  for (const [k, n] of nextMap) {
    const p = prevMap.get(k);
    if (!p) continue;
    let rowChanged = false;
    for (const f of fields) {
      if (JSON.stringify(p[f] ?? null) !== JSON.stringify(n[f] ?? null)) {
        changedFields[f] = (changedFields[f] ?? 0) + 1;
        rowChanged = true;
      }
    }
    if (rowChanged) changed++;
  }
  return {
    added,
    removed,
    changed,
    ...(Object.keys(changedFields).length ? { changedFields } : {}),
  };
}

/** The watchdog-tracked fields — a change in any of these is a real change. */
export const FLIGHT_DIFF_FIELDS = [
  'date',
  'start',
  'end',
  'status',
  'instructor',
  'tail',
  'lesson',
  'durMin',
] as const;

export const STUDENT_DIFF_FIELDS = ['done', 'total', 'nextLesson'] as const;

export function diffFlights(prev: Flight[] | null, next: Flight[]): DiffSummary | null {
  return diffRecords(
    prev as unknown as Record<string, unknown>[] | null,
    next as unknown as Record<string, unknown>[],
    (r) => String(r.id),
    FLIGHT_DIFF_FIELDS,
  );
}

export function diffStudents(prev: Student[] | null, next: Student[]): DiffSummary | null {
  return diffRecords(
    prev as unknown as Record<string, unknown>[] | null,
    next as unknown as Record<string, unknown>[],
    (r) => String(r.catcId),
    STUDENT_DIFF_FIELDS,
  );
}

export interface SourceManifestInput {
  sourceUrl: string;
  fetchedAt: string;
  upstreamFetchedAt?: string | null;
  payloadForHash: unknown; // normalized payload (records only, no stamps)
  records: Record<string, number>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  transforms?: Record<string, number>;
  diff?: DiffSummary | null;
  /** Previous manifest entry, to carry lastChangedAt forward on no-change runs. */
  prev?: SourceManifest | null;
  changed: boolean;
}

export function buildSourceManifest(input: SourceManifestInput): SourceManifest {
  const contentHash = sha256(stripVolatile(stableStringify(input.payloadForHash)));
  const lastChangedAt = input.changed
    ? input.fetchedAt
    : (input.prev?.lastChangedAt ?? input.fetchedAt);
  return {
    sourceUrl: input.sourceUrl,
    fetchedAt: input.fetchedAt,
    upstreamFetchedAt: input.upstreamFetchedAt ?? null,
    contentHash,
    lastChangedAt,
    records: input.records,
    validation: { errors: input.errors, warnings: input.warnings },
    ...(input.transforms ? { transforms: input.transforms } : {}),
    diff: input.diff ?? null,
  };
}

export function buildManifest(
  generatedAt: string,
  sources: Manifest['sources'],
): Manifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    generatedAt,
    sources,
  };
}
