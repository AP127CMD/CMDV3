// Week layout: Mon–Sun columns of compact flight cards around the selected
// date; today marked; day header click jumps to Day layout.

import { useMemo } from 'react';
import type { Flight } from '@/domain/types';
import { batchColorVar, isAP127Batch } from '@/domain/batches';
import { addDays, bkkToday, fmtDay, weekdayOf } from '@/domain/dates';

function statusColor(f: Flight): string {
  if (f.isSim) return 'var(--col-sim)';
  if (f.isStandby) return 'var(--col-stby)';
  if (f.status === 'Completed') return 'var(--col-done)';
  if (f.status === 'Canceled') return 'var(--col-cancel)';
  return 'var(--col-pending)';
}

export function WeekGrid({
  flights,
  date,
  matches,
  hl127,
  onOpen,
  onPickDay,
}: {
  flights: readonly Flight[];
  date: string;
  matches: (f: Flight) => boolean;
  hl127: boolean;
  onOpen: (f: Flight) => void;
  onPickDay: (d: string) => void;
}) {
  const days = useMemo(() => {
    const wd = (weekdayOf(date) + 6) % 7; // 0 = Monday
    const mon = addDays(date, -wd);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [date]);

  const byDay = useMemo(() => {
    const m = new Map<string, Flight[]>();
    for (const d of days) m.set(d, []);
    for (const f of flights) {
      if (m.has(f.date) && matches(f)) m.get(f.date)!.push(f);
    }
    for (const list of m.values()) list.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    return m;
  }, [flights, days, matches]);

  const today = bkkToday();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-1.5">
        {days.map((d) => {
          const fd = fmtDay(d);
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          return (
            <div key={d} className="min-w-0 rounded-lg border bg-surface" style={{ borderColor: isToday ? 'var(--highlight)' : 'var(--line)' }}>
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className="mono uc flex w-full cursor-pointer items-baseline gap-1 border-b border-line bg-bg-2 px-2 py-1.5 text-[9px] hover:text-[var(--highlight)]"
                style={{ color: isToday ? 'var(--highlight)' : d === date ? 'var(--ink)' : 'var(--ink-3)' }}
              >
                <b>{fd.wd}</b> {fd.day} {fd.mo}
                <span className="ml-auto">{list.length || ''}</span>
              </button>
              <div className="flex max-h-[62vh] flex-col gap-1 overflow-y-auto p-1.5">
                {list.length === 0 && <div className="mono py-3 text-center text-[8px] text-ink-3">—</div>}
                {list.map((f) => {
                  const ap = isAP127Batch(f.batch);
                  const col = statusColor(f);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onOpen(f)}
                      className="cursor-pointer rounded border border-line-soft bg-bg px-1.5 py-1 text-left hover:border-[var(--highlight)]"
                      style={{
                        opacity: hl127 && !ap ? 0.28 : 1,
                        boxShadow: ap ? 'inset 2px 0 0 var(--highlight)' : `inset 2px 0 0 ${col}`,
                      }}
                    >
                      <div className="mono flex justify-between text-[8.5px] text-ink-3">
                        <span>{f.start ?? '—'}</span>
                        <span style={{ color: col }}>{f.isSim ? 'SIM' : f.status === 'Completed' ? '✓' : f.status === 'Canceled' ? '✗' : '…'}</span>
                      </div>
                      <div className="truncate text-[10px] font-semibold text-ink">{f.student ?? '—'}</div>
                      <div className="mono flex justify-between truncate text-[8.5px] text-ink-2">
                        <span>{f.lesson ?? ''}</span>
                        <span style={{ color: batchColorVar(f.batch) }}>{f.batchKey}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
