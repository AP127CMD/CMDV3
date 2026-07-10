// AP127 Detail: ranking table, pace bands, race & combined charts — with TIME
// TRAVEL. ?asOf=YYYY-MM-DD clips every calculation to that date (pure filter,
// tested in domain/pace). All numbers derive from studentsAsOf().

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { SourceInfo } from '@/components/SourceInfo';
import { useStudents } from '@/data/queries';
import { bkkToday, dateDiff } from '@/domain/dates';
import {
  buildCurriculumMap,
  buildPlanDateMap,
  curriculumHours,
  dayDelta,
  idleDays,
  lastFlightDate,
  plannedHoursAsOf,
  rankClass,
  studentHours,
  studentsAsOf,
} from '@/domain/pace';
import type { Student } from '@/domain/types';
import { RaceChart } from './RaceChart';
import { CombinedChart } from './CombinedChart';
import { TimeTravelScrubber } from './TimeTravelScrubber';

type SortMode = 'behind' | 'ahead' | 'hours' | 'name' | 'idle' | 'dayDelta' | 'hrsDelta' | 'lastFlt';

const RANK_COLOR: Record<'bad' | 'mid' | 'ok', string> = {
  bad: 'var(--col-cancel)',
  mid: 'var(--col-pending)',
  ok: 'var(--col-done)',
};

function idleColor(d: number): string {
  if (d <= 2) return 'var(--ink-2)';
  if (d <= 5) return 'var(--col-pending)';
  return 'var(--col-cancel)';
}

export default function Ap127View() {
  const { students: liveStudents, curriculum, isLoading } = useStudents();
  const [sp, setSp] = useSearchParams();
  const [sort, setSort] = useState<SortMode>('behind');
  const [q, setQ] = useState('');

  const asOf = sp.get('asOf'); // null = live
  const today = asOf ?? bkkToday();

  const students = useMemo(
    () => studentsAsOf(liveStudents, curriculum, asOf),
    [liveStudents, curriculum, asOf],
  );
  const curMap = useMemo(() => buildCurriculumMap(curriculum), [curriculum]);
  const planMap = useMemo(() => buildPlanDateMap(curriculum), [curriculum]);

  const batchStart = useMemo(
    () =>
      liveStudents
        .flatMap((s) => s.flown.map((f) => f.date))
        .filter(Boolean)
        .sort()[0] ?? bkkToday(),
    [liveStudents],
  );

  const kpis = useMemo(() => {
    if (!students.length) return null;
    const done = students.reduce((a, s) => a + s.done, 0);
    const total = students.reduce((a, s) => a + s.total, 0);
    const hrsDone = students.reduce((a, s) => a + studentHours(s, curMap), 0);
    const hrsPlan = plannedHoursAsOf(curriculum, today) * students.length;
    const lesPlanned = curriculum.filter((c) => c.plannedDate && c.plannedDate <= today).length * students.length;
    return {
      pct: total ? (done / total) * 100 : 0,
      done,
      total,
      hrsDone,
      hrsPlan,
      hrsDelta: hrsDone - hrsPlan,
      lesDelta: done - lesPlanned,
      curHrs: curriculumHours(curriculum) * students.length,
    };
  }, [students, curriculum, curMap, today]);

  const rows = useMemo(() => {
    const filtered = q
      ? students.filter((s) => (s.name + ' ' + s.nick).toUpperCase().includes(q.toUpperCase()))
      : students;
    const by: Record<SortMode, (a: Student, b: Student) => number> = {
      behind: (a, b) => (a.done || 0) - (b.done || 0) || idleDays(b, today) - idleDays(a, today),
      ahead: (a, b) => (b.done || 0) - (a.done || 0) || idleDays(a, today) - idleDays(b, today),
      hours: (a, b) => studentHours(b, curMap) - studentHours(a, curMap),
      name: (a, b) => a.name.localeCompare(b.name),
      idle: (a, b) => idleDays(b, today) - idleDays(a, today),
      dayDelta: (a, b) => (dayDelta(b, planMap, today) ?? -Infinity) - (dayDelta(a, planMap, today) ?? -Infinity),
      hrsDelta: (a, b) => studentHours(a, curMap) - studentHours(b, curMap),
      lastFlt: (a, b) => lastFlightDate(b).localeCompare(lastFlightDate(a)),
    };
    return [...filtered].sort(by[sort]);
  }, [students, q, sort, curMap, planMap, today]);

  // Rank by done desc (independent of table sort)
  const rankOf = useMemo(() => {
    const sorted = [...students].sort((a, b) => (b.done || 0) - (a.done || 0));
    return new Map(sorted.map((s, i) => [s.catcId, i + 1]));
  }, [students]);

  // Pace bands: distribution of done across the cohort
  const bands = useMemo(() => {
    if (!students.length) return null;
    const dones = students.map((s) => s.done);
    const min = Math.min(...dones);
    const max = Math.max(...dones);
    return { min, max, spread: max - min, avg: dones.reduce((a, b) => a + b, 0) / dones.length };
  }, [students]);

  if (isLoading) return <LoadingBlock label="loading AP-127 cohort…" />;
  if (!kpis || !bands) return <LoadingBlock />;

  const phAll = plannedHoursAsOf(curriculum, today);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">
            <span className="text-highlight">AP-127</span> Batch Detail
          </div>
          <div className="mono uc text-[9px] text-ink-3">
            28-student cohort · curriculum {curriculum.length} lessons
          </div>
        </div>
      </div>

      <TimeTravelScrubber
        asOf={asOf}
        batchStart={batchStart}
        onChange={(d) => {
          const next = new URLSearchParams(sp);
          if (d) next.set('asOf', d);
          else next.delete('asOf');
          setSp(next, { replace: true });
        }}
      />

      {/* KPI strip (V2's 4 tiles + spread) */}
      <div className="flex flex-wrap gap-1.5">
        <Kpi label="Batch progress" value={`${kpis.pct.toFixed(1)}%`} sub={`${kpis.done}/${kpis.total} lessons`} color="var(--highlight)"
          info={<SourceInfo refSpec={{ sources: ['progress'], basis: asOf ? `time travel: as of ${asOf}` : 'live data' }} />} />
        <Kpi label="Students" value={students.length} color="var(--highlight)" />
        <Kpi label="Hrs done vs plan" value={kpis.hrsDone.toFixed(0)} sub={`plan ${kpis.hrsPlan.toFixed(0)} · Δ ${kpis.hrsDelta >= 0 ? '+' : ''}${kpis.hrsDelta.toFixed(0)}h`} color={kpis.hrsDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'}
          info={<SourceInfo refSpec={{ sources: ['progress'], method: 'Per flown lesson: curriculum planned minutes when known, else actual minutes (V2 rule).' }} />} />
        <Kpi label="Lessons vs plan" value={kpis.lesDelta >= 0 ? `+${kpis.lesDelta}` : kpis.lesDelta} sub={`plan to ${today}`} color={kpis.lesDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} />
        <Kpi label="Spread" value={bands.spread} sub={`leader ${bands.max} · lagger ${bands.min} · avg ${bands.avg.toFixed(1)}`} color="var(--col-pending)" />
      </div>

      {/* Pace bands strip */}
      <Panel title="Pace spread" hint="each dot = one SP, by lessons done">
        <div className="relative h-10">
          {students.map((s) => {
            const x = bands.spread ? ((s.done - bands.min) / bands.spread) * 100 : 50;
            return (
              <Link
                key={s.catcId}
                to={`/student/${s.nick}`}
                title={`${s.nick} · ${s.done} done`}
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border hover:z-10 hover:scale-150"
                style={{
                  left: `${2 + x * 0.96}%`,
                  background: 'color-mix(in oklab, var(--highlight) 45%, var(--surface))',
                  borderColor: 'var(--highlight)',
                }}
              />
            );
          })}
          <div className="mono absolute bottom-0 left-0 text-[8px] text-ink-3">{bands.min}</div>
          <div className="mono absolute right-0 bottom-0 text-[8px] text-ink-3">{bands.max}</div>
        </div>
      </Panel>

      {/* Ranking table */}
      <Panel
        title="Progress ranking"
        hint={
          <span className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search…"
              className="mono w-24 rounded border border-line bg-bg px-1.5 py-0.5 text-[9px] text-ink outline-none"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="mono rounded border border-line bg-bg px-1 py-0.5 text-[9px] text-ink"
            >
              <option value="behind">Most behind</option>
              <option value="ahead">Most ahead</option>
              <option value="hours">Most hours</option>
              <option value="idle">Most idle</option>
              <option value="dayDelta">Day Δ</option>
              <option value="hrsDelta">Hrs Δ</option>
              <option value="lastFlt">Last flight</option>
              <option value="name">Name A–Z</option>
            </select>
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full min-w-[880px] border-collapse text-[11px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="sticky left-0 z-10 bg-bg-2 px-2 py-1.5 text-left">#</th>
                <th className="px-2 text-left">Student</th>
                <th className="px-2 text-left">Sign</th>
                <th className="px-2 text-left">SE</th>
                <th className="px-2 text-left">FI</th>
                <th className="px-2 text-left">Progress</th>
                <th className="px-2 text-right">Hrs</th>
                <th className="px-2 text-right">Done</th>
                <th className="px-2 text-left">Last lesson</th>
                <th className="px-2 text-left">Last flt</th>
                <th className="px-2 text-right">Idle</th>
                <th className="px-2 text-right">Day Δ</th>
                <th className="px-2 text-right">Hrs Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const rank = rankOf.get(s.catcId) ?? 0;
                const rc = rankClass(students.length - rank + 1, students.length);
                const idle = idleDays(s, today);
                const dd = dayDelta(s, planMap, today);
                const hrs = studentHours(s, curMap);
                const hd = hrs - phAll;
                const lastF = lastFlightDate(s);
                const rel = lastF ? (dateDiff(today, lastF) ?? 0) : null;
                return (
                  <tr key={s.catcId} className="border-b border-line-soft hover:bg-bg-2">
                    <td className="mono sticky left-0 z-10 bg-bg px-2 py-1.5 font-bold" style={{ color: RANK_COLOR[rc] }}>
                      {rank}
                    </td>
                    <td className="px-2 font-semibold whitespace-nowrap text-ink">
                      <Link to={`/student/${s.nick}`} className="hover:text-[var(--highlight)]">
                        {s.name}
                      </Link>
                    </td>
                    <td className="mono px-2 whitespace-nowrap text-[var(--highlight)]">{s.nick}</td>
                    <td className="mono px-2 text-[9px] whitespace-nowrap" style={{ color: s.se.includes('TDI') ? 'var(--col-solo)' : 'var(--col-stby)' }}>
                      {s.se.replace('DA40-', '')}
                    </td>
                    <td className="mono px-2 text-[9px] whitespace-nowrap text-ink-2">{s.fi}</td>
                    <td className="min-w-[110px] px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                          <div className="h-full rounded-full bg-[var(--highlight)]" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className="mono num text-[9px] text-ink-2">{s.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="mono num px-2 text-right">{hrs.toFixed(1)}</td>
                    <td className="mono num px-2 text-right font-bold text-ink">
                      {s.done}
                      <span className="text-[8px] text-ink-3">/{s.total}</span>
                    </td>
                    <td className="mono px-2 text-[9.5px] whitespace-nowrap text-ink-2">{s.flown.at(-1)?.lesson ?? '—'}</td>
                    <td className="mono px-2 text-[9.5px] whitespace-nowrap text-ink-2">
                      {lastF || '—'}
                      {rel != null && <span className="ml-1 text-[8px] text-ink-3">{rel <= 0 ? 'today' : `${rel}d`}</span>}
                    </td>
                    <td className="mono num px-2 text-right font-bold" style={{ color: idleColor(idle) }}>
                      {idle === 9999 ? '—' : idle}
                    </td>
                    <td className="mono num px-2 text-right" style={{ color: (dd ?? 0) > 0 ? 'var(--col-cancel)' : 'var(--col-done)' }}>
                      {dd == null ? '—' : `${dd > 0 ? '+' : ''}${dd.toFixed(0)}d`}
                    </td>
                    <td className="mono num px-2 text-right" style={{ color: hd >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' }}>
                      {`${hd >= 0 ? '+' : ''}${hd.toFixed(0)}h`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <CombinedChart students={students} curriculum={curriculum} asOfDate={today} live={!asOf} />
      <RaceChart students={students} curMap={curMap} batchStart={batchStart} asOfDate={today} />
    </div>
  );
}
