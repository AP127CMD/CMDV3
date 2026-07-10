// Data access. The app reads ONLY its own snapshots — it never calls the
// upstream workers (protects their free-tier quotas; V2 keeps its live fetch,
// V3 deliberately does not).
//
// Freshness note: snapshots are committed hourly by the refresh workflow, but
// the deployed site only rebuilds on code deploys. The repo's raw URL is
// therefore the FRESH source; the same-origin copy is the offline/fallback.
// Only this module knows the data base URLs (swappable by design).

const RAW_BASE = 'https://raw.githubusercontent.com/AP127CMD/CMDV3/main/public/data';
const LOCAL_BASE = '/data';

const ORDER: string[] = import.meta.env.DEV ? [LOCAL_BASE, RAW_BASE] : [RAW_BASE, LOCAL_BASE];

export type DataFileName = 'flights.json' | 'progress.json' | 'ngt.json' | 'manifest.json';

export interface Fetched<T> {
  data: T;
  /** Which base served it — 'live' (raw repo) or 'bundled' (same-origin). */
  origin: 'live' | 'bundled';
}

export async function fetchDataFile<T>(name: DataFileName): Promise<Fetched<T>> {
  let lastErr: unknown;
  for (const base of ORDER) {
    try {
      const res = await fetch(`${base}/${name}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      return { data, origin: base === RAW_BASE ? 'live' : 'bundled' };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`all data sources failed for ${name}: ${String(lastErr)}`);
}
