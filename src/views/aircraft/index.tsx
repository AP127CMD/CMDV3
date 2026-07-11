// Aircraft: fleet status + utilization heatmaps (tail / FI / SP) on one shared
// filter bar. Metrics: Block (canonical) / Airborne (reference) / Effective
// (curriculum planned minutes — the V2 p107 rule). Zero-hour rows hidden when
// filtered (p108); ◆ AP-127 toggle (p104).

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Chip, Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { FlightDrawer } from '@/components/FlightDrawer';
import { SourceInfo, METHOD_BLOCK_TIME } from '@/components/SourceInfo';
import { useFlightsFile, useNgtFile } from '@/data/queries';
import { useFleetSheet } from '@/data/fleetSheet';
import { bkkToday, dayRange } from '@/domain/dates';
import { isAP127Batch } from '@/domain/batches';
import {
  metricMins,
  normTail,
  presetRange,
  fmtHours,
  isSimType,
  U_TYPE_COLORS,
  PS_PALETTE,
  type UtilMetric,
} from '@/domain/utilization';
import { fleetCrossCheck, certDaysColor, type FleetAircraft } from '@/domain/fleetSheet';
import { batchColorVar } from '@/domain/batches';
import type { Flight } from '@/domain/types';
import { Heatmap, type HeatRow } from './Heatmap';

type Tab = 'sheet' | 'crosscheck' | 'roster' | 'utilization' | 'fistat' | 'spstat';
const PRESETS = ['7d', '14d', '30d', 'month'] as const;
const CERT_COLOR: Record<string, string> = {
  expired: 'var(--col-cancel)',
  critical: '#ff8c42',
  warn: 'var(--col-pending)',
  ok: 'var(--col-done)',
  unknown: 'var(--ink-3)',
};

export default function AircraftView() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'sheet';
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(sp);
    n.set('tab', t);
    setSp(n, { replace: true });
  };

  const file = useFlightsFile();
  const ngt = useNgtFile();
  const sheet = useFleetSheet();
  const [preset, setPreset] = useState<string>('14d');
  const [metric, setMetric] = useState<UtilMetric>('block');
  const [showSims, setShowSims] = useState(false);
  const [incPend, setIncPend] = useState(false);
  const [ap127Only, setAp127Only] = useState(false);
  const [drawer, setDrawer] = useState<Flight | null>(null);

  const today = bkkToday();
  const range = useMemo(
    () => (preset === '14d' ? { from: dayRange(today, today)[0] && addDaysSafe(today, -13), to: today } : presetRange(preset, today)),
    [preset, today],
  );
  const days = useMemo(() => dayRange(range.from, range.to), [range]);

  const flights = useMemo(() => file.data?.data.flights ?? [], [file.data]);
  const resources = useMemo(() => file.data?.data.resources ?? [], [file.data]);

  const curMap = useMemo(() => {
    if (metric !== 'effective') return {};
    const map: Record<string, number> = {};
    const cur = ngt.data?.data.curricula ?? {};
    for (const key of ['cur124', 'cur126', 'cur127']) {
      for (const c of cur[key] ?? []) if (c.lesson && c.plannedMins != null) map[c.lesson] = c.plannedMins;
    }
    return map;
  }, [metric, ngt.data]);

  const pool = useMemo(
    () =>
      flights.filter((f) => {
        if (f.date < range.from || f.date > range.to) return false;
        if (!incPend && f.status !== 'Completed') return false;
        if (incPend && f.status === 'Canceled') return false;
        if (!showSims && f.isSim) return false;
        if (ap127Only && !isAP127Batch(f.batch)) return false;
        return true;
      }),
    [flights, range, incPend, showSims, ap127Only],
  );

  const kpis = useMemo(() => {
    const hours = pool.reduce((a, f) => a + metricMins(f, metric, curMap), 0) / 60;
    const tails = new Set(pool.filter((f) => f.tail).map((f) => normTail(f.tail)));
    const fis = new Set(pool.filter((f) => f.instructor).map((f) => f.instructor));
    return { hours, flights: pool.length, tails: tails.size, fis: fis.size, avgPerTail: tails.size ? hours / tails.size : 0 };
  }, [pool, metric, curMap]);

  const heatRows: HeatRow[] = useMemo(() => {
    const keyOf = (f: Flight) =>
      tab === 'fistat' ? (f.instructor ?? '—') : tab === 'spstat' ? (f.student ?? '—') : normTail(f.tail);
    const resByTail = new Map(resources.map((r) => [normTail(r.tail), r]));
    const map = new Map<string, HeatRow>();
    for (const f of pool) {
      const k = keyOf(f);
      if (k === '—' || k === 'UNKNOWN') continue;
      let row = map.get(k);
      if (!row) {
        const res = tab === 'utilization' || tab === 'roster' ? resByTail.get(k) : undefined;
        const acType = res?.acType ?? '';
        row = {
          key: k,
          label: k,
          sub: tab === 'utilization' ? acType : tab === 'spstat' ? f.batch ?? '' : undefined,
          color:
            tab === 'utilization'
              ? (U_TYPE_COLORS[acType] ?? 'var(--col-done)')
              : tab === 'fistat'
                ? '#06b6d4'
                : batchToColor(f.batch),
          maint: res?.isMaint ?? false,
          cells: new Map(),
          total: 0,
        };
        map.set(k, row);
      }
      const h = metricMins(f, metric, curMap) / 60;
      const cell = row.cells.get(f.date) ?? row.cells.set(f.date, { hours: 0, flights: [] }).get(f.date)!;
      cell.hours += h;
      cell.flights.push(f);
      row.total += h;
    }
    return [...map.values()].filter((r) => r.total > 0.01).sort((a, b) => b.total - a.total);
  }, [pool, tab, metric, curMap, resources]);

  if (file.isLoading) return <LoadingBlock label="loading fleet…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-display text-[18px] font-bold tracking-wider uppercase">
          Aircraft <span className="text-highlight">&amp; Crew Load</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          <Chip active={tab === 'sheet'} onClick={() => setTab('sheet')}>Fleet</Chip>
          <Chip active={tab === 'crosscheck'} onClick={() => setTab('crosscheck')}>
            OPS Cross-Check{sheet.data && <XCheckBadge aircraft={sheet.data.aircraft} resources={resources} />}
          </Chip>
          <Chip active={tab === 'roster'} onClick={() => setTab('roster')}>Roster</Chip>
          <Chip active={tab === 'utilization'} onClick={() => setTab('utilization')}>Utilization</Chip>
          <Chip active={tab === 'fistat'} onClick={() => setTab('fistat')}>FI Stat</Chip>
          <Chip active={tab === 'spstat'} onClick={() => setTab('spstat')}>SP Stat</Chip>
        </div>
      </div>

      {(tab === 'sheet' || tab === 'crosscheck') && (
        <FleetSheetSummary
          sheet={sheet}
          resources={resources}
          tab={tab}
        />
      )}

      {tab !== 'sheet' && tab !== 'crosscheck' && (
        <>
          {/* Shared filter bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>{p}</Chip>
            ))}
            <span className="mx-1 hidden text-ink-3 sm:inline">·</span>
            {(['block', 'airborne', 'effective'] as UtilMetric[]).map((m) => (
              <Chip key={m} active={metric === m} onClick={() => setMetric(m)}>{m}</Chip>
            ))}
            <span className="mx-1 hidden text-ink-3 sm:inline">·</span>
            <Chip active={showSims} onClick={() => setShowSims(!showSims)}>+Sims</Chip>
            <Chip active={incPend} onClick={() => setIncPend(!incPend)}>+Pending</Chip>
            <Chip active={ap127Only} onClick={() => setAp127Only(!ap127Only)}>◆ AP-127</Chip>
            <SourceInfo
              refSpec={{
                sources: metric === 'effective' ? ['flights', 'ngt'] : ['flights'],
                basis: `${range.from} → ${range.to} · ${incPend ? 'completed+pending' : 'completed only'}${ap127Only ? ' · AP-127 only' : ''}`,
                method:
                  metric === 'block'
                    ? METHOD_BLOCK_TIME
                    : metric === 'airborne'
                      ? 'Airborne time — reference comparison only; official hours use block time.'
                      : 'Effective: curriculum planned minutes per lesson; split “/1” = full planned, “/2+” = 0; unknown lesson = block.',
              }}
            />
          </div>

          {/* KPI strip */}
          <div className="flex flex-wrap gap-1.5">
            <Kpi label={`${metric} hours`} value={kpis.hours.toFixed(1)} color="var(--col-done)" />
            <Kpi label="Flights" value={kpis.flights} />
            <Kpi label="Active A/C" value={kpis.tails} />
            <Kpi label="Active FI" value={kpis.fis} />
            <Kpi label="Avg / A/C" value={fmtHours(kpis.avgPerTail)} />
          </div>
        </>
      )}

      {tab === 'sheet' && <LiveFleetTab sheet={sheet} />}
      {tab === 'crosscheck' && <CrossCheckTab sheet={sheet} resources={resources} />}
      {tab === 'roster' && <FleetTab resources={resources} pool={pool} metric={metric} curMap={curMap} />}
      {(tab === 'utilization' || tab === 'fistat' || tab === 'spstat') && (
        <Panel
          title={tab === 'utilization' ? 'Tail × day heatmap' : tab === 'fistat' ? 'Instructor × day heatmap' : 'Student × day heatmap'}
          hint="cell = hours · click for flights · zero rows hidden"
          bodyClassName="p-0"
        >
          <Heatmap rows={heatRows} days={days} onOpen={setDrawer} />
        </Panel>
      )}

      <FlightDrawer flight={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function batchToColor(batch: string | null): string {
  const v = batchColorVar(batch);
  return v === 'var(--ink-3)' ? PS_PALETTE[6] : v;
}

function addDaysSafe(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Live fleet sheet (Google Sheet — hand-edited by ops staff) ───────────────

type SheetQuery = ReturnType<typeof useFleetSheet>;
type Resource = { tail: string; acType: string; isMaint: boolean };

function shortModel(m: string): string {
  return m.replace('Diamond ', '').replace('Robinson ', '');
}

function XCheckBadge({ aircraft, resources }: { aircraft: readonly FleetAircraft[]; resources: readonly Resource[] }) {
  const conflicts = fleetCrossCheck(aircraft, resources).filter((r) => r.conflict).length;
  if (conflicts === 0) return <span className="ml-1 text-[9px] text-[var(--col-done)] opacity-80">✓</span>;
  return (
    <span className="ml-1 rounded-full border border-[var(--col-cancel)] px-1.5 text-[9px] font-bold text-[var(--col-cancel)]" style={{ background: 'color-mix(in oklch, var(--col-cancel) 18%, transparent)' }}>
      {conflicts}
    </span>
  );
}

function FleetSheetSummary({ sheet, resources, tab }: { sheet: SheetQuery; resources: readonly Resource[]; tab: 'sheet' | 'crosscheck' }) {
  const data = sheet.data;
  const models = useMemo(() => (data ? [...new Set(data.aircraft.map((a) => a.model))] : []), [data]);
  const stats = useMemo(() => {
    if (!data) return null;
    const ac = data.aircraft;
    const flyable = ac.filter((a) => a.flyable).length;
    const expiring = ac.filter(
      (a) => (a.acCertDays !== null && a.acCertDays >= 0 && a.acCertDays <= 60) || (a.coaCertDays !== null && a.coaCertDays >= 0 && a.coaCertDays <= 60),
    ).length;
    return {
      total: ac.length,
      flyable,
      grounded: ac.length - flyable,
      expiring,
      byModel: models.map((m) => ({ model: m, total: ac.filter((a) => a.model === m).length, flyable: ac.filter((a) => a.model === m && a.flyable).length })),
    };
  }, [data, models]);

  return (
    <div className="flex flex-col gap-2">
      <div className="mono uc flex flex-wrap items-center gap-2 text-[9px] text-ink-3">
        {data?.meta.lastUpdate && (
          <span>
            Sheet updated: <b className="text-ink-2">{data.meta.lastUpdate}</b>
            {data.meta.updatedBy && <span> · By: {data.meta.updatedBy}</span>}
          </span>
        )}
        {sheet.isFetching && <span style={{ color: 'var(--col-pending)' }}>⟳ refreshing…</span>}
        {sheet.isError && <span style={{ color: 'var(--col-cancel)' }}>⚠ {(sheet.error as Error)?.message ?? 'failed to load'}</span>}
        <button type="button" onClick={() => sheet.refetch()} className="cursor-pointer rounded border border-line px-1.5 py-0.5 hover:border-[var(--highlight)]">⟳ Refresh</button>
        <span className="ml-auto normal-case">Source: live Google Sheet (ops-maintained), 5-min auto-refresh — not the ingest pipeline</span>
      </div>
      {stats && (
        <div className="flex flex-wrap gap-2">
          {[
            { val: stats.total, label: 'Total', col: 'var(--ink)' },
            { val: stats.flyable, label: 'Flyable', col: 'var(--col-done)' },
            { val: stats.grounded, label: 'Grounded', col: 'var(--col-cancel)' },
            { val: stats.expiring, label: '≤60d cert', col: '#ff8c42' },
          ].map((s) => (
            <div key={s.label} className="min-w-16 rounded-lg border border-line bg-surface px-3.5 py-1.5 text-center">
              <div className="num text-[20px] font-bold" style={{ color: s.col }}>{s.val}</div>
              <div className="mono uc mt-0.5 text-[8.5px] text-ink-3">{s.label}</div>
            </div>
          ))}
          <div className="mx-1 w-px self-stretch bg-line" />
          {stats.byModel.map((m) => (
            <div key={m.model} className="min-w-20 rounded-lg border border-line bg-surface px-2.5 py-1">
              <div className="mono text-[10px] font-semibold whitespace-nowrap text-ink-2">{shortModel(m.model)}</div>
              <div className="mono mt-0.5 text-[11px]">
                <span className="font-bold" style={{ color: 'var(--col-done)' }}>{m.flyable}</span>
                <span className="text-ink-3"> / {m.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mono uc text-[9px] text-ink-3">
        {tab === 'sheet' ? `${data?.aircraft.length ?? 0} aircraft` : `cross-checking ${data?.aircraft.length ?? 0} sheet rows against ${resources.filter((r) => !/SIM|Classroom/i.test(r.acType)).length} ops resources`}
      </div>
    </div>
  );
}

function LiveFleetTab({ sheet }: { sheet: SheetQuery }) {
  const [filterModels, setFilterModels] = useState<string[]>([]);
  const [filterFlyable, setFilterFlyable] = useState<'All' | 'Flyable' | 'Grounded'>('All');
  const data = sheet.data;
  const models = useMemo(() => (data ? [...new Set(data.aircraft.map((a) => a.model))] : []), [data]);
  const today = bkkToday();

  const filtered = useMemo(() => {
    if (!data) return [];
    let arr = data.aircraft;
    if (filterModels.length) arr = arr.filter((a) => filterModels.includes(a.model));
    if (filterFlyable === 'Flyable') arr = arr.filter((a) => a.flyable);
    if (filterFlyable === 'Grounded') arr = arr.filter((a) => !a.flyable);
    return arr;
  }, [data, filterModels, filterFlyable]);

  if (sheet.isLoading) return <LoadingBlock label="loading fleet sheet…" />;
  if (sheet.isError && !data) {
    return (
      <Panel title="Fleet">
        <div className="mono py-6 text-center text-[11px]" style={{ color: 'var(--col-cancel)' }}>
          Failed to load: {(sheet.error as Error)?.message}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Fleet" hint={`${filtered.length} aircraft`} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft p-2">
        <span className="mono uc text-[9px] text-ink-3">Model:</span>
        <Chip active={filterModels.length === 0} onClick={() => setFilterModels([])}>All</Chip>
        {models.map((m) => (
          <Chip key={m} active={filterModels.includes(m)} onClick={() => setFilterModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))}>
            {shortModel(m)}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {(['All', 'Flyable', 'Grounded'] as const).map((f) => (
          <Chip key={f} active={filterFlyable === f} onClick={() => setFilterFlyable(f)}>{f}</Chip>
        ))}
      </div>
      <div className="overflow-x-auto scroll-shadow-x">
        <table className="w-full min-w-[860px] border-collapse text-[11px]">
          <thead>
            <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
              <th className="px-2 py-1.5 text-center">#</th>
              <th className="px-2 text-left">Reg</th>
              <th className="px-2 text-left">Model</th>
              <th className="px-2 text-center">Status</th>
              <th className="px-2 text-left">Last Flight</th>
              <th className="px-2 text-right">Due In</th>
              <th className="px-2 text-center">A/C Cert</th>
              <th className="px-2 text-center">CoA Cert</th>
              <th className="px-2 text-left">Insurance</th>
              <th className="px-2 text-center">Est. Flyable</th>
              <th className="px-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ac) => {
              const flyCol = ac.flyable ? 'var(--col-done)' : 'var(--col-cancel)';
              let flyDateCol = 'var(--col-done)';
              if (ac.flyableDate) flyDateCol = ac.flyableDate.iso < today ? 'var(--col-cancel)' : '#ff8c42';
              return (
                <tr key={ac.reg} className="border-b border-line-soft">
                  <td className="mono px-2 py-1.5 text-center text-ink-3">{ac.item}</td>
                  <td className="mono px-2 font-semibold text-[var(--highlight)]">{ac.reg}</td>
                  <td className="mono px-2 whitespace-nowrap text-ink-2">{shortModel(ac.model)}</td>
                  <td className="px-2 text-center">
                    <span className="mono uc rounded border px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap" style={{ color: flyCol, borderColor: flyCol, background: `color-mix(in oklch, ${flyCol} 15%, transparent)` }}>
                      {ac.flyable ? '✔ FLY' : '✘ GND'}
                    </span>
                  </td>
                  <td className="mono px-2 whitespace-nowrap text-ink-2">{ac.lastFlight || '—'}</td>
                  <td className="mono px-2 text-right whitespace-nowrap text-ink-2">{ac.dueInDisplay}</td>
                  <CertCell date={ac.acCertDate} days={ac.acCertDays} />
                  <CertCell date={ac.coaCertDate} days={ac.coaCertDays} />
                  <td className="mono px-2 whitespace-nowrap text-ink-2">{ac.insurance || '—'}</td>
                  <td className="px-2 text-center whitespace-nowrap">
                    {ac.flyableDate ? (
                      <span className="mono text-[10px] font-bold" style={{ color: flyDateCol }}>{ac.flyableDate.display}</span>
                    ) : ac.flyable ? (
                      <span className="mono text-[9px]" style={{ color: 'var(--col-done)' }}>Ready</span>
                    ) : (
                      <span className="mono text-[9px] text-ink-3">—</span>
                    )}
                  </td>
                  <td className="mono max-w-[220px] px-2 text-[9.5px] text-ink-3">{ac.remarks || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CertCell({ date, days }: { date: string; days: number | null }) {
  const col = CERT_COLOR[certDaysColor(days)];
  return (
    <td className="mono px-2 py-1 text-center">
      <div className="text-[9.5px] text-ink-3">{date || '—'}</div>
      {days !== null && (
        <div className="mt-0.5 text-[9.5px] font-bold" style={{ color: col }}>
          {days < 0 ? `EXP (${days}d)` : `${days}d`}
        </div>
      )}
    </td>
  );
}

function CrossCheckTab({ sheet, resources }: { sheet: SheetQuery; resources: readonly Resource[] }) {
  const [filter, setFilter] = useState<'all' | 'conflict' | 'missing'>('conflict');
  const data = sheet.data;
  const rows = useMemo(() => (data ? fleetCrossCheck(data.aircraft, resources) : []), [data, resources]);
  const summary = useMemo(
    () => ({
      ok: rows.filter((r) => !r.conflict && !r.missing).length,
      conflict: rows.filter((r) => r.conflict).length,
      missing: rows.filter((r) => r.missing).length,
    }),
    [rows],
  );
  const filtered = filter === 'all' ? rows : filter === 'conflict' ? rows.filter((r) => r.conflict) : rows.filter((r) => r.missing);

  if (sheet.isLoading) return <LoadingBlock label="loading fleet sheet…" />;

  return (
    <Panel title="OPS Cross-Check" hint={`${filtered.length} of ${rows.length}`} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft p-2">
        <Kpi label="Agree" value={summary.ok} color="var(--col-done)" />
        <Kpi label="Conflict" value={summary.conflict} color="var(--col-cancel)" />
        <Kpi label="Sheet-only" value={summary.missing} color="var(--col-pending)" />
        <span className="mx-1 h-4 w-px bg-line" />
        {(['conflict', 'missing', 'all'] as const).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Chip>
        ))}
        <span className="mono ml-auto text-[9px] text-ink-3">Sheet "Flyable?" vs ops resource maintenance flag</span>
      </div>
      {filtered.length === 0 ? (
        <div className="mono py-6 text-center text-[10px] text-ink-3">no rows match this filter</div>
      ) : (
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full min-w-[520px] border-collapse text-[11px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="px-2 py-1.5 text-left">Reg</th>
                <th className="px-2 text-center">Sheet: Flyable?</th>
                <th className="px-2 text-center">Ops: Flyable?</th>
                <th className="px-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.sheet.reg} className="border-b border-line-soft" style={r.conflict ? { background: 'color-mix(in oklch, var(--col-cancel) 8%, transparent)' } : undefined}>
                  <td className="mono px-2 py-1.5 font-semibold text-[var(--highlight)]">{r.sheet.reg}</td>
                  <td className="px-2 text-center">
                    <FlyBadge fly={r.sheetFly} />
                  </td>
                  <td className="px-2 text-center">{r.opsFly === null ? <span className="mono text-[9px] text-ink-3">—</span> : <FlyBadge fly={r.opsFly} />}</td>
                  <td className="mono px-2 text-[10px]" style={{ color: r.conflict ? 'var(--col-cancel)' : r.missing ? 'var(--col-pending)' : 'var(--ink-3)' }}>
                    {r.conflict ? 'Sheet and ops disagree' : r.missing ? 'Not found in ops resources' : 'Agrees'}
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

function FlyBadge({ fly }: { fly: boolean }) {
  const col = fly ? 'var(--col-done)' : 'var(--col-cancel)';
  return (
    <span className="mono uc rounded border px-1.5 py-0.5 text-[9px] font-bold" style={{ color: col, borderColor: col, background: `color-mix(in oklch, ${col} 15%, transparent)` }}>
      {fly ? 'FLY' : 'GND'}
    </span>
  );
}

// ── Fleet tab ────────────────────────────────────────────────────────────────

function FleetTab({
  resources,
  pool,
  metric,
  curMap,
}: {
  resources: ReadonlyArray<{ tail: string; acType: string; isMaint: boolean }>;
  pool: readonly Flight[];
  metric: UtilMetric;
  curMap: Record<string, number>;
}) {
  const byTail = useMemo(() => {
    const m = new Map<string, { hours: number; n: number }>();
    for (const f of pool) {
      if (!f.tail) continue;
      const k = normTail(f.tail);
      const e = m.get(k) ?? m.set(k, { hours: 0, n: 0 }).get(k)!;
      e.hours += metricMins(f, metric, curMap) / 60;
      e.n++;
    }
    return m;
  }, [pool, metric, curMap]);

  const groups = useMemo(() => {
    const g = new Map<string, Array<{ tail: string; isMaint: boolean; hours: number; n: number }>>();
    for (const r of resources) {
      if (/Classroom/i.test(r.acType)) continue;
      const stats = byTail.get(normTail(r.tail));
      (g.get(r.acType) ?? g.set(r.acType, []).get(r.acType)!).push({
        tail: r.tail,
        isMaint: r.isMaint,
        hours: stats?.hours ?? 0,
        n: stats?.n ?? 0,
      });
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [resources, byTail]);

  const maxH = Math.max(0.1, ...[...byTail.values()].map((e) => e.hours));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {groups.map(([type, tails]) => (
        <Panel
          key={type}
          title={type}
          hint={`${tails.length} tails · ${tails.filter((t) => t.isMaint).length} maint`}
          accent={U_TYPE_COLORS[type] ?? (isSimType(type) ? '#64748b' : 'var(--col-done)')}
        >
          <div className="flex flex-col gap-1">
            {tails
              .sort((a, b) => b.hours - a.hours)
              .map((t) => (
                <div key={t.tail} className="flex items-center gap-2">
                  <span className="mono w-24 shrink-0 text-[10px] font-bold" style={{ color: t.isMaint ? 'var(--col-cancel)' : 'var(--ink)' }}>
                    {t.tail}
                    {t.isMaint && ' 🔧'}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full" style={{ width: `${(t.hours / maxH) * 100}%`, background: t.isMaint ? 'var(--col-cancel)' : (U_TYPE_COLORS[type] ?? 'var(--col-done)') }} />
                  </div>
                  <span className="mono num w-14 text-right text-[9px] text-ink-2">{fmtHours(t.hours)}</span>
                  <span className="mono num w-8 text-right text-[8.5px] text-ink-3">{t.n || '—'}</span>
                </div>
              ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
