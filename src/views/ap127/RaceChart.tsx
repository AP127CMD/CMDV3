// Actual-vs-batch race: cumulative lessons (or hours) per student over time,
// thick magenta batch-average line on top (V2 race chart, Lessons/Hours modes
// + per-student solo filter). Mode + solo are lifted to the parent so the
// Individual Lead/Lag History chart below can share them (V2 behavior).

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chip } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { dayRange } from '@/domain/dates';
import type { CurriculumRow, Student } from '@/domain/types';

const LINE_COLORS = [
  '#4a9eff', '#2dd4bf', '#fb923c', '#a78bfa', '#f472b6', '#fbbf24', '#22d3ee',
  '#f87171', '#c084fc', '#86efac', '#fdba74', '#67e8f9', '#94a3b8', '#e879f9',
];

export function RaceChart({
  students,
  curriculum,
  curMap,
  batchStart,
  asOfDate,
  mode,
  onModeChange,
  solo,
  onSoloChange,
}: {
  students: readonly Student[];
  curriculum: readonly CurriculumRow[];
  curMap: Record<string, number>;
  batchStart: string;
  asOfDate: string;
  mode: 'lessons' | 'hours';
  onModeChange: (m: 'lessons' | 'hours') => void;
  solo: string | null;
  onSoloChange: (nick: string | null) => void;
}) {
  const defs = useChartDefaults();

  const data = useMemo(() => {
    const days = dayRange(batchStart, asOfDate).filter((_, i, a) => i % Math.ceil(a.length / 120) === 0 || i === a.length - 1);
    const series = students.map((s) => {
      const sorted = [...s.flown].sort((a, b) => a.date.localeCompare(b.date));
      let idx = 0;
      let acc = 0;
      return days.map((d) => {
        while (idx < sorted.length && sorted[idx].date <= d) {
          acc += mode === 'hours' ? (curMap[sorted[idx].lesson] ?? sorted[idx].actualMins ?? 0) / 60 : 1;
          idx++;
        }
        return acc;
      });
    });
    const avg = days.map((_, i) => series.reduce((a, s) => a + s[i], 0) / (series.length || 1));

    // Planned Target — per-student curriculum baseline (V2: cumulative planned
    // lessons, or planned hours from plannedMins, by planned_date <= asOfDate).
    const plannedByDate = new Map<string, number>();
    for (const c of curriculum) {
      if (!c.plannedDate || c.plannedDate > asOfDate) continue;
      const v = mode === 'hours' ? (c.plannedMins ?? 0) / 60 : 1;
      plannedByDate.set(c.plannedDate, (plannedByDate.get(c.plannedDate) ?? 0) + v);
    }
    let planRun = 0;
    const planned = days.map((d) => {
      planRun += plannedByDate.get(d) ?? 0;
      return +planRun.toFixed(2);
    });

    return {
      labels: days.map((d) => d.slice(5)),
      datasets: [
        {
          label: 'Planned target',
          data: planned,
          borderColor: '#cbd5e1',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
        },
        ...students.map((s, i) => ({
          label: s.nick,
          data: series[i],
          borderColor: LINE_COLORS[i % LINE_COLORS.length],
          borderWidth: !solo || s.nick === solo ? 1 : 0,
          hidden: !!solo && s.nick !== solo,
          pointRadius: 0,
          tension: 0.2,
        })),
        {
          label: '◆ Batch avg',
          data: avg,
          borderColor: defs.theme.highlight,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.2,
          order: 999,
        },
      ],
    };
  }, [students, curriculum, curMap, batchStart, asOfDate, mode, solo, defs.theme.highlight]);

  return (
    <div className="flex flex-col gap-2">
      <ChartCard
        title="Race — cumulative per student"
        accent="var(--highlight)"
        hint={
          <span className="flex flex-wrap items-center gap-1">
            <Chip active={mode === 'lessons'} onClick={() => onModeChange('lessons')}>Lessons</Chip>
            <Chip active={mode === 'hours'} onClick={() => onModeChange('hours')}>Hours</Chip>
            <span className="mx-1 text-ink-3">·</span>
            <span className="mono text-[8.5px] text-ink-3">◆ thick = batch avg · - - = planned target</span>
          </span>
        }
        refSpec={{
          sources: ['progress'],
          basis: `cumulative ${mode} per student, ${batchStart} → ${asOfDate}${solo ? ` · filtered to ${solo}` : ''}`,
          method: mode === 'hours' ? 'Hours per lesson: curriculum planned minutes when known, else actual minutes. Planned target: cumulative curriculum plannedMins/plannedDate.' : 'Planned target: cumulative curriculum lessons by plannedDate.',
        }}
        height={300}
      >
        <Line
          data={data}
          options={{
            ...defs.base,
            plugins: { ...defs.base.plugins, legend: { display: false } },
            scales: {
              x: { ...defs.base.scales.x, ticks: { ...defs.base.scales.x.ticks, autoSkip: true, maxTicksLimit: 10 } },
              y: { ...defs.base.scales.y, title: { display: true, text: mode === 'hours' ? 'hours' : 'lessons', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>

      {/* Per-student toggle row (V2's d127-race-toggles) — click a student to
          solo their line, click again to return to ALL. Shared with the
          Individual Lead/Lag History chart below via the lifted `solo` state. */}
      <div className="mono flex flex-wrap gap-1.5 rounded-md bg-bg-2 p-2">
        <Chip active={!solo} onClick={() => onSoloChange(null)} accent="var(--col-done)">ALL</Chip>
        {students.map((s) => (
          <Chip key={s.nick} active={solo === s.nick} onClick={() => onSoloChange(solo === s.nick ? null : s.nick)} accent="#38bdf8">
            {s.nick}
          </Chip>
        ))}
      </div>
    </div>
  );
}
