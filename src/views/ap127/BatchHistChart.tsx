// Batch Lead/Lag History: single line = cumulative actual − cumulative plan
// for the whole cohort, green fill above zero / red below (V2 buildAP127HistBatch).

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chip, Kpi } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { batchLeadLag } from '@/domain/leadlag';
import type { LeadLagMode } from '@/domain/progress-series';
import type { CurriculumRow, Student } from '@/domain/types';

function fmt(v: number, mode: LeadLagMode): string {
  const sign = v >= 0 ? '+' : '';
  return mode === 'hours' ? `${sign}${v.toFixed(1)}h` : `${sign}${Math.round(v)} les`;
}

export function BatchHistChart({
  students,
  curriculum,
  today,
}: {
  students: readonly Student[];
  curriculum: readonly CurriculumRow[];
  today: string;
}) {
  const [mode, setMode] = useState<LeadLagMode>('hours');
  const defs = useChartDefaults();
  const result = useMemo(() => batchLeadLag(students, curriculum, mode, today), [students, curriculum, mode, today]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Kpi label="Now" value={fmt(result.now, mode)} color={result.now >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} sub="vs plan today" />
        <Kpi label="Best" value={fmt(result.best, mode)} color="var(--col-done)" sub="peak lead ever" />
        <Kpi label="Worst" value={fmt(result.worst, mode)} color="var(--col-cancel)" sub="peak lag ever" />
      </div>
      <ChartCard
        title="Batch lead / lag history"
        hint={
          <span className="flex gap-1">
            <Chip active={mode === 'hours'} onClick={() => setMode('hours')}>Hours</Chip>
            <Chip active={mode === 'lessons'} onClick={() => setMode('lessons')}>Lessons</Chip>
          </span>
        }
        refSpec={{ sources: ['progress'], basis: 'Σ actual − Σ planned across all 28 students, cumulative to date' }}
        height={220}
      >
        <Line
          data={{
            labels: result.points.map((p) => p.date.slice(5)),
            datasets: [
              {
                label: 'Batch Δ',
                data: result.points.map((p) => p.value),
                borderColor: defs.theme.highlight,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.15,
                fill: {
                  target: { value: 0 },
                  above: 'color-mix(in oklab, var(--col-done) 14%, transparent)',
                  below: 'color-mix(in oklab, var(--col-cancel) 14%, transparent)',
                },
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
    </div>
  );
}
