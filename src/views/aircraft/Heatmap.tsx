// Shared heatmap primitive (V2 had three near-copies of this — tails, FIs,
// SPs). Rows × days, cell intensity by hours, sticky first column, click →
// flight list popover → drawer.

import { useState } from 'react';
import type { Flight } from '@/domain/types';
import { fmtDay } from '@/domain/dates';
import { fmtHours } from '@/domain/utilization';

export interface HeatRow {
  key: string;
  label: string;
  sub?: string;
  color?: string;
  maint?: boolean;
  cells: Map<string, { hours: number; flights: Flight[] }>;
  total: number;
}

export function Heatmap({
  rows,
  days,
  onOpen,
}: {
  rows: readonly HeatRow[];
  days: readonly string[];
  onOpen: (f: Flight) => void;
}) {
  const [pop, setPop] = useState<{ row: string; day: string } | null>(null);
  const max = Math.max(0.1, ...rows.flatMap((r) => [...r.cells.values()].map((c) => c.hours)));

  return (
    <div className="overflow-x-auto scroll-shadow-x rounded-lg border border-line">
      <table className="w-full border-collapse" style={{ minWidth: 120 + days.length * 34 }}>
        <thead>
          <tr className="bg-bg-2">
            <th className="mono uc sticky left-0 z-10 border-b border-line bg-bg-2 px-2 py-1 text-left text-[8px] text-ink-3">
              &nbsp;
            </th>
            {days.map((d) => {
              const fd = fmtDay(d);
              return (
                <th key={d} className="mono border-b border-line px-0.5 py-1 text-center text-[7.5px] text-ink-3">
                  {fd.wd[0]}
                  <br />
                  {fd.day}
                </th>
              );
            })}
            <th className="mono uc border-b border-line px-2 py-1 text-right text-[8px] text-ink-3">Σ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line-soft">
              <td className="sticky left-0 z-10 bg-bg px-2 py-0.5 whitespace-nowrap" style={r.color ? { boxShadow: `inset 3px 0 0 ${r.color}` } : undefined}>
                <span className="mono text-[9.5px] font-bold text-ink">{r.label}</span>
                {r.maint && <span className="ml-1 text-[8px]">🔧</span>}
                {r.sub && <span className="mono ml-1 text-[7.5px] text-ink-3">{r.sub}</span>}
              </td>
              {days.map((d) => {
                const c = r.cells.get(d);
                const open = pop?.row === r.key && pop.day === d;
                return (
                  <td key={d} className="relative border-l border-line-soft p-0 text-center">
                    {c && c.hours > 0.01 ? (
                      <button
                        type="button"
                        onClick={() => setPop(open ? null : { row: r.key, day: d })}
                        className="mono h-7 w-full cursor-pointer text-[8px] font-semibold text-ink"
                        style={{ background: `color-mix(in oklab, ${r.color ?? 'var(--col-done)'} ${Math.round(12 + (c.hours / max) * 55)}%, transparent)` }}
                        title={`${d} · ${c.hours.toFixed(1)}h · ${c.flights.length} flights`}
                      >
                        {c.hours >= 0.95 ? c.hours.toFixed(0) : ''}
                      </button>
                    ) : (
                      <div className="h-7" />
                    )}
                    {open && c && (
                      <div className="absolute top-8 left-1/2 z-30 w-52 -translate-x-1/2 rounded-lg border border-line bg-surface p-1.5 text-left shadow-[var(--shadow)]">
                        {c.flights.map((f) => (
                          <button key={f.id} type="button" onClick={() => { setPop(null); onOpen(f); }} className="mono block w-full cursor-pointer rounded px-1.5 py-1 text-left text-[9px] text-ink-2 hover:bg-bg-2">
                            {f.start ?? '—'} · {f.student ?? f.lesson} · {f.lesson ?? ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="mono num px-2 text-right text-[9px] font-bold text-ink">{fmtHours(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
