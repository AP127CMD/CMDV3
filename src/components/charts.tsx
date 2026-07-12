// Chart.js setup + theme-reactive wrapper. react-chartjs-2 owns the canvas
// lifecycle (the V2 pain point); controllers registered exactly once here.

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Panel } from './atoms';
import { SourceInfo, type SourceRef } from './SourceInfo';
import { useTheme } from '@/state/theme';

ChartJS.register(
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels,
);

export function cssVar(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export interface ChartTheme {
  ink2: string;
  ink3: string;
  line: string;
  highlight: string;
}

/** Resolve theme colors once per theme switch so charts re-render correctly. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const [t, setT] = useState<ChartTheme>(() => ({
    ink2: cssVar('--ink-2'),
    ink3: cssVar('--ink-3'),
    line: cssVar('--line-soft'),
    highlight: cssVar('--highlight'),
  }));
  useEffect(() => {
    setT({
      ink2: cssVar('--ink-2'),
      ink3: cssVar('--ink-3'),
      line: cssVar('--line-soft'),
      highlight: cssVar('--highlight'),
    });
  }, [theme]);
  return t;
}

/** Common scale/plugin option fragments in the current theme. */
export function useChartDefaults() {
  const t = useChartTheme();
  return useMemo(
    () => ({
      theme: t,
      base: {
        responsive: true as const,
        maintainAspectRatio: false as const,
        interaction: { mode: 'nearest' as const, intersect: false },
        plugins: {
          legend: {
            labels: {
              font: { family: 'JetBrains Mono', size: 9 },
              color: t.ink2,
              boxWidth: 10,
              usePointStyle: true,
            },
          },
          tooltip: {
            titleFont: { family: 'JetBrains Mono', size: 10 },
            bodyFont: { family: 'JetBrains Mono', size: 10 },
          },
          // Off by default (V2's copts() rule) — charts opt in per-dataset,
          // e.g. School Performance's stacked bars (see performance/index.tsx).
          datalabels: { display: false },
        },
        scales: {
          x: {
            ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: t.ink3, maxRotation: 0 },
            grid: { color: t.line },
          },
          y: {
            ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: t.ink3 },
            grid: { color: t.line },
          },
        },
      },
    }),
    [t],
  );
}

export function ChartCard({
  title,
  hint,
  height = 260,
  refSpec,
  children,
  accent,
}: {
  title: ReactNode;
  hint?: ReactNode;
  height?: number;
  refSpec?: SourceRef;
  children: ReactNode;
  accent?: string;
}) {
  // Mount the chart only once the wrapper has real width. A chart created
  // while a lazy-loaded route's container is still 0px wide keeps its bars at
  // the origin even after Chart.js resizes the axes (V2 hit the same and used
  // observeChartResize). Gating on width fixes every ChartCard at once.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (el.clientWidth > 0) {
      setSized(true);
      return;
    }
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        setSized(true);
        ro.disconnect();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {title}
          {refSpec && <SourceInfo refSpec={refSpec} align="left" />}
        </span>
      }
      hint={hint}
      accent={accent}
    >
      <div ref={wrapRef} style={{ height, position: 'relative' }}>
        {sized && children}
      </div>
    </Panel>
  );
}
