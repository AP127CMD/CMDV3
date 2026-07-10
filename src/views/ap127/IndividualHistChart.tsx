// Individual Lead/Lag History: 28 per-student Δ lines + a thick magenta batch
// average (V2 buildAP127HistSolo). Shares mode + solo filter with the Race chart.

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { individualLeadLag } from '@/domain/leadlag';
import type { LeadLagMode } from '@/domain/progress-series';
import type { CurriculumRow, Student } from '@/domain/types';

const LINE_COLORS = [
  '#4a9eff', '#2dd4bf', '#fb923c', '#a78bfa', '#f472b6', '#fbbf24', '#22d3ee',
  '#f87171', '#c084fc', '#86efac', '#fdba74', '#67e8f9', '#94a3b8', '#e879f9',
];

export function IndividualHistChart({
  students,
  curriculum,
  today,
  mode,
  solo,
}: {
  students: readonly Student[];
  curriculum: readonly CurriculumRow[];
  today: string;
  mode: LeadLagMode;
  solo: string | null; // nick or null = all
}) {
  const defs = useChartDefaults();
  const result = useMemo(() => individualLeadLag(students, curriculum, mode, today), [students, curriculum, mode, today]);

  return (
    <ChartCard
      title="Individual lead / lag history"
      hint={solo ? `showing ${solo} + batch avg` : 'all 28 + batch avg'}
      refSpec={{ sources: ['progress'], basis: 'per-student cumulative actual − cumulative plan; shares mode/filter with the Race chart above' }}
      height={280}
    >
      <Line
        data={{
          labels: result.days.map((d) => d.slice(5)),
          datasets: [
            {
              label: 'Zero',
              data: result.days.map(() => 0),
              borderColor: 'color-mix(in oklab, var(--ink-3) 40%, transparent)',
              borderDash: [4, 3],
              borderWidth: 1,
              pointRadius: 0,
            },
            ...result.series.map((s) => {
              const visible = !solo || s.student.nick === solo;
              const i = students.indexOf(s.student);
              return {
                label: s.student.nick,
                data: s.points.map((p) => p.value),
                borderColor: LINE_COLORS[i % LINE_COLORS.length],
                borderWidth: visible ? 1.5 : 0,
                pointRadius: 0,
                hidden: !visible,
                tension: 0.15,
              };
            }),
            {
              label: '◆ Batch avg',
              data: result.avg.map((p) => p.value),
              borderColor: defs.theme.highlight,
              borderWidth: 3,
              pointRadius: 0,
              tension: 0.15,
              order: 999,
            },
          ],
        }}
        options={{
          ...defs.base,
          plugins: { ...defs.base.plugins, legend: { display: false } },
          scales: {
            x: { ...defs.base.scales.x, ticks: { ...defs.base.scales.x.ticks, autoSkip: true, maxTicksLimit: 10 } },
            y: { ...defs.base.scales.y },
          },
        }}
      />
    </ChartCard>
  );
}
