// School Analysis — pace & at-risk analytics across all four batches (V2's
// school-analysis page): batch health cards, filterable ranked student-pace
// table (status badges vs own-batch median), day-of-week distribution, and
// low-activity-week alerts.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar } from 'react-chartjs-2';
import { Chip, LoadingBlock, Panel } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { SourceInfo } from '@/components/SourceInfo';
import { useNgtFile, useStudents } from '@/data/queries';
import { addDays, bkkToday, fmtDay } from '@/domain/dates';

const shortDate = (d: string) => {
  const { day, mo } = fmtDay(d);
  return `${day} ${mo}`;
};
import { batchColorVar } from '@/domain/batches';
import { buildUnifiedRoster, PROG_BATCHES } from '@/domain/curriculumProg';
import {
  annotate,
  batchHealth,
  batchMedians,
  dowDistribution,
  lowActivityWeeks,
  paceStatus,
  type AnalysisStudent,
  type PaceStatus,
} from '@/domain/analysis';

const LOOKBACKS = [14, 30, 60, 90];
type StatusFilter = 'ALL' | 'atrisk' | 'below' | 'onpace';
type SortMode = 'pace' | 'pct' | 'remaining' | 'last' | 'name';

const BADGE: Record<PaceStatus, { color: string; label: string }> = {
  atrisk: { color: '#ef4444', label: 'No flights in 14+ days' },
  below: { color: '#fb923c', label: 'Below half of batch median pace' },
  slow: { color: '#fbbf24', label: 'Slightly below batch median pace' },
  onpace: { color: 'var(--col-done)', label: 'On pace' },
};

export default function SchoolAnalysisView() {
  const { students: ap127Students, isLoading: pLoading } = useStudents();
  const ngt = useNgtFile();
  const today = bkkToday();

  const [lookback, setLookback] = useState(30);
  const [batch, setBatch] = useState<'ALL' | (typeof PROG_BATCHES)[number]>('AP127');
  const [statusF, setStatusF] = useState<StatusFilter>('ALL');
  const [fi, setFi] = useState('ALL');
  const [sort, setSort] = useState<SortMode>('pace');

  const defs = useChartDefaults();
  const batches = ngt.data?.data.batches ?? {};
  const cutoff = addDays(today, -lookback);

  const all: AnalysisStudent[] = useMemo(
    () => annotate(buildUnifiedRoster(ap127Students, batches), today, lookback),
    [ap127Students, batches, today, lookback],
  );
  const health = useMemo(() => batchHealth(all), [all]);
  const medians = useMemo(() => batchMedians(all), [all]);

  const fis = useMemo(() => {
    const base = batch === 'ALL' ? all : all.filter((s) => s.batch === batch);
    return [...new Set(base.map((s) => s.fi).filter(Boolean))].sort();
  }, [all, batch]);

  const visible = useMemo(() => {
    let v = batch === 'ALL' ? [...all] : all.filter((s) => s.batch === batch);
    if (statusF === 'atrisk') v = v.filter((s) => paceStatus(s, medians) === 'atrisk');
    else if (statusF === 'below') v = v.filter((s) => ['below', 'slow'].includes(paceStatus(s, medians)));
    else if (statusF === 'onpace') v = v.filter((s) => paceStatus(s, medians) === 'onpace');
    if (fi !== 'ALL') v = v.filter((s) => s.fi === fi);
    const by: Record<SortMode, (a: AnalysisStudent, b: AnalysisStudent) => number> = {
      pace: (a, b) => b.recentN - a.recentN || (b.lastFlight ?? '').localeCompare(a.lastFlight ?? ''),
      pct: (a, b) => b.pct - a.pct,
      remaining: (a, b) => b.remaining - a.remaining,
      last: (a, b) => (b.lastFlight ?? '').localeCompare(a.lastFlight ?? ''),
      name: (a, b) => (a.nick || a.name).localeCompare(b.nick || b.name),
    };
    return v.sort(by[sort]);
  }, [all, batch, statusF, fi, sort, medians]);

  // Batch-filtered flown records inside the window (DoW chart + weekly alerts).
  const records = useMemo(() => {
    const pool = batch === 'ALL' ? all : all.filter((s) => s.batch === batch);
    return pool.flatMap((s) => s.flown.filter((f) => f.date >= cutoff && f.date <= today).map((f) => ({ date: f.date })));
  }, [all, batch, cutoff, today]);

  const dow = useMemo(() => dowDistribution(records, cutoff, today), [records, cutoff, today]);
  const lowWeeks = useMemo(() => lowActivityWeeks(records), [records]);
  const dowMax = Math.max(...dow.avg, 0.01);

  if (pLoading || ngt.isLoading) return <LoadingBlock label="loading school analysis…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">School Analysis</div>
          <div className="mono uc text-[9px] text-ink-3">pace & at-risk analytics · all batches · real flown records</div>
        </div>
        <SourceInfo refSpec={{ sources: ['ngt', 'progress'], basis: `flown lessons ${cutoff} → ${today} (${lookback}d lookback)`, method: 'Pace = flown lessons in window vs own-batch median: <50% = below, <80% = slow; no flight for 14+ days = at-risk.' }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {LOOKBACKS.map((n) => (
          <Chip key={n} active={lookback === n} onClick={() => setLookback(n)}>{n}d</Chip>
        ))}
        <span className="mx-1 text-ink-3">·</span>
        <Chip active={batch === 'ALL'} onClick={() => setBatch('ALL')}>ALL</Chip>
        {PROG_BATCHES.map((b) => (
          <Chip key={b} active={batch === b} onClick={() => setBatch(b)} accent={batchColorVar(b)}>
            {b === 'AP127' ? '★ AP127' : b}
          </Chip>
        ))}
        <span className="mx-1 text-ink-3">·</span>
        {(
          [
            ['ALL', 'All', 'var(--ink-2)'],
            ['atrisk', '● At-risk', '#ef4444'],
            ['below', '● Below pace', '#fb923c'],
            ['onpace', '● On pace', 'var(--col-done)'],
          ] as const
        ).map(([k, label, color]) => (
          <Chip key={k} active={statusF === k} onClick={() => setStatusF(k)} accent={color}>{label}</Chip>
        ))}
        <span className="mx-1 text-ink-3">·</span>
        <select value={fi} onChange={(e) => setFi(e.target.value)} className="mono rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink">
          <option value="ALL">All FI</option>
          {fis.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="mono rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink">
          <option value="pace">Pace ↓</option>
          <option value="pct">Progress ↓</option>
          <option value="remaining">Remaining ↓</option>
          <option value="last">Last flight ↓</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {/* Batch health cards */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {PROG_BATCHES.map((b) => {
          const h = health[b];
          const col = batchColorVar(b);
          const dim = batch !== 'ALL' && batch !== b;
          return (
            <button key={b} type="button" onClick={() => setBatch(batch === b ? 'ALL' : b)}
              className="cursor-pointer rounded-lg border border-line bg-surface p-2.5 text-left transition-opacity"
              style={{ opacity: dim ? 0.35 : 1, borderTop: `2px solid ${col}` }}>
              <div className="mono uc text-[8.5px] text-ink-3">{b}</div>
              <div className="num text-[22px] leading-tight font-bold" style={{ color: col }}>{h?.n ?? 0}</div>
              <div className="mono uc mb-1 text-[7.5px] text-ink-3">students</div>
              <div className="mono flex flex-col gap-0.5 text-[9px] text-ink-2">
                <span>Avg progress <b style={{ color: col }}>{(h?.avgProgress ?? 0).toFixed(1)}%</b></span>
                <span>Pace ({lookback}d) <b style={{ color: col }}>{(h?.avgRecent ?? 0).toFixed(1)}</b> les</span>
                <span style={{ color: h?.atRisk ? '#ef4444' : 'var(--ink-3)' }}>At-risk <b>{h?.atRisk ?? 0}</b>{h?.atRisk ? ' ⚠' : ''}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {/* Student pace table */}
        <Panel
          title="Student pace"
          hint={`${visible.length} student${visible.length === 1 ? '' : 's'}${batch !== 'ALL' ? ` · ${batch}` : ''}${statusF !== 'ALL' ? ` · ${statusF}` : ''}${fi !== 'ALL' ? ` · FI:${fi}` : ''}`}
          bodyClassName="p-0"
        >
          {!visible.length ? (
            <div className="mono p-4 text-[10px] text-ink-3">No students match current filters.</div>
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0">
                  <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 text-left">Name</th>
                    <th className="px-2 text-left">FI</th>
                    <th className="px-2 text-right">Done/Tot</th>
                    <th className="px-2 text-right">Prog%</th>
                    <th className="px-2 text-right">L({lookback}d)</th>
                    <th className="px-2 text-left">Last flight</th>
                    <th className="px-2 text-center">S</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s, i) => {
                    const col = batchColorVar(s.batch);
                    const st = paceStatus(s, medians);
                    const nick = s.nick || s.key;
                    return (
                      <tr key={s.catcId + s.batch} className="border-b border-line-soft">
                        <td className="mono px-2 py-1 text-ink-3">{i + 1}</td>
                        <td className="px-2 whitespace-nowrap">
                          {s.batch === 'AP127' ? (
                            <Link to={`/student/${nick}`} className="mono font-semibold hover:underline" style={{ color: col }}>{nick}</Link>
                          ) : (
                            <span className="mono font-semibold" style={{ color: col }}>{nick}</span>
                          )}
                          <span className="mono ml-1 text-[7.5px] text-ink-3">{s.batch}</span>
                        </td>
                        <td className="mono px-2 whitespace-nowrap text-ink-3">{s.fi || '—'}</td>
                        <td className="mono num px-2 text-right">{s.done}/{s.total}</td>
                        <td className="mono num px-2 text-right" style={{ color: col }}>{s.pct.toFixed(1)}%</td>
                        <td className="mono num px-2 text-right font-bold text-ink">{s.recentN}</td>
                        <td className="mono px-2 whitespace-nowrap text-ink-3">{s.lastFlight ? shortDate(s.lastFlight) : '—'}</td>
                        <td className="px-2 text-center" title={BADGE[st].label}>
                          <span style={{ color: BADGE[st].color }}>●</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          {/* Day-of-week distribution */}
          <ChartCard
            title="Day-of-week distribution"
            hint="avg flights/day · batch-filtered"
            refSpec={{ sources: ['ngt'], basis: `flown records ${cutoff} → ${today}${batch !== 'ALL' ? ` · ${batch}` : ''}` }}
            height={180}
          >
            <Bar
              data={{
                labels: dow.labels,
                datasets: [
                  {
                    label: 'Avg flights/day',
                    data: dow.avg,
                    backgroundColor: dow.avg.map((v) => (v === dowMax ? 'rgba(245,158,11,0.85)' : 'rgba(245,158,11,0.45)')),
                    datalabels: {
                      display: true,
                      anchor: 'end' as const,
                      align: 'end' as const,
                      color: defs.theme.ink2,
                      font: { family: 'JetBrains Mono', size: 9, weight: 600 as const },
                      formatter: (v: number) => (v > 0 ? v.toFixed(1) : null),
                    },
                  },
                ],
              }}
              options={{
                ...defs.base,
                plugins: { ...defs.base.plugins, legend: { display: false } },
                scales: { x: defs.base.scales.x, y: { ...defs.base.scales.y, beginAtZero: true } },
              }}
            />
          </ChartCard>

          {/* Low-activity weeks */}
          <Panel title="Low-activity weeks" hint="≥25% below period average · batch-filtered">
            {!lowWeeks.weeks.length ? (
              <div className="mono py-2 text-[10px] text-ink-3">No low-activity weeks in this period.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {lowWeeks.weeks.map((w) => (
                  <div key={w.weekStart} className="mono flex items-baseline gap-2 text-[10px]">
                    <span className="text-ink-2">Week of {shortDate(w.weekStart)}</span>
                    <span className="num font-bold text-[var(--highlight)]">{w.count}</span>
                    <span className="text-ink-3">flights</span>
                    <span style={{ color: '#ef4444' }}>↓ {w.dropPct}% vs avg {lowWeeks.weeklyAvg.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
