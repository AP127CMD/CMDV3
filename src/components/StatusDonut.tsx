// Inline-SVG status-mix donut (V2's Day Glance donut) — no chart library, so
// it's cheap and theme-reactive via CSS vars. Segments are mutually exclusive
// (each flight counted once) following STATUS_COLOR precedence.

import type { DayMix } from '@/domain/kpis';

const SEGMENTS: Array<{ key: keyof DayMix; label: string; color: string }> = [
  { key: 'completed', label: 'Completed', color: 'var(--col-done)' },
  { key: 'pending', label: 'Pending', color: 'var(--col-pending)' },
  { key: 'canceled', label: 'Canceled', color: 'var(--col-cancel)' },
  { key: 'sim', label: 'SIM', color: 'var(--col-sim)' },
  { key: 'standby', label: 'Standby', color: 'var(--col-stby)' },
];

export function StatusDonut({ mix }: { mix: DayMix }) {
  const total = SEGMENTS.reduce((a, s) => a + mix[s.key], 0);
  const R = 34;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = SEGMENTS.filter((s) => mix[s.key] > 0).map((s) => {
    const frac = mix[s.key] / total;
    const arc = { ...s, dash: frac * C, gap: C - frac * C, offset: -offset * C, frac };
    offset += frac;
    return arc;
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 84 84" className="h-24 w-24 shrink-0 -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" stroke="var(--line-soft)" strokeWidth="12" />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="42"
            cy="42"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="12"
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={a.offset}
          />
        ))}
        <text x="42" y="42" transform="rotate(90 42 42)" textAnchor="middle" dominantBaseline="central" className="num" style={{ fontSize: 18, fontWeight: 700, fill: 'var(--ink)' }}>
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        {arcs.map((a) => (
          <div key={a.key} className="mono flex items-center gap-1.5 text-[9.5px]">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: a.color }} />
            <span className="text-ink-2">{a.label}</span>
            <span className="num ml-auto font-bold text-ink">{mix[a.key]}</span>
            <span className="text-ink-3">{(a.frac * 100).toFixed(0)}%</span>
          </div>
        ))}
        {!total && <div className="mono text-[10px] text-ink-3">no flights</div>}
      </div>
    </div>
  );
}
