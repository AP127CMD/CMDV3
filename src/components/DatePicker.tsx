// Calendar popup date picker: month grid, only dates present in `dateSet`
// selectable, today + selected markers, TODAY shortcut (V2 DateCalendarPopup).

import { useEffect, useRef, useState } from 'react';
import { bkkToday, fmtDay } from '@/domain/dates';

function monthDays(y: number, m: number): Array<string | null> {
  const first = new Date(Date.UTC(y, m, 1));
  const startPad = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array(startPad).fill(null);
  for (let d = 1; d <= daysIn; d++) {
    cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function DatePicker({
  value,
  onChange,
  dateSet,
}: {
  value: string;
  onChange: (d: string) => void;
  dateSet: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState<[number, number]>(() => {
    const [y, m] = value.split('-').map(Number);
    return [y, m - 1];
  });
  const box = useRef<HTMLDivElement>(null);
  const today = bkkToday();
  const set = new Set(dateSet);

  useEffect(() => {
    const [y, m] = value.split('-').map(Number);
    setYm([y, m - 1]);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const d = fmtDay(value);
  const nav = (delta: number) => {
    setYm(([y, m]) => {
      const n = new Date(Date.UTC(y, m + delta, 1));
      return [n.getUTCFullYear(), n.getUTCMonth()];
    });
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[11px] font-bold text-ink hover:border-[var(--highlight)]"
      >
        <span className="text-ink-3">{d.wd}</span> {d.day} {d.mo}
        <span className="text-[8px] text-ink-3">▾</span>
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 w-60 rounded-lg border border-line bg-surface p-2.5 shadow-[var(--shadow)]">
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={() => nav(-1)} className="mono h-6 w-6 cursor-pointer rounded border border-line text-[10px] text-ink-2">
              ‹
            </button>
            <div className="mono uc text-[10px] font-bold text-ink">
              {MONTH_NAMES[ym[1]]} {ym[0]}
            </div>
            <button type="button" onClick={() => nav(1)} className="mono h-6 w-6 cursor-pointer rounded border border-line text-[10px] text-ink-2">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
              <div key={i} className="mono py-0.5 text-center text-[8px] text-ink-3">
                {w}
              </div>
            ))}
            {monthDays(ym[0], ym[1]).map((iso, i) =>
              iso == null ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={!set.has(iso)}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className="mono h-7 cursor-pointer rounded text-[10px] disabled:cursor-default disabled:opacity-20"
                  style={{
                    color: iso === value ? 'var(--bg)' : iso === today ? 'var(--highlight)' : 'var(--ink-2)',
                    background: iso === value ? 'var(--highlight)' : 'transparent',
                    border: iso === today && iso !== value ? '1px solid var(--highlight)' : '1px solid transparent',
                    fontWeight: iso === value || iso === today ? 700 : 400,
                  }}
                >
                  {+iso.slice(8)}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            disabled={!set.has(today)}
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
            className="mono uc mt-2 w-full cursor-pointer rounded border border-line py-1 text-[9px] font-bold text-ink-2 hover:border-[var(--highlight)] hover:text-[var(--highlight)] disabled:opacity-30"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
