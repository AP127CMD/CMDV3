// Time Travel: a proper range slider from batch start → today, bidirectional
// with a date input; amber banner while active; keyboard accessible (native
// input[type=range]). asOf lives in the URL (?asOf=), so views are shareable.

import { useMemo } from 'react';
import { bkkToday, dateDiff, addDays, fmtDay } from '@/domain/dates';

export function TimeTravelScrubber({
  asOf,
  batchStart,
  onChange,
}: {
  asOf: string | null;
  batchStart: string;
  onChange: (d: string | null) => void;
}) {
  const today = bkkToday();
  const span = Math.max(1, dateDiff(today, batchStart) ?? 1);
  const pos = asOf ? Math.max(0, Math.min(span, dateDiff(asOf, batchStart) ?? span)) : span;

  const ticks = useMemo(() => {
    const months: Array<{ pct: number; label: string }> = [];
    let cur = batchStart.slice(0, 7);
    for (let i = 0; i <= span; i += 1) {
      const d = addDays(batchStart, i);
      if (d.slice(0, 7) !== cur) {
        cur = d.slice(0, 7);
        months.push({ pct: (i / span) * 100, label: fmtDay(d).mo });
      }
    }
    return months;
  }, [batchStart, span]);

  const active = asOf != null && asOf !== today;

  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: active ? 'var(--col-pending)' : 'var(--line)',
        background: active ? 'var(--col-pending-bg)' : 'var(--surface)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono uc text-[9px] font-bold" style={{ color: active ? 'var(--col-pending)' : 'var(--ink-3)' }}>
          {active ? `⏪ Time travel — viewing as of ${asOf}` : 'Time travel'}
        </span>
        <input
          type="date"
          value={asOf ?? today}
          min={batchStart}
          max={today}
          onChange={(e) => onChange(e.target.value === today ? null : e.target.value)}
          className="mono rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] text-ink"
        />
        {active && (
          <button type="button" onClick={() => onChange(null)} className="mono uc cursor-pointer rounded border border-line bg-bg px-2 py-0.5 text-[9px] font-bold text-ink-2 hover:text-ink">
            ← Back to live
          </button>
        )}
      </div>
      <div className="relative mt-1.5">
        <input
          type="range"
          min={0}
          max={span}
          value={pos}
          onChange={(e) => {
            const v = +e.target.value;
            onChange(v >= span ? null : addDays(batchStart, v));
          }}
          className="w-full accent-[var(--highlight)]"
          aria-label="View data as of date"
        />
        <div className="relative h-3">
          {ticks.map((t, i) => (
            <span key={i} className="mono absolute text-[7px] text-ink-3" style={{ left: `${t.pct}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
