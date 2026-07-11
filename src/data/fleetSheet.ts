// Client for the CATC fleet-status Google Sheet — published CSV, fetched
// directly from the browser (it's public, no auth, same URL V2 uses). This
// is the SECOND deliberate exception to "V3 only fetches its own /data/*.json"
// (the first is watchdog.ts): the sheet is hand-edited by ops staff throughout
// the day, so mirroring it through the hourly ingest pipeline would show
// stale maintenance/cert status. Parsing lives in domain/fleetSheet.ts (pure,
// tested) — this file only owns the fetch + React Query wiring.

import { useQuery } from '@tanstack/react-query';
import { parseFleetCSV } from '@/domain/fleetSheet';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOc87NylhUtL_17hM8TWNKucAqhO84TPlK4l_H704A8AGc0Idhdt5FoggsPtwR1uCVyZixOyPppZ3B/pub?gid=1661381999&single=true&output=csv';

async function fetchFleetSheet() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`fleet sheet: HTTP ${res.status}`);
  return parseFleetCSV(await res.text());
}

export function useFleetSheet() {
  return useQuery({
    queryKey: ['fleet-sheet'],
    queryFn: fetchFleetSheet,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
