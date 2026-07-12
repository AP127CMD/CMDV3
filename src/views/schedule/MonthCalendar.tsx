// Month layout: density month grid; each day shows status mini-bar + counts.
// Clicking a day opens an in-place detail panel (V2 view-calendar behavior):
// flight summary, AP-127 flights (click → drawer), FI/SP on leave, prev/next
// day paging, and an "Open Day view" jump. Compact/normal density toggle.

import { useMemo, useState } from 'react';
import type { Flight, Leave } from '@/domain/types';
import { Chip, Tag } from '@/components/atoms';
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
  onOpen,
}: {
  flights: readonly Flight[];
  leaves: readonly Leave[];
  date: string;
  matches: (f: Flight) => boolean;
  onPickDay: (d: string) => void;
  onOpen: (f: Flight) => void;
}) {
  const [y, m] = date.split('-').map(Number);
  const [selected, setSelected] = useState<string | null>(null);
  const [density, setDensity] = useState<'normal' | 'compact'>('normal');

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

  // Instructor-name set from the whole dataset — splits leave rows into FI vs
  // SP the same way V2's calendar does.
  const fiNames = useMemo(() => new Set(flights.map((f) => f.instructor).filter(Boolean) as string[]), [flights]);

  const today = bkkToday();
  const max = Math.max(1, ...[...agg.values()].map((a) => a.total));
  const monthDays = cells.filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="mono uc text-[8.5px] text-ink-3">Density</span>
        <Chip active={density === 'normal'} onClick={() => setDensity('normal')}>Normal</Chip>
        <Chip active={density === 'compact'} onClick={() => setDensity('compact')}>Compact</Chip>
        <span className="mono uc ml-auto text-[8px] text-ink-3">click a day for details</span>
      </div>

      <div className="overflow-x-auto scroll-shadow-x">
        <div className={`grid ${density === 'compact' ? 'min-w-[560px]' : 'min-w-[720px]'} grid-cols-7 gap-1`}>
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
                onClick={() => setSelected(iso)}
                className={`${density === 'compact' ? 'min-h-[44px]' : 'min-h-[74px]'} cursor-pointer rounded-md border p-1.5 text-left align-top hover:border-[var(--highlight)]`}
                style={{
                  borderColor: selected === iso ? 'var(--highlight)' : iso === today ? 'var(--highlight)' : iso === date ? 'var(--ink-3)' : 'var(--line)',
                  borderWidth: selected === iso ? 2 : 1,
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
                    {density === 'normal' && (
                      <>
                        <div className="mono mt-1 text-[7.5px] leading-snug text-ink-3">
                          {a.done > 0 && <span style={{ color: 'var(--col-done)' }}>{a.done}✓ </span>}
                          {a.pending > 0 && <span style={{ color: 'var(--col-pending)' }}>{a.pending}… </span>}
                          {a.canceled > 0 && <span style={{ color: 'var(--col-cancel)' }}>{a.canceled}✗ </span>}
                          {a.ap127 > 0 && <span style={{ color: 'var(--highlight)' }}>◆{a.ap127}</span>}
                        </div>
                        {a.leaves > 0 && <div className="mono text-[7px] text-[var(--col-stby)]">{a.leaves} on leave</div>}
                      </>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayDetailPanel
          iso={selected}
          flights={flights}
          leaves={leaves}
          matches={matches}
          fiNames={fiNames}
          monthDays={monthDays}
          onClose={() => setSelected(null)}
          onPage={setSelected}
          onOpenDay={() => onPickDay(selected)}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function DayDetailPanel({
  iso,
  flights,
  leaves,
  matches,
  fiNames,
  monthDays,
  onClose,
  onPage,
  onOpenDay,
  onOpen,
}: {
  iso: string;
  flights: readonly Flight[];
  leaves: readonly Leave[];
  matches: (f: Flight) => boolean;
  fiNames: Set<string>;
  monthDays: string[];
  onClose: () => void;
  onPage: (d: string) => void;
  onOpenDay: () => void;
  onOpen: (f: Flight) => void;
}) {
  const day = useMemo(() => {
    const all = flights.filter((f) => f.date === iso && matches(f));
    const ap127 = all
      .filter((f) => isAP127Batch(f.batch))
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const onLeave = leaves.filter((l) => iso >= l.start && iso <= l.end);
    const fis = onLeave.filter((l) => fiNames.has(l.name));
    const sps = onLeave.filter((l) => !fiNames.has(l.name));
    const done = all.filter((f) => f.status === 'Completed').length;
    const canceled = all.filter((f) => f.status === 'Canceled').length;
    const pending = all.length - done - canceled;
    return { all, ap127, fis, sps, done, canceled, pending };
  }, [iso, flights, leaves, matches, fiNames]);

  const idx = monthDays.indexOf(iso);
  const prev = idx > 0 ? monthDays[idx - 1] : null;
  const next = idx >= 0 && idx < monthDays.length - 1 ? monthDays[idx + 1] : null;
  const fd = fmtDay(iso);

  return (
    <div className="rounded-lg border border-[var(--highlight)] bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="mono text-[12px] font-bold text-ink">
          {fd.wd} {fd.day} {fd.mo} {fd.y}
        </span>
        {isHoliday(iso) && <Tag color="var(--col-cancel)">HOLIDAY</Tag>}
        <div className="ml-auto flex items-center gap-1">
          <Chip onClick={() => prev && onPage(prev)}>‹</Chip>
          <Chip onClick={() => next && onPage(next)}>›</Chip>
          <Chip active onClick={onOpenDay} accent="var(--highlight)">
            Open Day view →
          </Chip>
          <Chip onClick={onClose}>✕</Chip>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Flight summary */}
        <div>
          <div className="mono uc mb-1 text-[8px] text-ink-3">Flight summary</div>
          {!day.all.length ? (
            <div className="mono text-[10px] text-ink-3">no flights match the current filters</div>
          ) : (
            <div className="mono flex flex-col gap-0.5 text-[10px]">
              <span>Total <b className="num text-ink">{day.all.length}</b></span>
              <span style={{ color: 'var(--col-done)' }}>Completed <b className="num">{day.done}</b></span>
              <span style={{ color: 'var(--col-pending)' }}>Pending <b className="num">{day.pending}</b></span>
              <span style={{ color: 'var(--col-cancel)' }}>Canceled <b className="num">{day.canceled}</b></span>
            </div>
          )}
        </div>

        {/* AP-127 flights */}
        <div>
          <div className="mono uc mb-1 text-[8px] text-[var(--highlight)]">◆ AP-127 flights · {day.ap127.length}</div>
          {!day.ap127.length ? (
            <div className="mono text-[10px] text-ink-3">none</div>
          ) : (
            <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
              {day.ap127.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpen(f)}
                  className="mono flex cursor-pointer items-center gap-1.5 rounded border border-line-soft bg-bg px-1.5 py-1 text-left text-[9.5px] hover:border-[var(--highlight)]"
                >
                  <span className="font-bold text-ink">{f.start}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{f.student ?? f.lesson}</span>
                  <span className="text-ink-3">{f.lesson}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Leave */}
        <div className="flex flex-col gap-2">
          <div>
            <div className="mono uc mb-1 text-[8px] text-[var(--col-stby)]">FI on leave · {day.fis.length}</div>
            {!day.fis.length ? (
              <div className="mono text-[10px] text-ink-3">none</div>
            ) : (
              day.fis.map((l, i) => (
                <div key={i} className="mono flex justify-between text-[9.5px] text-ink-2">
                  <span>{l.name}</span>
                  <span className="text-ink-3">{l.reason ?? 'Leave'}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <div className="mono uc mb-1 text-[8px] text-[var(--col-stby)]">SP on leave · {day.sps.length}</div>
            {!day.sps.length ? (
              <div className="mono text-[10px] text-ink-3">none</div>
            ) : (
              day.sps.map((l, i) => (
                <div key={i} className="mono flex justify-between text-[9.5px] text-ink-2">
                  <span>{l.name}</span>
                  <span className="text-ink-3">{l.reason ?? 'Leave'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
