// Month layout: density month grid; each day shows status mini-bar + counts;
// click a day → Day layout. Leave/holiday-aware markers.

import { useMemo } from 'react';
import type { Flight, Leave } from '@/domain/types';
import { bkkToday, fmtDay } from '@/domain/dates';
import { isHoliday } from '@/domain/holidays';
import { isAP127Batch } from '@/domain/batches';

interface DayAgg {
  total: number;
  done: number;
  pending: number;
  canceled: number;
  ap127: number;
  leaves: number;
}

export function MonthCalendar({
  flights,
  leaves,
  date,
  matches,
  onPickDay,
}: {
  flights: readonly Flight[];
  leaves: readonly Leave[];
  date: string;
  matches: (f: Flight) => boolean;
  onPickDay: (d: string) => void;
}) {
  const [y, m] = date.split('-').map(Number);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const startPad = (first.getUTCDay() + 6) % 7;
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: Array<string | null> = Array(startPad).fill(null);
    for (let d = 1; d <= daysIn; d++) out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return out;
  }, [y, m]);

  const agg = useMemo(() => {
    const map = new Map<string, DayAgg>();
    for (const f of flights) {
      if (!f.date.startsWith(`${y}-${String(m).padStart(2, '0')}`)) continue;
      if (!matches(f)) continue;
      const a = map.get(f.date) ?? { total: 0, done: 0, pending: 0, canceled: 0, ap127: 0, leaves: 0 };
      a.total++;
      if (f.status === 'Completed') a.done++;
      else if (f.status === 'Canceled') a.canceled++;
      else a.pending++;
      if (isAP127Batch(f.batch)) a.ap127++;
      map.set(f.date, a);
    }
    for (const l of leaves) {
      for (const [d, a] of map) if (d >= l.start && d <= l.end) a.leaves++;
    }
    return map;
  }, [flights, leaves, y, m, matches]);

  const today = bkkToday();
  const max = Math.max(1, ...[...agg.values()].map((a) => a.total));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 gap-1">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((w) => (
          <div key={w} className="mono uc py-1 text-center text-[8.5px] text-ink-3">
            {w}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const a = agg.get(iso);
          const fd = fmtDay(iso);
          const hol = isHoliday(iso);
          const wkend = fd.wd === 'SAT' || fd.wd === 'SUN';
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDay(iso)}
              className="min-h-[74px] cursor-pointer rounded-md border p-1.5 text-left align-top hover:border-[var(--highlight)]"
              style={{
                borderColor: iso === today ? 'var(--highlight)' : iso === date ? 'var(--ink-3)' : 'var(--line)',
                background: wkend || hol ? 'var(--bg-2)' : 'var(--surface)',
                opacity: a ? 1 : 0.55,
              }}
            >
              <div className="mono flex items-baseline text-[9px]">
                <b style={{ color: iso === today ? 'var(--highlight)' : 'var(--ink-2)' }}>{fd.day}</b>
                {hol && <span className="ml-1 text-[7px] text-[var(--col-cancel)]">HOL</span>}
                <span className="ml-auto text-ink-3">{a?.total || ''}</span>
              </div>
              {a && (
                <>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-bg">
                    <span style={{ width: `${(a.done / max) * 100}%`, background: 'var(--col-done)' }} />
                    <span style={{ width: `${(a.pending / max) * 100}%`, background: 'var(--col-pending)' }} />
                    <span style={{ width: `${(a.canceled / max) * 100}%`, background: 'var(--col-cancel)' }} />
                  </div>
                  <div className="mono mt-1 text-[7.5px] leading-snug text-ink-3">
                    {a.done > 0 && <span style={{ color: 'var(--col-done)' }}>{a.done}✓ </span>}
                    {a.pending > 0 && <span style={{ color: 'var(--col-pending)' }}>{a.pending}… </span>}
                    {a.canceled > 0 && <span style={{ color: 'var(--col-cancel)' }}>{a.canceled}✗ </span>}
                    {a.ap127 > 0 && <span style={{ color: 'var(--highlight)' }}>◆{a.ap127}</span>}
                  </div>
                  {a.leaves > 0 && <div className="mono text-[7px] text-[var(--col-stby)]">{a.leaves} on leave</div>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
