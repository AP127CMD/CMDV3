// Actual-vs-batch race: cumulative lessons (or hours) per student over time,
// thick magenta batch-average line on top (V2 race chart, Lessons/Hours modes).

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chip } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { dayRange } from '@/domain/dates';
import type { Student } from '@/domain/types';

const LINE_COLORS = [
  '#4a9eff', '#2dd4bf', '#fb923c', '#a78bfa', '#f472b6', '#fbbf24', '#22d3ee',
  '#f87171', '#c084fc', '#86efac', '#fdba74', '#67e8f9', '#94a3b8', '#e879f9',
];

export function RaceChart({
  students,
  curMap,
  batchStart,
  asOfDate,
}: {
  students: readonly Student[];
  curMap: Record<string, number>;
  batchStart: string;
  asOfDate: string;
}) {
  const [mode, setMode] = useState<'lessons' | 'hours'>('lessons');
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
    return {
      labels: days.map((d) => d.slice(5)),
      datasets: [
        ...students.map((s, i) => ({
          label: s.nick,
          data: series[i],
          borderColor: LINE_COLORS[i % LINE_COLORS.length],
          borderWidth: 1,
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
  }, [students, curMap, batchStart, asOfDate, mode, defs.theme.highlight]);

  return (
    <ChartCard
      title="Race — cumulative per student"
      accent="var(--highlight)"
      hint={
        <span className="flex gap-1">
          <Chip active={mode === 'lessons'} onClick={() => setMode('lessons')}>Lessons</Chip>
          <Chip active={mode === 'hours'} onClick={() => setMode('hours')}>Hours</Chip>
        </span>
      }
      refSpec={{
        sources: ['progress'],
        basis: `cumulative ${mode} per student, ${batchStart} → ${asOfDate}`,
        method: mode === 'hours' ? 'Hours per lesson: curriculum planned minutes when known, else actual minutes.' : undefined,
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
  );
}
