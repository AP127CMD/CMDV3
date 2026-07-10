// Gantt layout: rows grouped by tail / instructor / batch, bars positioned by
// start/duration, live Bangkok NOW-line on today, timeline trimmed to the
// actual day span (V2 p88/p109 behaviors). Horizontal scroll with sticky row
// labels — works at 375px.

import { useEffect, useMemo, useState } from 'react';
import type { Flight } from '@/domain/types';
import { Chip, EmptyState } from '@/components/atoms';
import { batchColorVar, isAP127Batch } from '@/domain/batches';
import { bkkNowMin, bkkToday, minutesOf } from '@/domain/dates';

type GroupBy = 'tail' | 'instructor' | 'batch';

function statusColor(f: Flight): string {
  if (f.isSim) return 'var(--col-sim)';
  if (f.isStandby) return 'var(--col-stby)';
  if (f.status === 'Completed') return 'var(--col-done)';
  if (f.status === 'Canceled') return 'var(--col-cancel)';
  return 'var(--col-pending)';
}

const isSolo = (f: Flight) => /solo/i.test(f.cond ?? '') || /\bsolo\b/i.test(f.lesson ?? '');

export function GanttDay({
  flights,
  date,
  hl127,
  onOpen,
}: {
  flights: readonly Flight[];
  date: string;
  hl127: boolean;
  onOpen: (f: Flight) => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('tail');
  const [pxPerHour, setPxPerHour] = useState(64);
  const [nowMin, setNowMin] = useState(() => bkkNowMin());

  useEffect(() => {
    const t = setInterval(() => setNowMin(bkkNowMin()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { rows, startH, endH } = useMemo(() => {
    const keyed = new Map<string, Flight[]>();
    let minM = 6 * 60;
    let maxM = 18 * 60;
    for (const f of flights) {
      const k = (groupBy === 'tail' ? f.tail : groupBy === 'instructor' ? f.instructor : f.batch) ?? '—';
      (keyed.get(k) ?? keyed.set(k, []).get(k)!).push(f);
      const s = minutesOf(f.start);
      const e = minutesOf(f.end);
      if (s != null) minM = Math.min(minM, s);
      if (e != null) maxM = Math.max(maxM, e ?? s ?? 0);
    }
    const startH = Math.max(0, Math.floor(minM / 60));
    const endH = Math.min(24, Math.ceil(maxM / 60));
    const rows = [...keyed.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { rows, startH, endH };
  }, [flights, groupBy]);

  if (!flights.length) return <EmptyState title="No flights match" hint="Loosen the filters or pick another date." />;

  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  const width = (endH - startH) * pxPerHour;
  const x = (min: number) => ((min - startH * 60) / 60) * pxPerHour;
  const isToday = date === bkkToday();
  const nowX = x(nowMin);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        <span className="mono uc text-[8.5px] text-ink-3">Group by</span>
        {(['tail', 'instructor', 'batch'] as GroupBy[]).map((g) => (
          <Chip key={g} active={groupBy === g} onClick={() => setGroupBy(g)}>
            {g === 'tail' ? 'A/C' : g}
          </Chip>
        ))}
        <span className="mx-1" />
        <Chip onClick={() => setPxPerHour((v) => Math.max(28, v - 12))}>−</Chip>
        <Chip onClick={() => setPxPerHour(64)}>FIT</Chip>
        <Chip onClick={() => setPxPerHour((v) => Math.min(160, v + 12))}>+</Chip>
      </div>

      <div className="overflow-x-auto scroll-shadow-x rounded-lg border border-line">
        <div style={{ width: width + 92, minWidth: '100%' }}>
          {/* hour axis */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-bg-2">
            <div className="mono uc sticky left-0 z-10 w-[92px] shrink-0 border-r border-line bg-bg-2 px-2 py-1 text-[8px] text-ink-3">
              {groupBy}
            </div>
            <div className="relative h-6" style={{ width }}>
              {hours.map((h) => (
                <span key={h} className="mono absolute top-1 text-[8.5px] text-ink-3" style={{ left: x(h * 60) + 2 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map(([label, fs]) => (
            <div key={label} className="flex border-b border-line-soft last:border-0">
              <div
                className="mono sticky left-0 z-10 flex w-[92px] shrink-0 items-center border-r border-line bg-bg px-2 py-1 text-[9.5px] font-bold whitespace-nowrap text-ink-2"
                style={groupBy === 'batch' ? { color: batchColorVar(label) } : undefined}
              >
                {label}
              </div>
              <div className="relative h-11" style={{ width }}>
                {hours.map((h) => (
                  <span key={h} className="absolute inset-y-0 border-l border-line-soft" style={{ left: x(h * 60) }} />
                ))}
                {isToday && nowX >= 0 && nowX <= width && (
                  <span className="absolute inset-y-0 z-10 w-px bg-[var(--col-cancel)]" style={{ left: nowX }} />
                )}
                {fs.map((f) => {
                  const s = minutesOf(f.start);
                  if (s == null) return null;
                  const durMin = f.durMin ?? 60;
                  const ap = isAP127Batch(f.batch);
                  const col = isSolo(f) && !f.isSim ? 'var(--col-solo)' : statusColor(f);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onOpen(f)}
                      title={`${f.student ?? ''} · ${f.lesson ?? ''} · ${f.start}–${f.end}`}
                      className="absolute top-1.5 bottom-1.5 z-[5] cursor-pointer overflow-hidden rounded border px-1 text-left"
                      style={{
                        left: x(s),
                        width: Math.max(20, (durMin / 60) * pxPerHour - 2),
                        background: `color-mix(in oklab, ${col} 22%, var(--surface))`,
                        borderColor: col,
                        borderStyle: f.isSim ? 'dotted' : 'solid',
                        opacity: hl127 && !ap ? 0.25 : 1,
                        boxShadow: ap ? 'inset 2px 0 0 var(--highlight)' : undefined,
                      }}
                    >
                      <span className="mono block truncate text-[8.5px] leading-tight font-bold" style={{ color: col }}>
                        {f.student ?? f.lesson ?? '—'}
                      </span>
                      <span className="mono block truncate text-[7.5px] leading-tight text-ink-3">
                        {(f.batchKey ?? '').replace('AP', 'AP')} {f.tail?.replace('HS-', '') ?? ''} {f.lesson ?? ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isToday && (
        <div className="mono uc mt-1 px-1 text-[8px] text-ink-3">
          red line = now ({String(Math.floor(nowMin / 60)).padStart(2, '0')}:{String(nowMin % 60).padStart(2, '0')} BKK)
        </div>
      )}
    </div>
  );
}
