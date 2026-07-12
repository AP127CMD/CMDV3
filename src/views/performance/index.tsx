// School Performance: plan vs actual across all 4 batches. Actuals from real
// flown records only; plan baseline from the fixed curriculum syllabus.
// Simulated schedule projections never appear here (see domain/upcoming.ts).

import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chip, Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { useNgtFile } from '@/data/queries';
import { bkkToday, addDays } from '@/domain/dates';
import {
  buildDayMap,
  buildMonthMap,
  buildPlanMonths,
  buildSchoolCurMap,
  collectEffectiveFlights,
  collectHistoricalFlights,
  computeScorecard,
  SCHOOL_BATCHES,
  type FlightRecord,
  type HoursMode,
  type SchoolBatch,
} from '@/domain/school-perf';

const BATCH_HEX: Record<SchoolBatch, string> = {
  AP124: '#4ba3f7',
  AP126: '#7acf7e',
  AP127: '#e88aff',
  AP129: '#e9bd63',
};
const BATCH_SIM_HEX: Record<SchoolBatch, string> = {
  AP124: 'rgba(168,209,251,0.55)',
  AP126: 'rgba(189,231,191,0.55)',
  AP127: 'rgba(244,197,255,0.55)',
  AP129: 'rgba(244,222,177,0.55)',
};

// Value labels on stacked-bar segments — V2's School Performance rule: only
// label a segment once it's visually big enough to hold text (≥0.5h), 1dp.
const SEGMENT_DATALABELS = {
  display: (ctx: { dataset: { data: unknown[] }; dataIndex: number }) => {
    const v = ctx.dataset.data[ctx.dataIndex];
    return typeof v === 'number' && v >= 0.5;
  },
  color: 'rgba(255,255,255,0.85)',
  font: { family: 'JetBrains Mono', size: 7 },
  formatter: (v: unknown) => (typeof v === 'number' && v >= 0.5 ? v.toFixed(1) : null),
  anchor: 'center' as const,
  align: 'center' as const,
};

// Same idea for flight-COUNT segments (integers, so any non-zero value labels).
const COUNT_DATALABELS = {
  display: (ctx: { dataset: { data: unknown[] }; dataIndex: number }) => {
    const v = ctx.dataset.data[ctx.dataIndex];
    return typeof v === 'number' && v > 0;
  },
  color: 'rgba(255,255,255,0.85)',
  font: { family: 'JetBrains Mono', size: 7 },
  formatter: (v: unknown) => (typeof v === 'number' && v > 0 ? v : null),
  anchor: 'center' as const,
  align: 'center' as const,
};

const PACE_STYLE: Record<string, { label: string; color: string }> = {
  'on-track': { label: 'ON TRACK', color: 'var(--col-done)' },
  caution: { label: 'CAUTION', color: 'var(--col-pending)' },
  behind: { label: 'BEHIND', color: 'var(--col-cancel)' },
  unknown: { label: '—', color: 'var(--ink-3)' },
};

export default function SchoolPerformanceView() {
  const ngt = useNgtFile();
  const today = bkkToday();
  const [from, setFrom] = useState(() => addDays(today, -90));
  const [to] = useState(today);
  const [batchFilter, setBatchFilter] = useState<SchoolBatch | 'ALL'>('ALL');
  const [mode, setMode] = useState<HoursMode>('actual');
  const [showSim, setShowSim] = useState(true);
  const [recentN, setRecentN] = useState(14);

  const defs = useChartDefaults();

  const data = ngt.data?.data;

  const curMap = useMemo(
    () => (data ? buildSchoolCurMap(data.curricula) : {}),
    [data],
  );

  const records: FlightRecord[] = useMemo(() => {
    if (!data) return [];
    const batches = data.batches as unknown as Record<string, Array<{ flown: Array<{ lesson: string; actualMins: number | null; date: string }> }>>;
    return mode === 'effective'
      ? (collectEffectiveFlights(batches as any, curMap) as FlightRecord[])
      : (collectHistoricalFlights(batches as any) as FlightRecord[]);
  }, [data, mode, curMap]);

  const filteredRecords = useMemo(
    () => (batchFilter === 'ALL' ? records : records.filter((r) => r.batch === batchFilter)),
    [records, batchFilter],
  );

  const dayMap = useMemo(() => buildDayMap(filteredRecords, from, to), [filteredRecords, from, to]);
  const monthMap = useMemo(() => buildMonthMap(records, from, to), [records, from, to]);

  const studentCounts = useMemo(() => {
    if (!data) return { AP124: 0, AP126: 0, AP127: 0 };
    return {
      AP124: data.batches.ap124?.length ?? 0,
      AP126: data.batches.ap126?.length ?? 0,
      AP127: data.batches.ap127?.length ?? 0,
    };
  }, [data]);

  const planMonths = useMemo(
    () => (data ? buildPlanMonths(data.curricula, studentCounts) : []),
    [data, studentCounts],
  );

  const scorecard = useMemo(
    () => computeScorecard(batchFilter === 'ALL' ? monthMap : buildMonthMap(filteredRecords, from, to), planMonths, today),
    [monthMap, filteredRecords, from, to, planMonths, today, batchFilter],
  );

  const recentDays = useMemo(() => dayMap.slice(-recentN), [dayMap, recentN]);

  if (ngt.isLoading || !data) return <LoadingBlock label="loading school performance…" />;

  const pace = PACE_STYLE[scorecard.paceStatus];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">School Performance</div>
          <div className="mono uc text-[9px] text-ink-3">plan (curriculum baseline) vs real flown records — all batches</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="mono rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink"
        />
        <span className="mono text-[9px] text-ink-3">→ {to}</span>
        <span className="mx-1 text-ink-3">·</span>
        <Chip active={batchFilter === 'ALL'} onClick={() => setBatchFilter('ALL')}>All</Chip>
        {SCHOOL_BATCHES.map((b) => (
          <Chip key={b} active={batchFilter === b} onClick={() => setBatchFilter(b)} accent={BATCH_HEX[b]}>
            {b}
          </Chip>
        ))}
        <span className="mx-1 text-ink-3">·</span>
        <Chip active={mode === 'actual'} onClick={() => setMode('actual')}>Actual hrs</Chip>
        <Chip active={mode === 'effective'} onClick={() => setMode('effective')}>Effective hrs</Chip>
        <Chip active={showSim} onClick={() => setShowSim((v) => !v)}>+Sim</Chip>
      </div>
      {mode === 'effective' && (
        <div className="rounded-md border border-[var(--highlight)] bg-[var(--highlight-bg)] px-3 py-1.5 text-[10px] text-[var(--highlight)]">
          Effective-hours mode: each flown lesson is credited its curriculum-planned duration, not its raw actual block time.
        </div>
      )}

      {/* Scorecard */}
      <Panel title="Scorecard" hint={<span className="mono uc" style={{ color: pace.color }}>{pace.label}</span>}>
        <div className="flex flex-wrap gap-1.5">
          <Kpi label="Achievement (flights)" value={scorecard.achievementFlightsPct != null ? `${scorecard.achievementFlightsPct.toFixed(0)}%` : '—'} sub={`${scorecard.actualFlights}/${scorecard.plannedFlights}`} color={pace.color} />
          <Kpi label="Achievement (hours)" value={scorecard.achievementHoursPct != null ? `${scorecard.achievementHoursPct.toFixed(0)}%` : '—'} sub={`${scorecard.actualHours.toFixed(0)}/${scorecard.plannedHours.toFixed(0)}h`} color={pace.color} />
          <Kpi label="This month (flights)" value={scorecard.thisMonthFlightsPct != null ? `${scorecard.thisMonthFlightsPct.toFixed(0)}%` : '—'} />
          <Kpi label="This month (hours)" value={scorecard.thisMonthHoursPct != null ? `${scorecard.thisMonthHoursPct.toFixed(0)}%` : '—'} />
          <Kpi label="Shortfall (flights)" value={`${scorecard.shortfallFlights >= 0 ? '+' : ''}${scorecard.shortfallFlights}`} color={scorecard.shortfallFlights >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} />
          <Kpi label="Shortfall (hours)" value={`${scorecard.shortfallHours >= 0 ? '+' : ''}${scorecard.shortfallHours.toFixed(0)}h`} color={scorecard.shortfallHours >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} />
        </div>
      </Panel>

      {/* Daily hours chart */}
      <ChartCard
        title="Daily hours by batch"
        hint={`${from} → ${to}`}
        refSpec={{ sources: ['ngt'], basis: `${from} → ${to}${batchFilter !== 'ALL' ? ` · ${batchFilter} only` : ''}`, method: mode === 'effective' ? 'Effective hours: curriculum planned minutes per lesson.' : 'Block-time actuals from flown records.' }}
        height={260}
      >
        <Bar
          data={{
            labels: dayMap.map((d) => d.date.slice(5)),
            datasets: [
              ...SCHOOL_BATCHES.filter((b) => batchFilter === 'ALL' || batchFilter === b).map((b) => ({
                label: b,
                data: dayMap.map((d) => d.byBatch[b].h),
                backgroundColor: BATCH_HEX[b],
                stack: 'h',
              })),
              ...(showSim
                ? SCHOOL_BATCHES.filter((b) => batchFilter === 'ALL' || batchFilter === b).map((b) => ({
                    label: `${b} SIM`,
                    data: dayMap.map((d) => d.byBatch[b].simH),
                    backgroundColor: BATCH_SIM_HEX[b],
                    stack: 'h',
                  }))
                : []),
            ],
          }}
          options={{
            ...defs.base,
            plugins: { ...defs.base.plugins, datalabels: SEGMENT_DATALABELS },
            scales: {
              x: { ...defs.base.scales.x, stacked: true, ticks: { ...defs.base.scales.x.ticks, autoSkip: true, maxTicksLimit: 14 } },
              y: { ...defs.base.scales.y, stacked: true, title: { display: true, text: 'hours', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>

      {/* Monthly stacked chart */}
      <ChartCard
        title="Monthly hours by batch"
        refSpec={{ sources: ['ngt'], basis: 'monthly rollup, same window' }}
        height={240}
      >
        <Bar
          data={{
            labels: monthMap.map((m) => m.month),
            datasets: SCHOOL_BATCHES.map((b) => ({
              label: b,
              data: monthMap.map((m) => m.byBatch[b].h + (showSim ? m.byBatch[b].simH : 0)),
              backgroundColor: BATCH_HEX[b],
              stack: 'm',
            })),
          }}
          options={{
            ...defs.base,
            plugins: { ...defs.base.plugins, datalabels: SEGMENT_DATALABELS },
            scales: {
              x: { ...defs.base.scales.x, stacked: true },
              y: { ...defs.base.scales.y, stacked: true, title: { display: true, text: 'hours', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>

      {/* Recent N days — flight counts per batch (V2's perfRecent chart) */}
      <ChartCard
        title="Recent days — flights"
        hint={
          <span className="flex gap-1">
            {[7, 14, 30].map((n) => (
              <Chip key={n} active={recentN === n} onClick={() => setRecentN(n)}>{n}d</Chip>
            ))}
          </span>
        }
        refSpec={{ sources: ['ngt'], basis: `last ${recentN} calendar days, flight counts by batch` }}
        height={220}
      >
        <Bar
          data={{
            labels: recentDays.map((d) => d.date.slice(5)),
            datasets: SCHOOL_BATCHES.filter((b) => batchFilter === 'ALL' || batchFilter === b).map((b) => ({
              label: b,
              data: recentDays.map((d) => d.byBatch[b].n + (showSim ? d.byBatch[b].simN : 0)),
              backgroundColor: BATCH_HEX[b],
              stack: 'r',
            })),
          }}
          options={{
            ...defs.base,
            plugins: { ...defs.base.plugins, datalabels: COUNT_DATALABELS },
            scales: {
              x: { ...defs.base.scales.x, stacked: true, ticks: { ...defs.base.scales.x.ticks, autoSkip: true, maxTicksLimit: 14 } },
              y: { ...defs.base.scales.y, stacked: true, beginAtZero: true, title: { display: true, text: 'flights/day', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>

      <Panel
        title="Recent days — table"
        hint={
          <span className="flex gap-1">
            {[7, 14, 30].map((n) => (
              <Chip key={n} active={recentN === n} onClick={() => setRecentN(n)}>{n}d</Chip>
            ))}
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full min-w-[560px] border-collapse text-[10px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="px-2 py-1.5 text-left">Date</th>
                <th className="px-2 text-right">Flights</th>
                <th className="px-2 text-right">Hours</th>
                {SCHOOL_BATCHES.map((b) => (
                  <th key={b} className="px-2 text-right" style={{ color: BATCH_HEX[b] }}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentDays.map((d) => (
                <tr key={d.date} className="border-b border-line-soft">
                  <td className="mono px-2 py-1 text-ink-2">{d.date}</td>
                  <td className="mono num px-2 text-right text-ink">{d.n}{d.simN > 0 && <span className="text-ink-3"> ({d.simN})</span>}</td>
                  <td className="mono num px-2 text-right text-ink">{d.h.toFixed(1)}h</td>
                  {SCHOOL_BATCHES.map((b) => (
                    <td key={b} className="mono num px-2 text-right text-ink-2">
                      {d.byBatch[b].n || ''}
                      {d.byBatch[b].simN > 0 && <span className="text-ink-3"> ({d.byBatch[b].simN})</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
