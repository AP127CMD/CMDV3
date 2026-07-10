// Client for the existing ap127-watchdog Cloudflare Worker — consumed
// unchanged, per the plan's hard rule (no changes to worker business logic;
// only its CORS allowlist gained one entry for this origin). This is the
// ONLY place in V3 that talks to a service other than the ingest pipeline's
// own /data/*.json files.

const WORKER_URL = 'https://ap127-watchdog.anusorn-tanmetha.workers.dev';

export interface WatchdogStatus {
  lastRun: string | null;
  lastChange: string | null;
  lastError: string | null;
  runCount: number;
  enabled: boolean;
}

export interface RosterEntry {
  scheduleName: string;
  telegramUsername: string | null;
}

export interface Destination {
  label: string;
  chatId: string;
  threadId: number | null;
  batchFilter: '*' | string | string[];
  mention: boolean;
  enabled: boolean;
  studentFilter?: string | null;
}

export interface WatchdogConfig {
  enabled: boolean;
  roster: RosterEntry[];
  eventTypes: Record<string, boolean>;
  destinations: Destination[];
}

export interface LogEntry {
  type: 'ADDED' | 'REMOVED' | 'CHANGED' | 'STATUS';
  flightId: string;
  student: string;
  lesson: string;
  date: string;
  start: string;
  end: string;
  tail: string;
  instructor: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  ts: string;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, opts);
  if (!res.ok) throw new Error(`watchdog API ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const getStatus = () => apiFetch<WatchdogStatus>('/status');
export const getConfig = () => apiFetch<WatchdogConfig>('/config');
export const getLog = (month: string) => apiFetch<LogEntry[]>(`/log?month=${month}`);

export async function postConfig(apiKey: string, config: WatchdogConfig): Promise<void> {
  await apiFetch('/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(config),
  });
}

export async function postTest(apiKey: string, destLabel: string, message: string): Promise<{ ok: boolean; error?: string }> {
  return apiFetch('/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ destLabel, message }),
  });
}

const KEY_STORAGE = 'ap127v3-watchdog-key';
export const getStoredApiKey = () => localStorage.getItem(KEY_STORAGE);
export const setStoredApiKey = (key: string) => localStorage.setItem(KEY_STORAGE, key);
export const clearStoredApiKey = () => localStorage.removeItem(KEY_STORAGE);
