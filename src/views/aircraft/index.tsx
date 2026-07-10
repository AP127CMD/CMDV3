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
import { batchColorVar } from '@/domain/batches';
import type { Flight } from '@/domain/types';
import { Heatmap, type HeatRow } from './Heatmap';

type Tab = 'fleet' | 'utilization' | 'fistat' | 'spstat';
const PRESETS = ['7d', '14d', '30d', 'month'] as const;

export default function AircraftView() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'fleet';
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(sp);
    n.set('tab', t);
    setSp(n, { replace: true });
  };

  const file = useFlightsFile();
  const ngt = useNgtFile();
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
        const res = tab === 'utilization' || tab === 'fleet' ? resByTail.get(k) : undefined;
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
          <Chip active={tab === 'fleet'} onClick={() => setTab('fleet')}>Fleet</Chip>
          <Chip active={tab === 'utilization'} onClick={() => setTab('utilization')}>Utilization</Chip>
          <Chip active={tab === 'fistat'} onClick={() => setTab('fistat')}>FI Stat</Chip>
          <Chip active={tab === 'spstat'} onClick={() => setTab('spstat')}>SP Stat</Chip>
        </div>
      </div>

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

      {tab === 'fleet' && <FleetTab resources={resources} pool={pool} metric={metric} curMap={curMap} />}
      {tab !== 'fleet' && (
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
