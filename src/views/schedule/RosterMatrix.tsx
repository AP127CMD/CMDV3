// Roster layout: person × date workload heatmap (V2 view-roster), rows are
// students or instructors, columns the 14 days ending at the selected date.
// Cell click opens a popover of that person-day's flights → drawer.

import { useMemo, useState } from 'react';
import type { Flight, Leave } from '@/domain/types';
import { Chip, EmptyState } from '@/components/atoms';
import { addDays, bkkToday, fmtDay } from '@/domain/dates';
import { isAP127Batch } from '@/domain/batches';

type Who = 'student' | 'instructor';

interface Cell {
  flights: Flight[];
  hours: number;
  ap127: boolean;
}

export function RosterMatrix({
  flights,
  leaves,
  date,
  matches,
  hl127,
  onOpen,
}: {
  flights: readonly Flight[];
  leaves: readonly Leave[];
  date: string;
  matches: (f: Flight) => boolean;
  hl127: boolean;
  onOpen: (f: Flight) => void;
}) {
  const [who, setWho] = useState<Who>('student');
  const [pop, setPop] = useState<{ key: string; day: string } | null>(null);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)), [date]);

  const { rows, totals } = useMemo(() => {
    const map = new Map<string, Map<string, Cell>>();
    const totals = new Map<string, number>();
    const daySet = new Set(days);
    for (const f of flights) {
      if (!daySet.has(f.date) || !matches(f)) continue;
      const key = (who === 'student' ? f.student : f.instructor) ?? '—';
      if (key === '—') continue;
      const row = map.get(key) ?? map.set(key, new Map()).get(key)!;
      const cell = row.get(f.date) ?? row.set(f.date, { flights: [], hours: 0, ap127: false }).get(f.date)!;
      cell.flights.push(f);
      cell.hours += (f.durMin ?? 0) / 60;
      if (isAP127Batch(f.batch)) cell.ap127 = true;
      totals.set(f.date, (totals.get(f.date) ?? 0) + 1);
    }
    const rows = [...map.entries()].sort(
      (a, b) =>
        [...b[1].values()].reduce((x, c) => x + c.flights.length, 0) -
        [...a[1].values()].reduce((x, c) => x + c.flights.length, 0),
    );
    return { rows, totals };
  }, [flights, days, matches, who]);

  const leavesFor = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of leaves) {
      for (const d of days) {
        if (d >= l.start && d <= l.end) (m.get(l.name) ?? m.set(l.name, new Set()).get(l.name)!).add(d);
      }
    }
    return m;
  }, [leaves, days]);

  if (!rows.length) return <EmptyState title="No flights in the last 14 days match" />;

  const heat = (n: number) =>
    n === 0 ? 'transparent' : n === 1 ? 'color-mix(in oklab, var(--col-done) 18%, transparent)' : n === 2 ? 'color-mix(in oklab, var(--col-pending) 26%, transparent)' : 'color-mix(in oklab, var(--col-cancel) 30%, transparent)';

  const today = bkkToday();

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="mono uc text-[8.5px] text-ink-3">Rows</span>
        <Chip active={who === 'student'} onClick={() => setWho('student')}>SP</Chip>
        <Chip active={who === 'instructor'} onClick={() => setWho('instructor')}>FI</Chip>
        <span className="mono uc ml-auto text-[8px] text-ink-3">last 14 days → {date}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-bg-2">
              <th className="mono uc sticky left-0 z-10 border-b border-line bg-bg-2 px-2 py-1 text-left text-[8px] text-ink-3">
                {who === 'student' ? 'Student' : 'Instructor'}
              </th>
              {days.map((d) => {
                const fd = fmtDay(d);
                return (
                  <th key={d} className="mono border-b border-line px-0.5 py-1 text-center text-[7.5px]" style={{ color: d === today ? 'var(--highlight)' : 'var(--ink-3)' }}>
                    {fd.wd[0]}
                    <br />
                    {fd.day}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="mono bg-bg-2/60 text-[8.5px] font-bold text-ink-2">
              <td className="sticky left-0 z-10 border-b border-line bg-bg-2 px-2 py-1">DAILY TOTAL</td>
              {days.map((d) => (
                <td key={d} className="border-b border-line text-center">
                  {totals.get(d) ?? ''}
                </td>
              ))}
            </tr>
            {rows.map(([name, cells]) => {
              const rowAp = [...cells.values()].some((c) => c.ap127);
              return (
                <tr key={name} className="border-b border-line-soft" style={{ opacity: hl127 && !rowAp ? 0.3 : 1 }}>
                  <td className="sticky left-0 z-10 bg-bg px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-ink" style={rowAp ? { boxShadow: 'inset 3px 0 0 var(--highlight)' } : undefined}>
                    {name}
                    {leavesFor.get(name)?.has(today) && (
                      <span className="mono ml-1 text-[7px] text-[var(--col-stby)]">LEAVE</span>
                    )}
                  </td>
                  {days.map((d) => {
                    const c = cells.get(d);
                    const onLeave = leavesFor.get(name)?.has(d);
                    const open = pop?.key === name && pop.day === d;
                    return (
                      <td key={d} className="relative border-l border-line-soft p-0 text-center">
                        {c ? (
                          <button
                            type="button"
                            onClick={() => setPop(open ? null : { key: name, day: d })}
                            className="mono h-8 w-full cursor-pointer text-[9px] font-bold text-ink"
                            style={{ background: heat(c.flights.length) }}
                            title={`${c.flights.length} flights · ${c.hours.toFixed(1)}h block`}
                          >
                            {c.flights.length}
                          </button>
                        ) : (
                          <div className="h-8" style={{ background: onLeave ? 'color-mix(in oklab, var(--col-stby) 14%, transparent)' : undefined }}>
                            {onLeave && <span className="mono text-[7px] text-[var(--col-stby)]">L</span>}
                          </div>
                        )}
                        {open && c && (
                          <div className="absolute top-9 left-1/2 z-30 w-48 -translate-x-1/2 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow)]">
                            {c.flights.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => {
                                  setPop(null);
                                  onOpen(f);
                                }}
                                className="mono block w-full cursor-pointer rounded px-1.5 py-1 text-left text-[9px] text-ink-2 hover:bg-bg-2"
                              >
                                {f.start ?? '—'} · {f.lesson ?? '—'} · {who === 'student' ? f.instructor : f.student}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
