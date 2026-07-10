// Flight Timeline vs Progress: one row per student (leader→lagger), a dot per
// flown lesson colored by curriculum phase, gap segments >7 days in red, an
// idle dash from last flight to today, and a today marker (V2 buildAP127Timeline).
//
// Redesign note: V2 rendered gap/idle/count as always-on canvas text labels.
// V3 uses tooltips instead (identical information, but usable at 375px —
// V2's fixed pixel labels would be unreadable on mobile).

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ScriptableLineSegmentContext, TooltipItem } from 'chart.js';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { dayNumber, isoFromDayNumber } from '@/domain/dates';
import { idleColorVar, idleDays, lastFlightDate, paceSort } from '@/domain/pace';
import { lessonPhase, PHASE_OTHER } from '@/domain/lessons';
import type { Student } from '@/domain/types';

interface TimelinePoint {
  x: number;
  y: number;
  date?: string;
  lesson?: string;
  color?: string;
}

const GAP_DAYS = 7;

export function FlightTimeline({ students, today }: { students: readonly Student[]; today: string }) {
  const defs = useChartDefaults();
  const sorted = useMemo(() => paceSort(students, today), [students, today]);
  const todayNum = dayNumber(today);

  const { datasets, xMin, xMax } = useMemo(() => {
    let xMin = todayNum;
    const ds: ChartData<'line', TimelinePoint[]>['datasets'] = [];
    sorted.forEach((s, idx) => {
      const row = idx + 1;
      const flown = [...s.flown].filter((f) => f.date).sort((a, b) => a.date.localeCompare(b.date));
      const pts: TimelinePoint[] = flown.map((f) => {
        const x = dayNumber(f.date);
        xMin = Math.min(xMin, x);
        return { x, y: row, date: f.date, lesson: f.lesson, color: lessonPhase(f.lesson).color };
      });
      if (pts.length) {
        ds.push({
          label: s.nick,
          data: pts,
          showLine: true,
          borderColor: 'rgba(150,150,150,0.35)',
          borderWidth: 0.8,
          pointBackgroundColor: pts.map((p) => p.color ?? PHASE_OTHER.color),
          pointBorderWidth: 0,
          pointRadius: 3,
          // Closures over this dataset's own `pts` array — avoids reaching into
          // ctx.chart (ScriptableLineSegmentContext doesn't expose it in the
          // public Chart.js types), using p0DataIndex/p1DataIndex directly.
          segment: {
            borderColor: (ctx: ScriptableLineSegmentContext) => {
              const a = pts[ctx.p0DataIndex];
              const b = pts[ctx.p1DataIndex];
              if (!a || !b) return 'rgba(180,180,180,0.35)';
              return b.x - a.x > GAP_DAYS ? '#fca5a5' : 'rgba(180,180,180,0.35)';
            },
            borderWidth: (ctx: ScriptableLineSegmentContext) => {
              const a = pts[ctx.p0DataIndex];
              const b = pts[ctx.p1DataIndex];
              if (!a || !b) return 0.8;
              return b.x - a.x > GAP_DAYS ? 1.6 : 0.8;
            },
          },
        });
      }
      const last = lastFlightDate(s);
      if (last && last !== today) {
        const idle = idleDays(s, today);
        ds.push({
          label: `__idle_${idx}`,
          data: [
            { x: dayNumber(last), y: row },
            { x: todayNum, y: row },
          ],
          showLine: true,
          borderColor: idleColorVar(idle),
          borderWidth: idle > 10 ? 2 : 1.2,
          borderDash: [3, 3],
          pointRadius: 0,
        });
      }
    });
    // today vertical line
    ds.push({
      label: '__today',
      data: [
        { x: todayNum, y: 0.5 },
        { x: todayNum, y: sorted.length + 0.5 },
      ],
      showLine: true,
      borderColor: '#f59e0b',
      borderWidth: 1.4,
      borderDash: [5, 4],
      pointRadius: 0,
    });
    return { datasets: ds, xMin, xMax: todayNum + Math.max(3, Math.round((todayNum - xMin) * 0.03)) };
  }, [sorted, today, todayNum]);

  if (!sorted.length) return null;
  const leader = sorted[0];
  const lag = sorted.at(-1)!;

  return (
    <ChartCard
      title="Flight timeline vs progress"
      hint={`leader ${leader.nick} (${leader.done}) · lag ${lag.nick} (${lag.done})`}
      refSpec={{
        sources: ['progress'],
        basis: 'one row per student, leader → lagger; dot = flown lesson, colored by curriculum phase',
        method: `Red segment = gap between consecutive flights > ${GAP_DAYS} days. Dashed tail = idle since last flight (color scales with severity). Amber line = today.`,
      }}
      height={Math.max(320, sorted.length * 16)}
    >
      <Line
        data={{ datasets }}
        options={{
          ...defs.base,
          plugins: {
            ...defs.base.plugins,
            legend: { display: false },
            tooltip: {
              ...defs.base.plugins.tooltip,
              callbacks: {
                title: () => '',
                label: (ctx: TooltipItem<'line'>) => {
                  const raw = ctx.raw as TimelinePoint;
                  const label = ctx.dataset.label ?? '';
                  if (label.startsWith('__')) return '';
                  if (!raw.date) return label;
                  return `${label} · ${raw.lesson} · ${raw.date}`;
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              min: xMin - 1,
              max: xMax,
              ticks: {
                ...defs.base.scales.x.ticks,
                callback: (v: number | string) => {
                  const n = typeof v === 'number' ? v : parseFloat(v);
                  const iso = isoFromDayNumber(n);
                  return iso.slice(5);
                },
              },
              grid: defs.base.scales.x.grid,
            },
            y: {
              type: 'linear',
              min: 0.5,
              max: sorted.length + 0.5,
              reverse: true,
              afterFit: (scale: { width: number }) => {
                scale.width = 56;
              },
              // Chart.js's default linear tick generator starts at `min` (0.5)
              // and steps by 1, landing on 0.5/1.5/2.5… never the integer row
              // numbers our labels key off. Force exactly one tick per student.
              afterBuildTicks: (scale: { ticks: Array<{ value: number }> }) => {
                scale.ticks = sorted.map((_, i) => ({ value: i + 1 }));
              },
              ticks: {
                ...defs.base.scales.y.ticks,
                callback: (v: number | string) => {
                  const row = typeof v === 'number' ? v : parseFloat(v);
                  const s = sorted[Math.round(row) - 1];
                  return s ? s.nick : '';
                },
              },
            },
          },
        }}
      />
      <div className="mono mt-2 flex flex-wrap gap-2 text-[8px] text-ink-3">
        {['CDGL', 'GL', 'IF', 'XV', 'NL', 'SP', 'M'].map((k) => {
          const p = lessonPhase(k);
          return (
            <span key={k} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
          );
        })}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3" style={{ background: '#fca5a5' }} />
          gap &gt;{GAP_DAYS}d
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 border-t border-dashed" style={{ borderColor: '#f59e0b' }} />
          today
        </span>
      </div>
    </ChartCard>
  );
}
