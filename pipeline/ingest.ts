// AP127 CMD V3 data ingest: fetch → normalize → validate → diff → write.
//
// Per-source isolation (hard requirement carried from V2's CLAUDE.md): a
// transient blip on ONE upstream keeps that source's previous snapshot and
// the run continues. Only a TOTAL outage (all three failing) fails the job.
// Files are only written on real content change so the git history and the
// manifest's lastChangedAt stay meaningful.
//
// Run: npm run ingest   (tsx pipeline/ingest.ts)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchWithRetry, readJsonIfExists, writeJsonIfChanged } from './io';
import {
  UPSTREAMS,
  parseFlightDataJs,
  parseNgtJson,
  parseProgressJson,
} from './sources';
import {
  dedupeActualOnly,
  flightEnvelopeCounts,
  normalizeCurriculum,
  normalizeFlights,
  normalizeProgress,
  normalizeStudents,
  truncationCanary,
} from './transform';
import {
  buildManifest,
  buildSourceManifest,
  diffFlights,
  diffStudents,
} from './manifest';
import type {
  FlightsFile,
  Manifest,
  NgtFile,
  ProgressFile,
  SourceManifest,
  ValidationIssue,
} from '../src/domain/types';
import { bkkToday } from '../src/domain/dates';
import { holidayStalenessWarning } from '../src/domain/holidays';
import { SCHEMA_VERSION } from './manifest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');

interface SourceOutcome {
  label: string;
  ok: boolean;
  changed: boolean;
  err?: string;
  manifest?: SourceManifest;
}

async function main() {
  const now = new Date().toISOString();
  const prevManifest = readJsonIfExists<Manifest>(join(DATA_DIR, 'manifest.json'));
  const outcomes: SourceOutcome[] = [];

  // Progress students power the flights nick-bridge; keep whatever is freshest.
  const prevProgress = readJsonIfExists<ProgressFile>(join(DATA_DIR, 'progress.json'));

  // ── 1. PROGRESS ──────────────────────────────────────────────────────────
  let progressFile: ProgressFile | null = prevProgress;
  {
    const label = 'progress';
    try {
      const text = await fetchWithRetry(UPSTREAMS.progress, { minBytes: 200 });
      const raw = parseProgressJson(text);
      if (!raw.ap127.length) throw new Error('empty ap127[] — refusing');
      const canary = truncationCanary(label, prevProgress?.students.length ?? null, raw.ap127.length);
      if (canary) throw new Error(canary);
      const norm = normalizeProgress(raw);
      const payload = {
        students: norm.students,
        curriculum: norm.curriculum,
        rosterCoverage: norm.rosterCoverage,
      };
      const next: ProgressFile = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: now,
        source: { url: UPSTREAMS.progress, fetchedAt: now, upstreamFetchedAt: raw._updated ?? null },
        ...payload,
      };
      const changed = writeJsonIfChanged(join(DATA_DIR, 'progress.json'), next);
      progressFile = next;
      outcomes.push({
        label,
        ok: true,
        changed,
        manifest: buildSourceManifest({
          sourceUrl: UPSTREAMS.progress,
          fetchedAt: now,
          upstreamFetchedAt: raw._updated ?? null,
          payloadForHash: payload,
          records: { students: norm.students.length, curriculum: norm.curriculum.length },
          errors: [],
          warnings: norm.warnings,
          diff: diffStudents(prevProgress?.students ?? null, norm.students),
          prev: prevManifest?.sources.progress ?? null,
          changed,
        }),
      });
    } catch (e) {
      console.warn(`[${label}] keeping previous snapshot: ${String(e)}`);
      outcomes.push({ label, ok: false, changed: false, err: String(e) });
    }
  }

  // ── 2. FLIGHTS ───────────────────────────────────────────────────────────
  {
    const label = 'flights';
    const prevFlights = readJsonIfExists<FlightsFile>(join(DATA_DIR, 'flights.json'));
    try {
      const text = await fetchWithRetry(UPSTREAMS.flights, { minBytes: 100 });
      const raw = parseFlightDataJs(text);
      if (!raw.flights.length) throw new Error('empty flights[] — refusing');
      const canary = truncationCanary(label, prevFlights?.flights.length ?? null, raw.flights.length);
      if (canary) throw new Error(canary);

      const dedup = dedupeActualOnly(raw.flights);
      const bridgeStudents = progressFile?.students ?? [];
      const norm = normalizeFlights(dedup.flights, bridgeStudents);

      const warnings: ValidationIssue[] = [...norm.warnings];
      if (dedup.removedByKey) {
        warnings.push({
          code: 'DEDUP_KEY_FALLBACK',
          message:
            'planned Completed rows removed via student|date|lesson fallback — ACTUAL_ONLY id did not derive to a planned id; check upstream ID format',
          count: dedup.removedByKey,
          samples: dedup.fallbackSamples,
        });
      }
      const holidayWarn = holidayStalenessWarning(bkkToday());
      if (holidayWarn) {
        warnings.push({ code: 'HOLIDAYS_STALE', message: holidayWarn });
      }

      const payload = {
        flights: norm.flights,
        instructors: raw.instructors,
        resources: raw.resources,
        leaves: raw.leaves,
      };
      const next: FlightsFile = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: now,
        source: { url: UPSTREAMS.flights, fetchedAt: now, upstreamFetchedAt: raw.fetchedAt ?? null },
        ...(payload as Pick<FlightsFile, 'flights' | 'instructors' | 'resources' | 'leaves'>),
      };
      const changed = writeJsonIfChanged(join(DATA_DIR, 'flights.json'), next);
      outcomes.push({
        label,
        ok: true,
        changed,
        manifest: buildSourceManifest({
          sourceUrl: UPSTREAMS.flights,
          fetchedAt: now,
          upstreamFetchedAt: raw.fetchedAt ?? null,
          payloadForHash: payload,
          records: { ...flightEnvelopeCounts(raw), flightsAfterDedup: norm.flights.length },
          errors: [],
          warnings,
          transforms: {
            dedupRemovedById: dedup.removedById,
            dedupRemovedByKey: dedup.removedByKey,
            ...norm.transforms,
          },
          diff: diffFlights(prevFlights?.flights ?? null, norm.flights),
          prev: prevManifest?.sources.flights ?? null,
          changed,
        }),
      });
    } catch (e) {
      console.warn(`[${label}] keeping previous snapshot: ${String(e)}`);
      outcomes.push({ label, ok: false, changed: false, err: String(e) });
    }
  }

  // ── 3. NGT ───────────────────────────────────────────────────────────────
  {
    const label = 'ngt';
    try {
      const text = await fetchWithRetry(UPSTREAMS.ngt, { minBytes: 200 });
      const raw = parseNgtJson(text);
      if (!raw.ap127.length) throw new Error('empty ap127[] — refusing');
      const payload = {
        batches: {
          ap124: normalizeStudents(raw.ap124) as unknown[],
          ap126: normalizeStudents(raw.ap126) as unknown[],
          ap127: normalizeStudents(raw.ap127) as unknown[],
          ap129: normalizeStudents(raw.ap129) as unknown[],
        },
        curricula: {
          cur124: normalizeCurriculum(raw.cur124),
          cur126: normalizeCurriculum(raw.cur126),
          cur127: normalizeCurriculum(raw.cur127),
        },
        monthly: raw.monthly ?? null,
        cap: raw.cap ?? null,
      };
      const next = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: now,
        source: { url: UPSTREAMS.ngt, fetchedAt: now, upstreamFetchedAt: raw._updated ?? null },
        ...payload,
      } as unknown as NgtFile;
      const changed = writeJsonIfChanged(join(DATA_DIR, 'ngt.json'), next);
      outcomes.push({
        label,
        ok: true,
        changed,
        manifest: buildSourceManifest({
          sourceUrl: UPSTREAMS.ngt,
          fetchedAt: now,
          upstreamFetchedAt: raw._updated ?? null,
          payloadForHash: payload,
          records: {
            ap124: raw.ap124.length,
            ap126: raw.ap126.length,
            ap127: raw.ap127.length,
            ap129: raw.ap129.length,
          },
          errors: [],
          warnings: [],
          diff: null,
          prev: prevManifest?.sources.ngt ?? null,
          changed,
        }),
      });
    } catch (e) {
      console.warn(`[${label}] keeping previous snapshot: ${String(e)}`);
      outcomes.push({ label, ok: false, changed: false, err: String(e) });
    }
  }

  // ── Manifest ─────────────────────────────────────────────────────────────
  const failed = outcomes.filter((o) => !o.ok);
  const anyChanged = outcomes.some((o) => o.changed);

  const pick = (label: keyof Manifest['sources']): SourceManifest => {
    const o = outcomes.find((x) => x.label === label);
    if (o?.manifest) return o.manifest;
    const prev = prevManifest?.sources[label];
    if (prev) {
      // Source failed this run: carry the previous manifest entry forward and
      // record the failure so the UI can show "stale + why".
      return {
        ...prev,
        validation: {
          errors: [
            { code: 'FETCH_FAILED', message: o?.err ?? 'unknown failure — previous snapshot retained' },
          ],
          warnings: prev.validation.warnings,
        },
      };
    }
    throw new Error(`no data and no previous snapshot for source "${label}"`);
  };

  if (failed.length === outcomes.length) {
    throw new Error(
      `all ${outcomes.length} upstreams failed: ${failed.map((f) => `${f.label}: ${f.err}`).join(' | ')}`,
    );
  }

  const manifest = buildManifest(now, {
    flights: pick('flights'),
    progress: pick('progress'),
    ngt: pick('ngt'),
  });
  // Write the manifest when data changed OR a failure/validation state changed —
  // never on a clean no-op run (avoids hourly commit noise).
  if (anyChanged || failed.length) {
    writeJsonIfChanged(join(DATA_DIR, 'manifest.json'), manifest);
  }

  for (const o of outcomes) {
    console.log(
      `[${o.label}] ${o.ok ? 'ok' : 'FAILED'}${o.changed ? ' (changed)' : o.ok ? ' (no change)' : ''}${o.err ? ' — ' + o.err : ''}`,
    );
  }
  console.log(anyChanged ? 'snapshot(s) updated' : 'no snapshot changes');
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
