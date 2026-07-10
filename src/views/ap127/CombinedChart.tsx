// Combined batch progress vs curriculum plan, with dual forward projections
// from 30-day and 15-day rolling paces (V2 p84 behavior) and the 5-tile KPI
// strip (Done/Total · Proj 30d · Proj 15d · Plan finish · vs Plan today).

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chip, Kpi } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { addDays, dateDiff, dayRange } from '@/domain/dates';
import type { CurriculumRow, Student } from '@/domain/types';

type Mode = 'lessons' | 'hours';

export function CombinedChart({
  students,
  curriculum,
  asOfDate,
  live,
}: {
  students: readonly Student[];
  curriculum: readonly CurriculumRow[];
  asOfDate: string;
  live: boolean;
}) {
  const [mode, setMode] = useState<Mode>('hours');
  const [horizon, setHorizon] = useState<'today' | 'proj'>('proj');
  const defs = useChartDefaults();

  const model = useMemo(() => {
    const n = students.length || 1;
    const unit = (mins: number | null) => (mode === 'hours' ? (mins ?? 0) / 60 : 1);

    // Actual cumulative (batch total)
    const events = students
      .flatMap((s) => s.flown.map((f) => ({ date: f.date, v: unit(curriculumMins(curriculum, f.lesson) ?? f.actualMins) })))
      .filter((e) => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!events.length) return null;
    const start = events[0].date;

    // Plan cumulative (per student × n)
    const planEvents = curriculum
      .filter((c) => c.plannedDate)
      .map((c) => ({ date: c.plannedDate!, v: unit(c.plannedMins) * n }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const planEnd = planEvents.at(-1)?.date ?? asOfDate;

    const total = curriculum.reduce((a, c) => a + unit(c.plannedMins), 0) * n;
    const actualNow = events.reduce((a, e) => (e.date <= asOfDate ? a + e.v : a), 0);

    // Rolling paces (per day)
    const paceOver = (days: number) => {
      const from = addDays(asOfDate, -days);
      const got = events.reduce((a, e) => (e.date > from && e.date <= asOfDate ? a + e.v : a), 0);
      return got / days;
    };
    const pace30 = paceOver(30);
    const pace15 = paceOver(15);
    const projEnd = (pace: number) =>
      pace > 0 ? addDays(asOfDate, Math.ceil((total - actualNow) / pace)) : null;
    const proj30End = projEnd(pace30);
    const proj15End = projEnd(pace15);

    const endDate =
      horizon === 'today'
        ? asOfDate
        : [planEnd, proj30End, proj15End].filter(Boolean).sort().at(-1)!;

    const days = dayRange(start, endDate);
    const step = Math.max(1, Math.ceil(days.length / 150));
    const axis = days.filter((_, i) => i % step === 0 || i === days.length - 1);

    const cum = (evts: Array<{ date: string; v: number }>, clip?: string) => {
      let idx = 0;
      let acc = 0;
      return axis.map((d) => {
        if (clip && d > clip) return null;
        while (idx < evts.length && evts[idx].date <= d) {
          acc += evts[idx].v;
          idx++;
        }
        return acc;
      });
    };

    const actual = cum([...events], asOfDate);
    const plan = cum(planEvents);
    const projLine = (end: string | null) =>
      end
        ? axis.map((d) =>
            d < asOfDate ? null : d > end ? null : actualNow + ((total - actualNow) * (dateDiff(d, asOfDate) ?? 0)) / Math.max(1, dateDiff(end, asOfDate) ?? 1),
          )
        : axis.map(() => null);

    return {
      axis,
      actual,
      plan,
      proj30: horizon === 'proj' ? projLine(proj30End) : axis.map(() => null),
      proj15: horizon === 'proj' ? projLine(proj15End) : axis.map(() => null),
      kpi: { actualNow, total, proj30End, proj15End, planEnd, pace30: pace30 * 7, pace15: pace15 * 7 },
    };
  }, [students, curriculum, asOfDate, mode, horizon]);

  if (!model) return null;
  const u = mode === 'hours' ? 'h' : '';
  const vsPlanToday = (() => {
    const planNow = model.plan[model.axis.findLastIndex((d) => d <= asOfDate)] ?? 0;
    return model.kpi.actualNow - (planNow ?? 0);
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Kpi label={mode === 'hours' ? 'Hours done' : 'Lessons done'} value={model.kpi.actualNow.toFixed(0)} sub={`of ${model.kpi.total.toFixed(0)}${u}`} color="var(--highlight)" />
        <Kpi label="Proj 30d finish" value={model.kpi.proj30End ?? '—'} sub={`${model.kpi.pace30.toFixed(1)}${u}/wk`} color="#38bdf8" />
        <Kpi label="Proj 15d finish" value={model.kpi.proj15End ?? '—'} sub={`${model.kpi.pace15.toFixed(1)}${u}/wk`} color="#fb923c" />
        <Kpi label="Plan finish" value={model.kpi.planEnd} color="var(--col-done)" />
        <Kpi label="vs plan today" value={`${vsPlanToday >= 0 ? '+' : ''}${vsPlanToday.toFixed(0)}${u}`} color={vsPlanToday >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} />
      </div>
      <ChartCard
        title="Combined progress vs plan"
        accent="var(--highlight)"
        hint={
          <span className="flex gap-1">
            <Chip active={mode === 'lessons'} onClick={() => setMode('lessons')}>Lessons</Chip>
            <Chip active={mode === 'hours'} onClick={() => setMode('hours')}>Hours</Chip>
            <Chip active={horizon === 'today'} onClick={() => setHorizon('today')}>To today</Chip>
            <Chip active={horizon === 'proj'} onClick={() => setHorizon('proj')}>To proj. end</Chip>
          </span>
        }
        refSpec={{
          sources: ['progress'],
          basis: live ? 'live data' : `time travel: as of ${asOfDate}`,
          method: 'Projections extend the last 30-/15-day batch pace linearly to curriculum total. Hours prefer curriculum planned minutes per lesson.',
        }}
        height={300}
      >
        <Line
          data={{
            labels: model.axis.map((d) => d.slice(2)),
            datasets: [
              { label: 'Actual', data: model.actual, borderColor: defs.theme.highlight, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 0, tension: 0.15 },
              { label: 'Plan', data: model.plan, borderColor: defs.theme.ink3, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.15 },
              { label: 'Proj 30d', data: model.proj30, borderColor: '#38bdf8', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
              { label: 'Proj 15d', data: model.proj15, borderColor: '#fb923c', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
            ],
          }}
          options={{
            ...defs.base,
            spanGaps: false,
            scales: {
              x: { ...defs.base.scales.x, ticks: { ...defs.base.scales.x.ticks, autoSkip: true, maxTicksLimit: 12 } },
              y: { ...defs.base.scales.y, title: { display: true, text: mode === 'hours' ? 'batch hours' : 'batch lessons', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>
    </div>
  );
}

function curriculumMins(cur: readonly CurriculumRow[], lesson: string): number | null {
  const row = cur.find((c) => c.lesson === lesson);
  return row?.plannedMins ?? null;
}
