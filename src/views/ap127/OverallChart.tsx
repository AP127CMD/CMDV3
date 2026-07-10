// Overall Progress: horizontal bar per student, leader→lagger (V2 buildAP127OverallChart).

import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { paceSort } from '@/domain/pace';
import type { Student } from '@/domain/types';

const HUE_COUNT = 28;

export function OverallChart({ students, today }: { students: readonly Student[]; today: string }) {
  const defs = useChartDefaults();
  const sorted = useMemo(() => paceSort(students, today), [students, today]);
  const maxDone = Math.max(1, ...sorted.map((s) => s.done));

  return (
    <ChartCard
      title="Overall progress — all students"
      hint={`${sorted.length} students, leader → lagger`}
      refSpec={{ sources: ['progress'], basis: 'lessons done per student, sorted by pace' }}
      height={Math.max(320, sorted.length * 20)}
    >
      <Bar
        data={{
          labels: sorted.map((s) => s.nick),
          datasets: [
            {
              label: 'Lessons done',
              data: sorted.map((s) => s.done),
              backgroundColor: sorted.map((_, i) => `hsla(${Math.round((i * 360) / HUE_COUNT)},80%,58%,0.74)`),
              borderRadius: 2,
            },
          ],
        }}
        options={{
          ...defs.base,
          indexAxis: 'y' as const,
          plugins: { ...defs.base.plugins, legend: { display: false } },
          scales: {
            x: { ...defs.base.scales.x, max: maxDone, title: { display: true, text: 'lessons done', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            y: { ...defs.base.scales.y, ticks: { ...defs.base.scales.y.ticks, autoSkip: false } },
          },
        }}
      />
    </ChartCard>
  );
}
