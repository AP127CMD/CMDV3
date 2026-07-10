// Home: the at-a-glance daily brief. Every card answers one question and
// deep-links to its full view. KPI math is the tested domain layer
// (computeDayStats — identical rules to V2's Day Glance).

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Kpi, LoadingBlock, Panel, Tag } from '@/components/atoms';
import { FlightDrawer } from '@/components/FlightDrawer';
import { SourceInfo, METHOD_BLOCK_TIME } from '@/components/SourceInfo';
import { THEMES, useTheme } from '@/state/theme';
import { useFlightsFile, useManifest, useStudents } from '@/data/queries';
import { computeDayStats, hourlyPulse } from '@/domain/kpis';
import { reconcile } from '@/domain/reconcile';
import { bkkNowMin, bkkToday, fmtDay, minutesOf } from '@/domain/dates';
import { idleDays } from '@/domain/pace';
import { batchColorVar, isAP127Batch } from '@/domain/batches';
import type { Flight } from '@/domain/types';

function hoursFmt(h: number): string {
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

export default function HomeView() {
  const file = useFlightsFile();
  const { students, isLoading: pLoading } = useStudents();
  const manifest = useManifest().data?.data;
  const { theme, setTheme } = useTheme();
  const [drawer, setDrawer] = useState<Flight | null>(null);
  const [warnDismissed, setWarnDismissed] = useState(false);

  const flights = useMemo(() => file.data?.data.flights ?? [], [file.data]);
  const leaves = file.data?.data.leaves ?? [];
  const resources = file.data?.data.resources ?? [];
  const today = bkkToday();

  const dayFlights = useMemo(() => flights.filter((f) => f.date === today), [flights, today]);
  const stats = useMemo(() => computeDayStats(dayFlights), [dayFlights]);
  const pulse = useMemo(() => hourlyPulse(dayFlights), [dayFlights]);

  const nextUp = useMemo(() => {
    const now = bkkNowMin();
    return dayFlights
      .filter((f) => f.status === 'Pending' && !f.isStandby && (minutesOf(f.start) ?? -1) >= now)
      .sort((a, b) => (minutesOf(a.start) ?? 0) - (minutesOf(b.start) ?? 0))
      .slice(0, 6);
  }, [dayFlights]);

  const recon = useMemo(
    () => (flights.length && students.length ? reconcile(flights, students) : null),
    [flights, students],
  );

  const cohort = useMemo(() => {
    if (!students.length) return null;
    const done = students.reduce((a, s) => a + s.done, 0);
    const total = students.reduce((a, s) => a + s.total, 0);
    const flyingToday = new Set(
      dayFlights.filter((f) => isAP127Batch(f.batch) && f.studentKey).map((f) => f.studentKey),
    );
    const idle = students
      .map((s) => ({ s, idle: idleDays(s, today) }))
      .filter((x) => x.idle > 5 && x.idle < 9999)
      .sort((a, b) => b.idle - a.idle)
      .slice(0, 5);
    return { done, total, pct: total ? (done / total) * 100 : 0, flyingToday, idle };
  }, [students, dayFlights, today]);

  const leavesToday = useMemo(
    () => leaves.filter((l) => today >= l.start && today <= l.end),
    [leaves, today],
  );

  const fleet = useMemo(() => {
    const real = resources.filter((r) => !/SIM|Classroom/i.test(r.acType));
    const maint = real.filter((r) => r.isMaint);
    const flying = new Set(dayFlights.filter((f) => !f.isSim && f.tail).map((f) => f.tail));
    return { total: real.length, maint, flyingCount: flying.size };
  }, [resources, dayFlights]);

  const warnings = useMemo(() => {
    if (!manifest) return [];
    return Object.entries(manifest.sources).flatMap(([src, m]) =>
      m.validation.warnings.map((w) => ({ src, ...w })),
    );
  }, [manifest]);

  if (file.isLoading || pLoading) return <LoadingBlock label="loading today…" />;

  const fd = fmtDay(today);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[19px] leading-tight font-bold tracking-wider uppercase">
            AP<span className="text-highlight">127</span> Command Center
          </div>
          <div className="mono uc text-[9px] text-ink-3">
            {fd.wd} {fd.day} {fd.mo} {fd.y} · Asia/Bangkok
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className="mono h-7 w-7 rounded border text-[10px] font-bold"
              style={{
                borderColor: theme === t.id ? 'var(--highlight)' : 'var(--line)',
                color: theme === t.id ? 'var(--highlight)' : 'var(--ink-3)',
              }}
            >
              {t.chip}
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline warnings notice */}
      {warnings.length > 0 && !warnDismissed && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--col-pending)] bg-[var(--col-pending-bg)] px-3 py-2">
          <div className="text-[11px] leading-snug" style={{ color: 'var(--col-pending)' }}>
            <b>{warnings.length} data warning(s)</b> from the last ingest —{' '}
            {warnings
              .slice(0, 2)
              .map((w) => w.code)
              .join(', ')}
            {warnings.length > 2 ? '…' : ''}{' '}
            <Link to="/integrity?tab=sources" className="underline">
              details
            </Link>
          </div>
          <button type="button" className="mono ml-auto cursor-pointer text-[10px] text-ink-3" onClick={() => setWarnDismissed(true)}>
            ✕
          </button>
        </div>
      )}

      {/* Day KPI strip (V2's 9 tiles) */}
      <div className="flex flex-wrap gap-1.5">
        <Kpi label="Total" value={stats.total} sub={`${hoursFmt(stats.schedHours)}h sched`} color="var(--col-pending)"
          info={<SourceInfo refSpec={{ sources: ['flights'], method: METHOD_BLOCK_TIME, basis: `all flights on ${today}` }} />} />
        <Kpi label="Completed" value={stats.completed} sub={stats.completionRate != null ? `${stats.completionRate.toFixed(0)}% · ${hoursFmt(stats.flownHours)}h` : `${hoursFmt(stats.flownHours)}h`} color="var(--col-done)" />
        <Kpi label="Pending" value={stats.pending} sub={`${stats.standby} stby · ${hoursFmt(stats.pendingHours)}h`} color="var(--col-pending)" />
        <Kpi label="Canceled" value={stats.canceled} sub={`${hoursFmt(stats.canceledHours)}h`} color="var(--col-cancel)" />
        <Kpi label="Hours" value={hoursFmt(stats.flownHours)} sub={`${hoursFmt(stats.schedHours)} plan`} color="var(--col-done)" />
        <Kpi label="SIM" value={stats.sim} sub={`${hoursFmt(stats.simHours)}h`} color="var(--col-sim)" />
        <Kpi label="A/C used" value={stats.tails.size} sub="aircraft" />
        <Kpi label="Instr" value={stats.instructors.size} sub="active" />
        <Kpi label="◆ AP-127" value={stats.ap127} sub={`${cohort?.flyingToday.size ?? 0} SP flying`} color="var(--highlight)" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Schedule pulse */}
        <Panel
          title={
            <Link to="/schedule/day" className="hover:text-[var(--highlight)]">
              Today's Schedule →
            </Link>
          }
          hint={`${dayFlights.length} flights`}
        >
          <div className="flex h-24 items-end gap-0.5">
            {pulse.hours.map((h) => {
              const b = pulse.buckets[h];
              return (
                <div key={h} className="flex flex-1 flex-col items-center gap-0.5" title={`${h}:00 — ${b.total} flights`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: 72 }}>
                    <div className="w-full rounded-t-sm" style={{ height: `${(b.total / pulse.max) * 100}%`, background: b.ap127 ? 'var(--highlight)' : 'var(--col-pending)', opacity: b.total ? 0.9 : 0.15, minHeight: b.total ? 3 : 2 }} />
                  </div>
                  <span className="mono text-[6.5px] text-ink-3">{String(h).padStart(2, '0')}</span>
                </div>
              );
            })}
          </div>
          <div className="mono uc mt-1 text-[7.5px] text-ink-3">magenta = includes AP-127</div>
        </Panel>

        {/* Next up */}
        <Panel title="Next departures" hint="from now (BKK)">
          {nextUp.length === 0 && <div className="mono py-4 text-center text-[10px] text-ink-3">no more pending departures today</div>}
          <div className="flex flex-col gap-1">
            {nextUp.map((f) => (
              <button key={f.id} type="button" onClick={() => setDrawer(f)} className="flex cursor-pointer items-center gap-2 rounded border border-line-soft bg-bg px-2 py-1.5 text-left hover:border-[var(--highlight)]"
                style={isAP127Batch(f.batch) ? { boxShadow: 'inset 3px 0 0 var(--highlight)' } : undefined}>
                <span className="mono text-[11px] font-bold text-ink">{f.start}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{f.student ?? f.lesson}</span>
                <span className="mono text-[9px]" style={{ color: batchColorVar(f.batch) }}>{f.batchKey}</span>
                <span className="mono text-[9px] text-ink-3">{f.tail?.replace('HS-', '')}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* AP127 pulse */}
        <Panel
          title={
            <Link to="/ap127" className="hover:text-[var(--highlight)]">
              ◆ AP-127 Pulse →
            </Link>
          }
          accent="var(--highlight)"
          hint={cohort ? `${cohort.done}/${cohort.total} lessons` : ''}
        >
          {cohort && (
            <>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="num text-[24px] font-bold text-[var(--highlight)]">{cohort.pct.toFixed(1)}%</span>
                <span className="mono uc text-[8.5px] text-ink-3">batch progress</span>
                <SourceInfo refSpec={{ sources: ['progress'], basis: 'sum of done across 28 students ÷ total curriculum' }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-[var(--highlight)]" style={{ width: `${cohort.pct}%` }} />
              </div>
              <div className="mono mt-2 text-[9px] text-ink-2">{cohort.flyingToday.size} SP on today's schedule</div>
              {cohort.idle.length > 0 && (
                <div className="mt-2">
                  <div className="mono uc mb-1 text-[8px] text-ink-3">idle alert (&gt;5 days)</div>
                  {cohort.idle.map(({ s, idle }) => (
                    <Link key={s.catcId} to={`/student/${s.nick}`} className="mono flex justify-between py-0.5 text-[9.5px] text-ink-2 hover:text-[var(--highlight)]">
                      <span>{s.nick} · {s.key}</span>
                      <span style={{ color: 'var(--col-cancel)' }}>{idle}d</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>

        {/* Fleet */}
        <Panel
          title={
            <Link to="/aircraft" className="hover:text-[var(--highlight)]">
              Fleet snapshot →
            </Link>
          }
          hint={`${fleet.flyingCount}/${fleet.total} flying today`}
        >
          <div className="flex flex-wrap gap-1.5">
            <Kpi label="Aircraft" value={fleet.total} />
            <Kpi label="On schedule" value={fleet.flyingCount} color="var(--col-done)" />
            <Kpi label="Maint" value={fleet.maint.length} color="var(--col-cancel)" />
          </div>
          {fleet.maint.length > 0 && (
            <div className="mono mt-2 flex flex-wrap gap-1 text-[9px]">
              {fleet.maint.map((r) => (
                <Tag key={r.tail} color="var(--col-cancel)">{r.tail} GND</Tag>
              ))}
            </div>
          )}
        </Panel>

        {/* Leave today */}
        <Panel title="On leave today" hint={`${leavesToday.length}`}>
          {leavesToday.length === 0 && <div className="mono py-3 text-center text-[10px] text-ink-3">nobody on leave</div>}
          <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {leavesToday.map((l, i) => (
              <div key={i} className="mono flex justify-between text-[9.5px] text-ink-2">
                <span>{l.name}</span>
                <span className="text-ink-3">{l.reason ?? 'Leave'}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Integrity badge */}
        <Panel
          title={
            <Link to="/integrity" className="hover:text-[var(--highlight)]">
              Data integrity →
            </Link>
          }
          hint="ops ⇄ progress"
        >
          {recon && (
            <div className="flex flex-wrap gap-1.5">
              <Kpi label="Consistency" value={`${recon.totals.consistency}%`} color={recon.totals.consistency >= 90 ? 'var(--col-done)' : 'var(--col-pending)'}
                info={<SourceInfo refSpec={{ sources: ['flights', 'progress'], basis: `${recon.totals.checked} lesson pairings inside the shared window (from ${recon.totals.windowStart})`, method: 'REVIEW when date Δ>1d or duration Δ>20m; CONFLICT when a lesson exists on one side only.' }} />} />
              <Kpi label="Review" value={recon.totals.review} color="var(--col-pending)" />
              <Kpi label="Conflicts" value={recon.totals.conflict} color="var(--col-cancel)" />
            </div>
          )}
        </Panel>
      </div>

      <div className="mono uc px-1 pb-2 text-[8px] text-ink-3">
        AP127 CMD V3 · data mirrored hourly from operations, progress & training-program feeds · V2 remains at ap127-ngt2.pages.dev
      </div>

      <FlightDrawer flight={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
