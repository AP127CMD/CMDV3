// Pace Monitor: range-selected actual vs needed pace (batch + per-student),
// plus an ETC (estimated time to completion) box (V2 renderAP127Pace).

import { useMemo, useState } from 'react';
import { Chip } from '@/components/atoms';
import { SourceInfo } from '@/components/SourceInfo';
import { etcProjection, paceMonitor } from '@/domain/pace';
import type { CurriculumRow, Student } from '@/domain/types';

const RANGES: Array<{ v: number; label: string }> = [
  { v: 7, label: '7d' },
  { v: 14, label: '14d' },
  { v: 30, label: '30d' },
  { v: 60, label: '60d' },
  { v: 0, label: 'All time' },
];

function fmtH(h: number): string {
  return `${h.toFixed(h >= 10 ? 0 : 1)}h`;
}
function fmtL(l: number): string {
  return `${l.toFixed(l >= 10 ? 0 : 1)} les`;
}
function fmtGap(g: number | null, unit: 'h' | 'l'): { text: string; color: string } {
  if (g == null) return { text: '—', color: 'var(--ink-3)' };
  const text = `${g >= 0 ? '+' : ''}${unit === 'h' ? g.toFixed(1) + 'h' : Math.round(g) + ' les'}`;
  return { text, color: g >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' };
}

export function PaceMonitor({
  students,
  curriculum,
  curMap,
  today,
  batchStart,
}: {
  students: readonly Student[];
  curriculum: readonly CurriculumRow[];
  curMap: Record<string, number>;
  today: string;
  batchStart: string;
}) {
  const [range, setRange] = useState(30);
  const n = students.length || 1;

  const pm = useMemo(
    () => paceMonitor(students, curriculum, curMap, today, range, batchStart),
    [students, curriculum, curMap, today, range, batchStart],
  );
  const etc = useMemo(
    () => etcProjection(students, curriculum, curMap, today, batchStart),
    [students, curriculum, curMap, today, batchStart],
  );

  const rangeLabel =
    range === 0 ? `all time · ${pm.rangeStart} → ${today}` : `last ${pm.rangeDays}d · ${pm.rangeStart} → ${today}`;

  const gapH = fmtGap(pm.gapHrsPerDay, 'h');
  const gapL = fmtGap(pm.gapLessonsPerDay, 'l');

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-2 px-3 py-2">
        <div className="mono uc text-[10px] font-semibold text-ink">Pace monitor</div>
        <SourceInfo
          refSpec={{
            sources: ['progress'],
            basis: rangeLabel,
            method: 'Needed pace = remaining batch hours/lessons ÷ days to curriculum plan end.',
          }}
        />
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <Chip key={r.v} active={range === r.v} onClick={() => setRange(r.v)}>
              {r.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        {/* Batch / per-student pace table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] border-collapse text-[10.5px]">
            <thead>
              <tr className="mono uc text-[8px] text-ink-3">
                <th className="py-1 text-left">28 SP batch</th>
                <th className="text-right">/ day</th>
                <th className="text-right">/ week</th>
                <th className="text-right">/ month</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-soft">
                <td className="py-1 text-ink-2">Actual</td>
                <td className="mono num text-right">
                  {fmtH(pm.actHrs / pm.rangeDays)} <span className="text-ink-3">· {fmtL(pm.actLessons / pm.rangeDays)}</span>
                </td>
                <td className="mono num text-right">{fmtH((pm.actHrs / pm.rangeDays) * 7)}</td>
                <td className="mono num text-right">{fmtH((pm.actHrs / pm.rangeDays) * 30)}</td>
              </tr>
              <tr>
                <td className="py-1 text-ink-2">Need</td>
                <td className="mono num text-right">
                  {pm.neededHrsPerDay != null ? (
                    <>
                      {fmtH(pm.neededHrsPerDay)} <span className="text-ink-3">· {fmtL(pm.neededLessonsPerDay ?? 0)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="mono num text-right">{pm.neededHrsPerDay != null ? fmtH(pm.neededHrsPerDay * 7) : '—'}</td>
                <td className="mono num text-right">{pm.neededHrsPerDay != null ? fmtH(pm.neededHrsPerDay * 30) : '—'}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-1 text-ink-2">Gap</td>
                <td className="mono num text-right" style={{ color: gapH.color }}>
                  {gapH.text} <span className="font-normal opacity-80">· {gapL.text}</span>
                </td>
                <td className="mono num text-right" style={{ color: gapH.color }}>
                  {pm.gapHrsPerDay != null ? `${pm.gapHrsPerDay >= 0 ? '+' : ''}${(pm.gapHrsPerDay * 7).toFixed(1)}h` : '—'}
                </td>
                <td className="mono num text-right" style={{ color: gapH.color }}>
                  {pm.gapHrsPerDay != null ? `${pm.gapHrsPerDay >= 0 ? '+' : ''}${(pm.gapHrsPerDay * 30).toFixed(0)}h` : '—'}
                </td>
              </tr>
              <tr className="border-t border-line-soft text-ink-3">
                <td className="py-1" colSpan={4}>
                  1 SP avg: {fmtH(pm.actHrs / pm.rangeDays / n)}/day actual ·{' '}
                  {pm.neededHrsPerDay != null ? fmtH(pm.neededHrsPerDay / n) : '—'}/day needed
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ETC box */}
        <div className="rounded-md border border-line-soft bg-bg p-2.5">
          <div className="mono uc mb-1.5 text-[8.5px] text-ink-3">Estimated time to completion (all-time pace)</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <MiniKpi label="Plan end" value={etc.planEnd ?? '—'} />
            <MiniKpi
              label="Cohort ETC"
              value={etc.cohortEtc ?? '—'}
              color={etc.cohortEtc && etc.planEnd && etc.cohortEtc <= etc.planEnd ? 'var(--col-done)' : 'var(--col-cancel)'}
            />
            <MiniKpi label="On track" value={etc.onTrack} color="var(--col-done)" />
            <MiniKpi label="At risk" value={etc.atRisk} sub={etc.avgDelayDays != null ? `avg +${etc.avgDelayDays.toFixed(0)}d` : undefined} color="var(--col-cancel)" />
          </div>
          <div
            className="rounded px-2 py-1.5 text-[10.5px] font-semibold"
            style={{
              color: gapL.color,
              background: `color-mix(in oklab, ${gapL.color} 12%, transparent)`,
            }}
          >
            {pm.gapHrsPerDay == null
              ? 'Plan end date unavailable — cannot compute pace gap.'
              : pm.gapHrsPerDay >= 0
                ? `Batch is ${gapH.text}/day (${gapL.text}/day) per SP ahead of the pace needed to finish on plan.`
                : `${gapH.text.replace('-', '')} / ${gapL.text.replace('-', '')} more per day needed to finish on plan.`}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, sub, color = 'var(--ink)' }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded border border-line-soft bg-surface px-2 py-1">
      <div className="mono uc text-[7.5px] text-ink-3">{label}</div>
      <div className="mono num text-[12px] font-bold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mono text-[7.5px] text-ink-3">{sub}</div>}
    </div>
  );
}
