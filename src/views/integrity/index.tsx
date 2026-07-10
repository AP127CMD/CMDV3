// Data Integrity: the "can I trust this data?" destination.
//   crosscheck — the reconcile engine with live tolerance sliders
//   sources    — manifest viewer: provenance, transforms, validation, diffs
//   changes    — last-diff summary per source

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip, Kpi, LoadingBlock, Panel, Tag } from '@/components/atoms';
import { useFlights, useManifest, useStudents } from '@/data/queries';
import { reconcile } from '@/domain/reconcile';
import type { SourceManifest } from '@/domain/types';

type Tab = 'crosscheck' | 'sources' | 'changes';

export default function IntegrityView() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'crosscheck';
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(sp);
    n.set('tab', t);
    setSp(n, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-display text-[18px] font-bold tracking-wider uppercase">
          Data <span className="text-highlight">Integrity</span>
        </div>
        <div className="ml-auto flex gap-1">
          <Chip active={tab === 'crosscheck'} onClick={() => setTab('crosscheck')}>Cross-check</Chip>
          <Chip active={tab === 'sources'} onClick={() => setTab('sources')}>Sources</Chip>
          <Chip active={tab === 'changes'} onClick={() => setTab('changes')}>Changes</Chip>
        </div>
      </div>
      {tab === 'crosscheck' && <CrossCheckTab />}
      {tab === 'sources' && <SourcesTab />}
      {tab === 'changes' && <ChangesTab />}
    </div>
  );
}

// ── Cross-check ─────────────────────────────────────────────────────────────

function CrossCheckTab() {
  const { flights, isLoading } = useFlights();
  const { students } = useStudents();
  const [durTol, setDurTol] = useState(20);
  const [dateTol, setDateTol] = useState(1);
  const [filter, setFilter] = useState<'all' | 'conflict' | 'review'>('all');

  const res = useMemo(
    () =>
      flights.length && students.length
        ? reconcile(flights, students, { durTolMin: durTol, dateTolDays: dateTol })
        : null,
    [flights, students, durTol, dateTol],
  );

  if (isLoading || !res) return <LoadingBlock label="running reconciliation…" />;

  const rows = res.rows.filter((r) => (filter === 'all' ? true : r.sev === filter));

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Kpi label="Consistency" value={`${res.totals.consistency}%`} sub={`${res.totals.checked} pairings checked`} color={res.totals.consistency >= 90 ? 'var(--col-done)' : 'var(--col-pending)'} />
        <Kpi label="OK" value={res.totals.ok} color="var(--col-done)" />
        <Kpi label="Review" value={res.totals.review} sub={`date Δ>${dateTol}d or dur Δ>${durTol}m`} color="var(--col-pending)" />
        <Kpi label="Conflicts" value={res.totals.conflict} sub="one side only" color="var(--col-cancel)" />
        <Kpi label="Window" value={<span className="text-[12px]">{res.totals.windowStart}</span>} sub="ops history starts here" />
        <Kpi label="Ops orphans" value={res.totals.orphanOps.length} sub={res.totals.orphanOps.join(', ') || 'none'} color="var(--col-pending)" />
      </div>

      <Panel title="Tolerances — reruns the engine live" hint="defaults: 20m / 1d">
        <div className="flex flex-wrap items-center gap-4">
          <label className="mono flex items-center gap-2 text-[10px] text-ink-2">
            duration ±
            <input type="range" min={5} max={60} step={5} value={durTol} onChange={(e) => setDurTol(+e.target.value)} className="accent-[var(--highlight)]" />
            <b className="num w-9">{durTol}m</b>
          </label>
          <label className="mono flex items-center gap-2 text-[10px] text-ink-2">
            date ±
            <input type="range" min={0} max={7} value={dateTol} onChange={(e) => setDateTol(+e.target.value)} className="accent-[var(--highlight)]" />
            <b className="num w-6">{dateTol}d</b>
          </label>
        </div>
      </Panel>

      <Panel
        title="Discrepancies"
        hint={
          <span className="flex gap-1">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All · {res.rows.length}</Chip>
            <Chip active={filter === 'conflict'} onClick={() => setFilter('conflict')}>Conflict</Chip>
            <Chip active={filter === 'review'} onClick={() => setFilter('review')}>Review</Chip>
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[10.5px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="px-2 py-1.5 text-left">Sev</th>
                <th className="px-2 text-left">Student</th>
                <th className="px-2 text-left">Lesson</th>
                <th className="px-2 text-left">Date</th>
                <th className="px-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line-soft align-top hover:bg-bg-2">
                  <td className="px-2 py-1.5">
                    <Tag color={r.sev === 'conflict' ? 'var(--col-cancel)' : 'var(--col-pending)'}>
                      {r.type.replace(/_/g, ' ').toUpperCase()}
                    </Tag>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Link to={`/student/${r.nick}`} className="font-semibold text-ink hover:text-[var(--highlight)]">
                      {r.nick} · {r.key}
                    </Link>
                  </td>
                  <td className="mono px-2 py-1.5 whitespace-nowrap">{r.lesson}</td>
                  <td className="mono px-2 py-1.5 whitespace-nowrap text-ink-2">{r.date}</td>
                  <td className="px-2 py-1.5 text-[10px] text-ink-2">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Per student" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[10.5px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="px-2 py-1.5 text-left">Student</th>
                <th className="px-2 text-right">Prog done</th>
                <th className="px-2 text-right">Ops completed</th>
                <th className="px-2 text-right">OK</th>
                <th className="px-2 text-right">Review</th>
                <th className="px-2 text-right">Conflict</th>
              </tr>
            </thead>
            <tbody>
              {res.perStudent.map((s) => (
                <tr key={s.key} className="border-b border-line-soft hover:bg-bg-2">
                  <td className="px-2 py-1">
                    <Link to={`/student/${s.nick}`} className="font-semibold text-ink hover:text-[var(--highlight)]">
                      {s.nick} · {s.key}
                    </Link>
                  </td>
                  <td className="mono num px-2 text-right">{s.progDone}</td>
                  <td className="mono num px-2 text-right">{s.ccCompleted}</td>
                  <td className="mono num px-2 text-right" style={{ color: 'var(--col-done)' }}>{s.ok}</td>
                  <td className="mono num px-2 text-right" style={{ color: s.review ? 'var(--col-pending)' : 'var(--ink-3)' }}>{s.review}</td>
                  <td className="mono num px-2 text-right" style={{ color: s.conflict ? 'var(--col-cancel)' : 'var(--ink-3)' }}>{s.conflict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ── Sources (manifest viewer) ───────────────────────────────────────────────

const SRC_TITLE: Record<string, string> = {
  flights: 'Operations — flight schedule',
  progress: 'Progress — AP127 curriculum',
  ngt: 'Training program — all batches',
};

function ago(iso: string | undefined | null): string {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

function SourceCard({ id, m }: { id: string; m: SourceManifest }) {
  return (
    <Panel title={SRC_TITLE[id] ?? id} hint={m.validation.errors.length ? '⚠ LAST FETCH FAILED' : 'healthy'}
      accent={m.validation.errors.length ? 'var(--col-cancel)' : 'var(--col-done)'}>
      <div className="mono grid grid-cols-1 gap-1 text-[10px] text-ink-2 sm:grid-cols-2">
        <div>
          <span className="text-ink-3">source · </span>
          <span className="break-all">{m.sourceUrl}</span>
        </div>
        <div><span className="text-ink-3">data as of · </span>{m.lastChangedAt} ({ago(m.lastChangedAt)})</div>
        <div><span className="text-ink-3">last checked · </span>{m.fetchedAt} ({ago(m.fetchedAt)})</div>
        <div><span className="text-ink-3">upstream stamp · </span>{m.upstreamFetchedAt ?? '—'}</div>
        <div className="break-all"><span className="text-ink-3">content hash · </span>{m.contentHash.slice(0, 23)}…</div>
        <div>
          <span className="text-ink-3">records · </span>
          {Object.entries(m.records).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ')}
        </div>
      </div>
      {m.transforms && (
        <div className="mono mt-2 flex flex-wrap gap-1 text-[9px]">
          {Object.entries(m.transforms).map(([k, v]) => (
            <Tag key={k} color={v ? 'var(--col-stby)' : 'var(--ink-3)'}>
              {k}: {v}
            </Tag>
          ))}
        </div>
      )}
      {[...m.validation.errors, ...m.validation.warnings].map((w, i) => (
        <div key={i} className="mt-2 rounded border px-2 py-1.5 text-[10px]" style={{
          borderColor: m.validation.errors.includes(w) ? 'var(--col-cancel)' : 'var(--col-pending)',
          color: m.validation.errors.includes(w) ? 'var(--col-cancel)' : 'var(--col-pending)',
        }}>
          <b className="mono">{w.code}</b>
          {w.count != null && <b> ×{w.count}</b>} — {w.message}
          {w.samples && w.samples.length > 0 && (
            <div className="mono mt-0.5 text-[9px] opacity-80">e.g. {w.samples.slice(0, 4).join(' · ')}</div>
          )}
        </div>
      ))}
    </Panel>
  );
}

function SourcesTab() {
  const q = useManifest();
  if (q.isLoading) return <LoadingBlock />;
  const man = q.data?.data;
  if (!man) return <LoadingBlock label="manifest unavailable" />;
  return (
    <>
      <div className="mono uc text-[9px] text-ink-3">
        pipeline v{man.pipelineVersion} · manifest generated {man.generatedAt} · snapshots refresh hourly; “data as of” = last REAL content change (quiet upstream ≠ stale pipeline)
      </div>
      {Object.entries(man.sources).map(([id, m]) => (
        <SourceCard key={id} id={id} m={m} />
      ))}
    </>
  );
}

// ── Changes ─────────────────────────────────────────────────────────────────

function ChangesTab() {
  const q = useManifest();
  if (q.isLoading) return <LoadingBlock />;
  const man = q.data?.data;
  if (!man) return <LoadingBlock label="manifest unavailable" />;
  return (
    <>
      <div className="mono uc text-[9px] text-ink-3">what changed in the last committed refresh, per source</div>
      {Object.entries(man.sources).map(([id, m]) => (
        <Panel key={id} title={SRC_TITLE[id] ?? id} hint={`as of ${m.lastChangedAt}`}>
          {m.diff ? (
            <div className="flex flex-wrap gap-1.5">
              <Kpi label="Added" value={m.diff.added} color="var(--col-done)" />
              <Kpi label="Removed" value={m.diff.removed} color="var(--col-cancel)" />
              <Kpi label="Changed" value={m.diff.changed} color="var(--col-pending)" />
              {m.diff.changedFields &&
                Object.entries(m.diff.changedFields).map(([f, n]) => (
                  <Kpi key={f} label={`Δ ${f}`} value={n} />
                ))}
            </div>
          ) : (
            <div className="mono text-[10px] text-ink-3">
              no diff recorded (first snapshot, or no prior committed file to compare)
            </div>
          )}
        </Panel>
      ))}
    </>
  );
}
