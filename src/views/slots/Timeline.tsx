// Auto Slot Finder timeline — a tail-by-tail Gantt of the search date: real
// ops flights (busy, from GanttDay's palette) layered with this session's
// reservations (highlighted) and the runway-closure window if set. Read-only
// visualization; reserve/release stays on the SP cards — click a reservation
// here to release it, which is the one action worth wiring straight into the
// timeline (undoing a booking from where you see it collide).

import { useEffect, useMemo, useState } from 'react';
import { Chip } from '@/components/atoms';
import { bkkNowMin, bkkToday, minutesOf } from '@/domain/dates';
import type { Flight } from '@/domain/types';
import type { AutoReservation } from '@/domain/autoslot';

function statusColor(f: Flight): string {
  if (f.isSim) return 'var(--col-sim)';
  if (f.isStandby) return 'var(--col-stby)';
  if (f.status === 'Completed') return 'var(--col-done)';
  if (f.status === 'Canceled') return 'var(--col-cancel)';
  return 'var(--col-pending)';
}

export function SlotTimeline({
  date,
  dayFlights,
  reservations,
  searchStartMin,
  searchEndMin,
  runwayClosed,
  onRelease,
  onOpenFlight,
}: {
  date: string;
  dayFlights: readonly Flight[];
  reservations: readonly AutoReservation[];
  searchStartMin: number;
  searchEndMin: number;
  runwayClosed: { startMin: number; endMin: number } | null;
  onRelease: (studentKey: string) => void;
  onOpenFlight: (f: Flight) => void;
}) {
  const [pxPerHour, setPxPerHour] = useState(56);
  const [nowMin, setNowMin] = useState(() => bkkNowMin());

  useEffect(() => {
    const t = setInterval(() => setNowMin(bkkNowMin()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { rows, startH, endH } = useMemo(() => {
    const keyed = new Map<string, Flight[]>();
    let minM = searchStartMin;
    let maxM = searchEndMin;
    for (const f of dayFlights) {
      const k = f.tail || '—';
      (keyed.get(k) ?? keyed.set(k, []).get(k)!).push(f);
    }
    for (const r of reservations) {
      if (!keyed.has(r.tail)) keyed.set(r.tail, []);
      minM = Math.min(minM, r.startMin);
      maxM = Math.max(maxM, r.startMin + r.durationMin);
    }
    const startH = Math.max(0, Math.floor(minM / 60));
    const endH = Math.min(24, Math.ceil(maxM / 60));
    const rows = [...keyed.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { rows, startH, endH };
  }, [dayFlights, reservations, searchStartMin, searchEndMin]);

  const resByTail = useMemo(() => {
    const m = new Map<string, AutoReservation[]>();
    for (const r of reservations) (m.get(r.tail) ?? m.set(r.tail, []).get(r.tail)!).push(r);
    return m;
  }, [reservations]);

  if (!rows.length) return <div className="mono py-6 text-center text-[10px] text-ink-3">no aircraft to show for this date</div>;

  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  const width = (endH - startH) * pxPerHour;
  const x = (min: number) => ((min - startH * 60) / 60) * pxPerHour;
  const isToday = date === bkkToday();
  const nowX = x(nowMin);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        <span className="mono uc text-[8.5px] text-ink-3">by A/C tail</span>
        <span className="mx-1" />
        <Chip onClick={() => setPxPerHour((v) => Math.max(28, v - 12))}>−</Chip>
        <Chip onClick={() => setPxPerHour(56)}>FIT</Chip>
        <Chip onClick={() => setPxPerHour((v) => Math.min(160, v + 12))}>+</Chip>
        <span className="mono uc ml-auto flex items-center gap-2 text-[8px] text-ink-3">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm border" style={{ borderColor: 'var(--highlight)', background: 'color-mix(in oklab, var(--highlight) 30%, var(--surface))' }} />reserved</span>
          {runwayClosed && <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'color-mix(in oklab, var(--col-cancel) 18%, transparent)' }} />runway closed</span>}
        </span>
      </div>

      <div className="overflow-x-auto scroll-shadow-x rounded-lg border border-line">
        <div style={{ width: width + 92, minWidth: '100%' }}>
          <div className="sticky top-0 z-20 flex border-b border-line bg-bg-2">
            <div className="mono uc sticky left-0 z-10 w-[92px] shrink-0 border-r border-line bg-bg-2 px-2 py-1 text-[8px] text-ink-3">tail</div>
            <div className="relative h-6" style={{ width }}>
              {hours.map((h) => (
                <span key={h} className="mono absolute top-1 text-[8.5px] text-ink-3" style={{ left: x(h * 60) + 2 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map(([tail, fs]) => {
            const resv = resByTail.get(tail) ?? [];
            return (
              <div key={tail} className="flex border-b border-line-soft last:border-0">
                <div className="mono sticky left-0 z-10 flex w-[92px] shrink-0 items-center border-r border-line bg-bg px-2 py-1 text-[9.5px] font-bold whitespace-nowrap text-ink-2">
                  {tail}
                </div>
                <div className="relative h-11" style={{ width }}>
                  {hours.map((h) => (
                    <span key={h} className="absolute inset-y-0 border-l border-line-soft" style={{ left: x(h * 60) }} />
                  ))}
                  {runwayClosed && (
                    <span
                      className="absolute inset-y-0 z-0"
                      style={{ left: x(runwayClosed.startMin), width: Math.max(0, x(runwayClosed.endMin) - x(runwayClosed.startMin)), background: 'color-mix(in oklab, var(--col-cancel) 10%, transparent)' }}
                    />
                  )}
                  {isToday && nowX >= 0 && nowX <= width && (
                    <span className="absolute inset-y-0 z-10 w-px bg-[var(--col-cancel)]" style={{ left: nowX }} />
                  )}
                  {fs.map((f) => {
                    const s = minutesOf(f.start);
                    if (s == null) return null;
                    const durMin = f.durMin ?? 60;
                    const col = statusColor(f);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onOpenFlight(f)}
                        title={`${f.student ?? ''} · ${f.lesson ?? ''} · ${f.start}–${f.end}`}
                        className="absolute top-1.5 bottom-1.5 z-[5] cursor-pointer overflow-hidden rounded border px-1 text-left"
                        style={{
                          left: x(s),
                          width: Math.max(20, (durMin / 60) * pxPerHour - 2),
                          background: `color-mix(in oklab, ${col} 22%, var(--surface))`,
                          borderColor: col,
                          borderStyle: f.isSim ? 'dotted' : 'solid',
                        }}
                      >
                        <span className="mono block truncate text-[8.5px] leading-tight font-bold" style={{ color: col }}>
                          {f.student ?? f.lesson ?? '—'}
                        </span>
                        <span className="mono block truncate text-[7.5px] leading-tight text-ink-3">{f.lesson ?? ''}</span>
                      </button>
                    );
                  })}
                  {resv.map((r) => (
                    <button
                      key={r.studentKey}
                      type="button"
                      onClick={() => onRelease(r.studentKey)}
                      title={`${r.nick} · ${r.studentName} · release`}
                      className="absolute top-1.5 bottom-1.5 z-[6] cursor-pointer overflow-hidden rounded border-2 px-1 text-left"
                      style={{
                        left: x(r.startMin),
                        width: Math.max(20, (r.durationMin / 60) * pxPerHour - 2),
                        borderColor: 'var(--highlight)',
                        background: 'color-mix(in oklab, var(--highlight) 30%, var(--surface))',
                      }}
                    >
                      <span className="mono block truncate text-[8.5px] leading-tight font-bold text-[var(--highlight)]">★ {r.nick}</span>
                      <span className="mono block truncate text-[7.5px] leading-tight text-ink-3">{r.fi}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isToday && (
        <div className="mono uc mt-1 px-1 text-[8px] text-ink-3">
          red line = now ({String(Math.floor(nowMin / 60)).padStart(2, '0')}:{String(nowMin % 60).padStart(2, '0')} BKK) · click a reserved block to release it
        </div>
      )}
    </div>
  );
}
