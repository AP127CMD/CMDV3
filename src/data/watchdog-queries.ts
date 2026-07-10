import { useQuery } from '@tanstack/react-query';
import { getConfig, getLog, getStatus } from './watchdog';

// The watchdog worker's CORS allowlist only includes the deployed origin
// (ap127-v3.pages.dev), not localhost — a network-level CORS failure in
// local dev is therefore expected, not a bug. retry:false so it surfaces
// as an error immediately instead of retrying for ~30s before giving up.
const NO_RETRY = { retry: false as const };

export function useWatchdogStatus() {
  return useQuery({ queryKey: ['watchdog', 'status'], queryFn: getStatus, refetchInterval: 60_000, ...NO_RETRY });
}

export function useWatchdogConfig() {
  return useQuery({ queryKey: ['watchdog', 'config'], queryFn: getConfig, ...NO_RETRY });
}

export function useWatchdogLog(month: string) {
  return useQuery({ queryKey: ['watchdog', 'log', month], queryFn: () => getLog(month), ...NO_RETRY });
}
