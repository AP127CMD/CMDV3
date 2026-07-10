// Watchdog admin — consumes the existing ap127-watchdog worker API
// unchanged (only its CORS allowlist gained this origin). Read-heavy: full
// status/roster/destinations/log visibility works immediately; the two
// write operations (save config, send test) require the same X-API-Key V2
// uses, entered once and stored locally — never hardcoded or exposed here.

import { useMemo, useState } from 'react';
import { Chip, EmptyState, Kpi, LoadingBlock, Panel, Tag } from '@/components/atoms';
import { useWatchdogConfig, useWatchdogLog, useWatchdogStatus } from '@/data/watchdog-queries';
import { clearStoredApiKey, getStoredApiKey, postTest, setStoredApiKey, type Destination } from '@/data/watchdog';
import { bkkToday } from '@/domain/dates';

type Tab = 'status' | 'roster' | 'destinations' | 'log';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export default function WatchdogView() {
  const [tab, setTab] = useState<Tab>('status');
  const status = useWatchdogStatus();
  const config = useWatchdogConfig();

  if (status.isError || config.isError) {
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return (
      <div className="p-4">
        <EmptyState
          title="Cannot reach the watchdog worker"
          hint={
            isLocalDev
              ? 'Expected in local dev: the worker only allows CORS from ap127-v3.pages.dev, not localhost. This will work once deployed.'
              : "Transient network issue, or the worker's CORS allowlist needs this origin — check the browser console for the exact error."
          }
        />
      </div>
    );
  }
  if (!status.data || !config.data) return <LoadingBlock label="connecting to watchdog worker…" />;

  const s = status.data;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">Watchdog</div>
          <div className="mono uc text-[9px] text-ink-3">flight-change monitor — Telegram notifications</div>
        </div>
        <div className="ml-auto flex gap-1">
          <Chip active={tab === 'status'} onClick={() => setTab('status')}>Status</Chip>
          <Chip active={tab === 'roster'} onClick={() => setTab('roster')}>Roster</Chip>
          <Chip active={tab === 'destinations'} onClick={() => setTab('destinations')}>Destinations</Chip>
          <Chip active={tab === 'log'} onClick={() => setTab('log')}>Log</Chip>
        </div>
      </div>

      {/* Always-visible status strip */}
      <div className="flex flex-wrap gap-1.5">
        <Kpi
          label="State"
          value={s.enabled ? 'ACTIVE' : 'DISABLED'}
          color={s.lastError ? 'var(--col-cancel)' : s.enabled ? 'var(--col-done)' : 'var(--col-pending)'}
        />
        <Kpi label="Last run" value={ago(s.lastRun)} sub={s.lastRun ?? ''} />
        <Kpi label="Last change" value={ago(s.lastChange)} sub={s.lastChange ?? ''} />
        <Kpi label="Run count" value={s.runCount.toLocaleString()} />
        {s.lastError && <Kpi label="Last error" value={<span className="text-[10px]">{s.lastError}</span>} color="var(--col-cancel)" />}
      </div>

      {tab === 'status' && <TestPanel />}
      {tab === 'roster' && <RosterTab />}
      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'log' && <LogTab />}
    </div>
  );
}

// ── Status / Test ────────────────────────────────────────────────────────

function ApiKeyGate({ onSet }: { onSet: (key: string) => void }) {
  const [input, setInput] = useState('');
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="X-API-Key"
        className="mono rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink outline-none"
      />
      <button
        type="button"
        onClick={() => {
          if (input.trim()) {
            setStoredApiKey(input.trim());
            onSet(input.trim());
          }
        }}
        className="mono uc cursor-pointer rounded border border-line bg-surface px-2 py-1 text-[9px] font-bold text-ink-2 hover:text-ink"
      >
        Unlock
      </button>
    </div>
  );
}

function TestPanel() {
  const config = useWatchdogConfig();
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());
  const [message, setMessage] = useState('Test notification from AP127 CMD V3.');
  const [results, setResults] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const destinations = config.data?.destinations ?? [];

  const send = async (label: string) => {
    if (!apiKey) return;
    setSending(label);
    try {
      const r = await postTest(apiKey, label, message);
      setResults((prev) => ({ ...prev, [label]: r.ok ? '✅ sent' : `❌ ${r.error ?? 'failed'}` }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [label]: `❌ ${String(e)}` }));
    } finally {
      setSending(null);
    }
  };

  return (
    <Panel
      title="Test panel"
      hint={
        apiKey ? (
          <button type="button" onClick={() => { clearStoredApiKey(); setApiKey(null); }} className="mono uc cursor-pointer text-[9px] text-ink-3 hover:text-ink">
            change key
          </button>
        ) : (
          <ApiKeyGate onSet={setApiKey} />
        )
      }
    >
      {!apiKey ? (
        <EmptyState title="API key required" hint="Sending test messages needs the same X-API-Key configured on the watchdog worker." />
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="mono mb-2 w-full rounded border border-line bg-bg p-2 text-[10.5px] text-ink outline-none"
          />
          <div className="flex flex-col gap-1">
            {destinations.map((d) => (
              <div key={d.label} className="flex items-center gap-2 rounded border border-line-soft bg-bg px-2 py-1.5">
                <span className="mono text-[10px] font-semibold text-ink">{d.label}</span>
                {!d.enabled && <Tag color="var(--ink-3)">disabled</Tag>}
                <span className="mono ml-auto text-[9px] text-ink-3">{results[d.label]}</span>
                <button
                  type="button"
                  disabled={sending === d.label}
                  onClick={() => send(d.label)}
                  className="mono uc cursor-pointer rounded border border-line bg-surface px-2 py-1 text-[9px] font-bold text-ink-2 hover:text-ink disabled:opacity-40"
                >
                  {sending === d.label ? 'sending…' : 'Send'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Roster ──────────────────────────────────────────────────────────────

function RosterTab() {
  const config = useWatchdogConfig();
  const roster = config.data?.roster ?? [];
  const mapped = roster.filter((r) => r.telegramUsername).length;
  return (
    <Panel title="SP roster — Telegram mapping" hint={`${mapped}/${roster.length} mapped`} bodyClassName="p-0">
      <div className="overflow-x-auto scroll-shadow-x">
        <table className="w-full min-w-[420px] border-collapse text-[10.5px]">
          <thead>
            <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
              <th className="px-2 py-1.5 text-left">Schedule name</th>
              <th className="px-2 text-left">Telegram @username</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.scheduleName} className="border-b border-line-soft">
                <td className="mono px-2 py-1 text-ink">{r.scheduleName}</td>
                <td className="mono px-2 py-1" style={{ color: r.telegramUsername ? 'var(--col-done)' : 'var(--ink-3)' }}>
                  {r.telegramUsername ? `@${r.telegramUsername}` : '— unmapped'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mono px-3 py-2 text-[9px] text-ink-3">
        Editing requires the API key (Status tab) — read-only view shown here.
      </div>
    </Panel>
  );
}

// ── Destinations ────────────────────────────────────────────────────────

function batchFilterLabel(f: Destination['batchFilter']): string {
  if (f === '*') return 'All batches';
  if (Array.isArray(f)) return f.join(', ');
  return f;
}

function DestinationsTab() {
  const config = useWatchdogConfig();
  const dests = config.data?.destinations ?? [];
  return (
    <Panel title="Destinations" hint={`${dests.length} configured`} bodyClassName="p-0">
      <div className="overflow-x-auto scroll-shadow-x">
        <table className="w-full min-w-[560px] border-collapse text-[10.5px]">
          <thead>
            <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
              <th className="px-2 py-1.5 text-left">Label</th>
              <th className="px-2 text-left">Batch filter</th>
              <th className="px-2 text-left">Student filter</th>
              <th className="px-2 text-center">@mention</th>
              <th className="px-2 text-center">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {dests.map((d) => (
              <tr key={d.label} className="border-b border-line-soft">
                <td className="mono px-2 py-1.5 font-semibold text-ink">{d.label}</td>
                <td className="mono px-2 text-ink-2">{batchFilterLabel(d.batchFilter)}</td>
                <td className="mono px-2 text-ink-2">{d.studentFilter || '—'}</td>
                <td className="px-2 text-center">{d.mention ? '✓' : ''}</td>
                <td className="px-2 text-center">
                  <Tag color={d.enabled ? 'var(--col-done)' : 'var(--ink-3)'}>{d.enabled ? 'ON' : 'OFF'}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Log ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = { ADDED: '✈️', REMOVED: '❌', CHANGED: '⚠️', STATUS: '🔄' };

function LogTab() {
  const today = bkkToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [q, setQ] = useState('');
  const log = useWatchdogLog(month);

  const months = useMemo(() => {
    const out: string[] = [];
    let [y, m] = today.slice(0, 7).split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m--;
      if (m === 0) { m = 12; y--; }
    }
    return out;
  }, [today]);

  const rows = useMemo(() => {
    const all = log.data ?? [];
    if (!q) return all;
    const needle = q.toUpperCase();
    return all.filter((e) => [e.student, e.lesson, e.date, e.type].some((v) => v.toUpperCase().includes(needle)));
  }, [log.data, q]);

  return (
    <Panel
      title="Notification log"
      hint={
        <span className="flex items-center gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" className="mono w-28 rounded border border-line bg-bg px-1.5 py-0.5 text-[9px] text-ink outline-none" />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mono rounded border border-line bg-bg px-1 py-0.5 text-[9px] text-ink"
          >
            {months.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <span className="mono text-[8px] text-ink-3">{rows.length}/{log.data?.length ?? 0}</span>
        </span>
      }
      bodyClassName="p-0"
    >
      {log.isLoading && <LoadingBlock />}
      {!log.isLoading && !rows.length && <EmptyState title="No log entries" hint="Try a different month or clear the search." />}
      {!!rows.length && (
        <div className="max-h-[60vh] overflow-y-auto overflow-x-auto scroll-shadow-x">
          <table className="w-full min-w-[680px] border-collapse text-[10px]">
            <thead className="sticky top-0 z-10 bg-bg-2">
              <tr className="mono uc text-[8px] text-ink-3">
                <th className="px-2 py-1.5 text-left">Time</th>
                <th className="px-2 text-left"> </th>
                <th className="px-2 text-left">Student</th>
                <th className="px-2 text-left">Lesson</th>
                <th className="px-2 text-left">Date</th>
                <th className="px-2 text-left">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={i} className="border-b border-line-soft hover:bg-bg-2">
                  <td className="mono px-2 py-1 text-ink-3">{e.ts.slice(11, 16)}</td>
                  <td className="px-2">{TYPE_ICON[e.type] ?? e.type}</td>
                  <td className="mono px-2 text-ink">{e.student}</td>
                  <td className="mono px-2 text-ink-2">{e.lesson}</td>
                  <td className="mono px-2 text-ink-2">{e.date}</td>
                  <td className="mono px-2 text-[9px] text-ink-3">
                    {Object.entries(e.diff).map(([k, v]) => `${k}: ${String(v.from)}→${String(v.to)}`).join('; ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
