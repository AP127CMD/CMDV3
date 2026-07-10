// Shared schedule header: date nav (keyboard ←/→ too), layout switcher,
// search, filter sheet trigger, AP-127 focus toggles. All state → URL.
// On mobile the filters open as a full-screen sheet (information parity).

import { useEffect, useMemo, useState } from 'react';
import { Chip } from '@/components/atoms';
import { DatePicker } from '@/components/DatePicker';
import { addDays, bkkToday } from '@/domain/dates';
import { batchColorVar } from '@/domain/batches';
import type { Flight } from '@/domain/types';
import { LAYOUTS, type ScheduleLayout, type ScheduleState } from './useScheduleState';

const LAYOUT_LABEL: Record<ScheduleLayout, string> = {
  day: 'Day',
  gantt: 'Gantt',
  week: 'Week',
  month: 'Month',
  roster: 'Roster',
};

export function ScheduleHeader({
  state,
  patch,
  flights,
  allDates,
  activeFilterCount,
  showDate = true,
}: {
  state: ScheduleState;
  patch: (p: Partial<ScheduleState>) => void;
  flights: readonly Flight[];
  allDates: readonly string[];
  activeFilterCount: number;
  showDate?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keyboard ←/→ day navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') patch({ date: addDays(state.date, -1) });
      if (e.key === 'ArrowRight') patch({ date: addDays(state.date, 1) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.date, patch]);

  const options = useMemo(() => {
    const batches = new Map<string, string>();
    const fis = new Set<string>();
    const tails = new Set<string>();
    for (const f of flights) {
      if (f.batchKey && f.batch) batches.set(f.batchKey, f.batch);
      if (f.instructor) fis.add(f.instructor);
      if (f.tail) tails.add(f.tail);
    }
    return {
      batches: [...batches.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      fis: [...fis].sort(),
      tails: [...tails].sort(),
    };
  }, [flights]);

  const toggleIn = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        {showDate && (
          <>
            <button type="button" className="mono min-h-[30px] w-7 cursor-pointer rounded-md border border-line text-[11px] text-ink-2" onClick={() => patch({ date: addDays(state.date, -1) })} title="Previous day (←)">
              ‹
            </button>
            <DatePicker value={state.date} onChange={(d) => patch({ date: d })} dateSet={allDates} />
            <button type="button" className="mono min-h-[30px] w-7 cursor-pointer rounded-md border border-line text-[11px] text-ink-2" onClick={() => patch({ date: addDays(state.date, 1) })} title="Next day (→)">
              ›
            </button>
            <Chip active={state.date === bkkToday()} onClick={() => patch({ date: bkkToday() })}>
              Today
            </Chip>
          </>
        )}

        <div className="mx-1 flex overflow-hidden rounded-md border border-line">
          {LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => patch({ layout: l })}
              className="mono uc min-h-[30px] cursor-pointer px-2.5 text-[9.5px] font-bold"
              style={{
                background: state.layout === l ? 'var(--highlight-bg)' : 'var(--surface)',
                color: state.layout === l ? 'var(--highlight)' : 'var(--ink-3)',
              }}
            >
              {LAYOUT_LABEL[l]}
            </button>
          ))}
        </div>

        <input
          value={state.q}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="Search SP / FI / lesson / tail…"
          className="mono order-last min-h-[30px] basis-full rounded-md border border-line bg-surface px-2 text-[10.5px] text-ink outline-none placeholder:text-ink-3 focus:border-[var(--highlight)] sm:order-none sm:w-52 sm:basis-auto"
        />

        <Chip active={state.hl127} onClick={() => patch({ hl127: !state.hl127 })} title="Highlight AP-127 (dim others)">
          ◆ 127
        </Chip>
        <Chip active={state.only127} onClick={() => patch({ only127: !state.only127 })} title="AP-127 only">
          ONLY
        </Chip>
        <Chip active={activeFilterCount > 0 || sheetOpen} onClick={() => setSheetOpen(true)}>
          FILTER{activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </Chip>
      </div>

      {/* Filter sheet — full-screen on mobile, floating panel on desktop */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl border border-line bg-bg p-4 md:absolute md:inset-x-auto md:top-14 md:right-3 md:bottom-auto md:w-[520px] md:rounded-lg">
            <div className="mb-2 flex items-center">
              <div className="mono uc text-[10px] font-bold text-ink">Filters</div>
              <button
                type="button"
                className="mono uc ml-auto cursor-pointer text-[9px] text-ink-3 hover:text-ink"
                onClick={() =>
                  patch({ batches: [], fis: [], tails: [], statuses: [], q: '', showSim: true, showStandby: true, showCanceled: true, only127: false })
                }
              >
                CLEAR ALL
              </button>
              <button type="button" className="mono ml-3 h-7 w-7 cursor-pointer rounded border border-line text-ink-2" onClick={() => setSheetOpen(false)}>
                ✕
              </button>
            </div>

            <div className="mono uc mt-2 mb-1 text-[8.5px] text-ink-3">Types</div>
            <div className="flex flex-wrap gap-1">
              <Chip active={state.showSim} onClick={() => patch({ showSim: !state.showSim })}>SIM</Chip>
              <Chip active={state.showStandby} onClick={() => patch({ showStandby: !state.showStandby })}>STBY</Chip>
              <Chip active={state.showCanceled} onClick={() => patch({ showCanceled: !state.showCanceled })}>CANCELED</Chip>
            </div>

            <div className="mono uc mt-3 mb-1 text-[8.5px] text-ink-3">Status</div>
            <div className="flex flex-wrap gap-1">
              {['Pending', 'Completed', 'Canceled'].map((s) => (
                <Chip key={s} active={state.statuses.includes(s)} onClick={() => patch({ statuses: toggleIn(state.statuses, s) })}>
                  {s}
                </Chip>
              ))}
            </div>

            <div className="mono uc mt-3 mb-1 text-[8.5px] text-ink-3">
              Batch {state.batches.length > 0 && `· ${state.batches.length}`}
            </div>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {options.batches.map(([key, label]) => (
                <Chip key={key} active={state.batches.includes(key)} onClick={() => patch({ batches: toggleIn(state.batches, key) })} accent={batchColorVar(label)}>
                  {label}
                </Chip>
              ))}
            </div>

            <div className="mono uc mt-3 mb-1 text-[8.5px] text-ink-3">
              Instructor {state.fis.length > 0 && `· ${state.fis.length}`}
            </div>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {options.fis.map((fi) => (
                <Chip key={fi} active={state.fis.includes(fi)} onClick={() => patch({ fis: toggleIn(state.fis, fi) })}>
                  {fi}
                </Chip>
              ))}
            </div>

            <div className="mono uc mt-3 mb-1 text-[8.5px] text-ink-3">
              Tail {state.tails.length > 0 && `· ${state.tails.length}`}
            </div>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {options.tails.map((t) => (
                <Chip key={t} active={state.tails.includes(t)} onClick={() => patch({ tails: toggleIn(state.tails, t) })}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
