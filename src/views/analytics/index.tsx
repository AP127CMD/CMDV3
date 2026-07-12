// Ops Analytics — date-range operational breakdowns (V2's SummaryBoard):
// status sum tiles, AP-batch donut, AP-127 per-student spotlight, and
// Batch / Instructor / Student breakdown tables with stacked status bars.
// Bars can rank by flight count or completed block hours.

import { useMemo, useState } from 'react';
import { Chip, Panel } from '@/components/atoms';
import { LoadingBlock } from '@/components/atoms';
import { SourceInfo, METHOD_BLOCK_TIME } from '@/components/SourceInfo';
import { useFlightsFile, useStudents } from '@/data/queries';
import { batchBreakdown, instructorLoad, studentBreakdown, type GroupStat } from '@/domain/kpis';
import { bkkToday, addDays } from '@/domain/dates';
import { isAP127Batch } from '@/domain/batches';

// Non-AP-127 AP-batch donut palette (magenta reserved for AP-127, as in V2).
const BATCH_COLORS = [
  'oklch(0.72 0.18 260)',
  'oklch(0.75 0.18 145)',
  'oklch(0.80 0.16 75)',
  'oklch(0.72 0.16 30)',
  'oklch(0.70 0.14 200)',
  'oklch(0.74 0.15 290)',
  'oklch(0.72 0.18 175)',
];

type BarMode = 'flights' | 'hours';

export default function OpsAnalyticsView() {
  const file = useFlightsFile();
  const { students } = useStudents();
  const today = bkkToday();

  const flights = useMemo(() => file.data?.data.flights ?? [], [file.data]);
  const leaves = file.data?.data.leaves ?? [];
  const allDates = useMemo(() => [...new Set(flights.map((f) => f.date))].sort(), [flights]);

  const [from, setFrom] = useState(() => addDays(today, -7));
  const [to, setTo] = useState(today);
  const [barMode, setBarMode] = useState<BarMode>('hours');
  const [showSims, setShowSims] = useState(true);

  const fromEff = allDates.find((d) => d >= from) ?? allDates[0] ?? from;
  const toEff = [...allDates].reverse().find((d) => d <= to) ?? allDates.at(-1) ?? to;

  const pool = useMemo(
    () => flights.filter((f) => f.date >= fromEff && f.date <= toEff && (showSims || !f.isSim)),
    [flights, fromEff, toEff, showSims],
  );

  const totals = useMemo(() => {
    const s = { total: pool.length, pending: 0, completed: 0, canceled: 0, standby: 0, sim: 0, hours: 0 };
    for (const f of pool) {
      if (f.status === 'Pending') s.pending++;
      if (f.status === 'Completed') s.completed++;
      if (f.status === 'Canceled') s.canceled++;
      if (f.isStandby) s.standby++;
      if (f.isSim) s.sim++;
      s.hours += (f.durMin ?? 0) / 60;
    }
    return s;
  }, [pool]);

  const batches = useMemo(() => batchBreakdown(pool), [pool]);
  const instructors = useMemo(() => instructorLoad(pool), [pool]);
  const studentsBd = useMemo(() => studentBreakdown(pool), [pool]);

  // AP-127 spotlight — seed every cohort member from the roster so 0-flight
  // students still appear (V2 seeded from the full flight list; the roster is
  // the stronger source of truth for "all 28").
  const ap127Stats = useMemo(() => {
    const map = new Map<string, GroupStat>();
    for (const s of students) {
      map.set(s.key, { key: s.key, total: 0, completed: 0, pending: 0, canceled: 0, standby: 0, sim: 0, hours: 0, schedHours: 0 });
    }
    for (const g of studentBreakdown(pool.filter((f) => isAP127Batch(f.batch)))) {
      // studentBreakdown keys by display name; re-key onto roster keys where they match.
      const rosterKey = students.find((s) => s.key === g.key || s.name === g.key)?.key ?? g.key;
      map.set(rosterKey, { ...g, key: rosterKey });
    }
    return [...map.values()];
  }, [students, pool]);

  // name → leave reason for anyone on leave today (badge on breakdown rows).
  const leavesToday = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leaves) if (today >= l.start && today <= l.end) m.set(l.name, l.reason ?? 'Leave');
    return m;
  }, [leaves, today]);

  const donutSlices = useMemo(() => {
    const ap = batches.filter((b) => /^AP-/i.test(b.key)).sort((a, b) => a.key.localeCompare(b.key));
    let ci = 0;
    return ap.map((b) => ({
      label: b.key,
      value: b.total,
      hours: b.schedHours,
      color: isAP127Batch(b.key) ? 'var(--highlight)' : BATCH_COLORS[ci++ % BATCH_COLORS.length],
    }));
  }, [batches]);

  if (file.isLoading) return <LoadingBlock label="loading operations data…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">Ops Analytics</div>
          <div className="mono uc text-[9px] text-ink-3">date-range operational breakdowns · {pool.length} flights</div>
        </div>
        <SourceInfo refSpec={{ sources: ['flights'], basis: `${fromEff} → ${toEff}${showSims ? '' : ' · sims excluded'}`, method: METHOD_BLOCK_TIME }} />
      </div>

      {/* Range + toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['From', from, setFrom],
            ['To', to, setTo],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="flex items-center gap-1">
            <span className="mono uc text-[8px] text-ink-3">{label}</span>
            <input type="date" value={val} onChange={(e) => set(e.target.value)} className="mono rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink" />
          </label>
        ))}
        <Chip onClick={() => { setFrom(allDates[0] ?? today); setTo(allDates.at(-1) ?? today); }}>ALL</Chip>
        <Chip onClick={() => { setFrom(addDays(today, -7)); setTo(today); }}>7d</Chip>
        <Chip onClick={() => { setFrom(addDays(today, -30)); setTo(today); }}>30d</Chip>
        <span className="mx-1 text-ink-3">·</span>
        <Chip active={showSims} onClick={() => setShowSims((v) => !v)}>+Sims</Chip>
        <span className="mx-1 text-ink-3">·</span>
        <span className="mono uc text-[9px] text-ink-3">bars by</span>
        <Chip active={barMode === 'flights'} onClick={() => setBarMode('flights')}># Flights</Chip>
        <Chip active={barMode === 'hours'} onClick={() => setBarMode('hours')}>Hours</Chip>
      </div>

      {/* Sum tiles */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <SumTile label="Total" value={totals.total} color="var(--ink-2)" sub={`${totals.hours.toFixed(0)}h`} />
        <SumTile label="Pending" value={totals.pending} color="var(--col-pending)" />
        <SumTile label="Completed" value={totals.completed} color="var(--col-done)" />
        <SumTile label="Canceled" value={totals.canceled} color="var(--col-cancel)" />
        <SumTile label="Standby" value={totals.standby} color="var(--col-stby)" />
        <SumTile label="SIM" value={totals.sim} color="var(--col-sim)" />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {/* AP batch donut */}
        <Panel title="AP batch comparison" hint="total flights per batch">
          <div className="flex flex-wrap items-center gap-5">
            <SliceDonut slices={donutSlices} />
            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              {donutSlices.map((s) => (
                <div key={s.label} className="mono flex items-center gap-2 text-[10px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="uc flex-1" style={{ color: s.color === 'var(--highlight)' ? 'var(--highlight)' : 'var(--ink-2)' }}>{s.label}</span>
                  <span className="num text-ink-3">{s.value}</span>
                  <span className="num w-12 text-right text-[9px] text-ink-3">{s.hours.toFixed(1)}h</span>
                </div>
              ))}
              {!donutSlices.length && <div className="mono uc text-[9px] text-ink-3">no AP batches in range</div>}
            </div>
          </div>
        </Panel>

        {/* AP-127 spotlight */}
        <Panel title={<span className="text-[var(--highlight)]">◆ AP-127 Students</span>} accent="var(--highlight)" hint={`all cohort · by ${barMode}`}>
          <BreakdownRows rows={ap127Stats} barMode={barMode} leavesToday={leavesToday} nameColor="var(--highlight)" />
        </Panel>
      </div>

      <Panel title="Batch breakdown" hint="pending · completed · canceled · standby">
        <BreakdownRows rows={batches} barMode={barMode} leavesToday={leavesToday} highlight={(k) => isAP127Batch(k)} />
      </Panel>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <Panel title="Instructor breakdown" hint="pending · completed · canceled · standby">
          <BreakdownRows rows={instructors} barMode={barMode} leavesToday={leavesToday} />
        </Panel>
        <Panel title="Student breakdown" hint="pending · completed · canceled · standby">
          <BreakdownRows rows={studentsBd} barMode={barMode} leavesToday={leavesToday} />
        </Panel>
      </div>
    </div>
  );
}

function SumTile({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2" style={{ borderTop: `2px solid ${color}` }}>
      <div className="mono uc text-[8px] text-ink-3">{label}</div>
      <div className="num text-[22px] leading-tight font-semibold text-ink">{String(value).padStart(2, '0')}</div>
      {sub && <div className="mono uc text-[8px] text-ink-3">{sub}</div>}
    </div>
  );
}

function SliceDonut({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <div className="mono uc flex h-32 w-32 items-center justify-center text-[9px] text-ink-3">no data</div>;
  const R = 50;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0 -rotate-90">
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--line-soft)" strokeWidth="20" />
      {slices.map((s) => {
        const frac = s.value / total;
        const el = (
          <circle key={s.label} cx="64" cy="64" r={R} fill="none" stroke={s.color} strokeWidth="20"
            strokeDasharray={`${frac * C} ${C - frac * C}`} strokeDashoffset={-offset * C} />
        );
        offset += frac;
        return el;
      })}
      <text x="64" y="64" transform="rotate(90 64 64)" textAnchor="middle" dominantBaseline="central" className="num" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--ink)' }}>
        {total}
      </text>
    </svg>
  );
}

function BreakdownRows({
  rows,
  barMode,
  leavesToday,
  nameColor,
  highlight,
}: {
  rows: readonly GroupStat[];
  barMode: BarMode;
  leavesToday: Map<string, string>;
  nameColor?: string;
  highlight?: (key: string) => boolean;
}) {
  const sorted = [...rows].sort((a, b) => (barMode === 'hours' ? b.hours - a.hours : b.total - a.total));
  const maxFlights = Math.max(1, ...sorted.map((r) => r.total));
  const maxHours = Math.max(0.01, ...sorted.map((r) => r.hours));
  if (!sorted.length) return <div className="mono uc py-2 text-[9px] text-ink-3">no data</div>;
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((r) => {
        const hl = nameColor ?? (highlight?.(r.key) ? 'var(--highlight)' : undefined);
        const barW = barMode === 'hours' ? (r.hours / maxHours) * 100 : (r.total / maxFlights) * 100;
        const leave = leavesToday.get(r.key);
        return (
          <div key={r.key} className="flex items-center gap-2">
            <span className="mono uc w-28 shrink-0 truncate text-[9.5px]" style={{ color: hl ?? 'var(--ink-2)', fontWeight: hl ? 600 : 400 }} title={r.key}>
              {r.key}
              {leave && <span className="ml-1 rounded-sm bg-[var(--col-stby)] px-1 text-[7px] font-bold text-black" title={leave}>LV</span>}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-bg-2">
              <div className="flex h-full gap-px" style={{ width: `${barW.toFixed(1)}%`, transition: 'width .3s' }}>
                {r.pending > 0 && <span title={`Pending: ${r.pending}`} style={{ flex: r.pending, background: 'var(--col-pending)', opacity: 0.85 }} />}
                {r.completed > 0 && <span title={`Completed: ${r.completed}`} style={{ flex: r.completed, background: 'var(--col-done)', opacity: 0.85 }} />}
                {r.canceled > 0 && <span title={`Canceled: ${r.canceled}`} style={{ flex: r.canceled, background: 'var(--col-cancel)', opacity: 0.85 }} />}
                {r.standby > 0 && <span title={`Standby: ${r.standby}`} style={{ flex: r.standby, background: 'var(--col-stby)', opacity: 0.85 }} />}
                {r.total === 0 && <span className="flex-1 bg-line opacity-20" />}
              </div>
            </div>
            <span className="mono num w-5 shrink-0 text-right text-[9px] text-[var(--col-done)]" title="Completed">{r.completed}</span>
            <span className="mono text-[8px] text-ink-3">/</span>
            <span className="mono num w-5 shrink-0 text-right text-[9px] text-[var(--col-cancel)]" title="Canceled">{r.canceled}</span>
            <span className="mono num w-14 shrink-0 text-right text-[9px] text-[var(--col-done)]" title="Completed block hours">✓{r.hours.toFixed(1)}h</span>
          </div>
        );
      })}
    </div>
  );
}
