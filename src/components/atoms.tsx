import type { CSSProperties, ReactNode } from 'react';
import type { FlightStatus } from '@/domain/types';

export function Panel({
  title,
  hint,
  accent,
  children,
  className = '',
  bodyClassName = '',
  id,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  accent?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Anchor id, e.g. for in-page "jump to section" links. */
  id?: string;
}) {
  return (
    <div id={id} className={`min-w-0 overflow-hidden rounded-lg border border-line bg-surface scroll-mt-16 ${className}`}>
      {title != null && (
        <div
          className="flex items-center gap-2 border-b border-line bg-bg-2 px-3.5 py-2"
          style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
        >
          <div className="mono uc text-[10px] font-semibold text-ink">{title}</div>
          {hint != null && <div className="mono uc ml-auto text-[8px] text-ink-3">{hint}</div>}
        </div>
      )}
      <div className={`p-3 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  color = 'var(--ink-2)',
  info,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  info?: ReactNode;
}) {
  return (
    <div className="relative min-w-[72px] flex-1 basis-[96px] overflow-hidden rounded-md border border-line bg-surface px-2.5 py-2">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <div className="mono uc flex items-center justify-between text-[8px] text-ink-3">
        <span>{label}</span>
        {info}
      </div>
      <div className="num mt-0.5 text-[19px] leading-tight font-bold text-ink">{value}</div>
      {sub != null && <div className="mono uc mt-0.5 text-[8px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<FlightStatus, { fg: string; bg: string; label: string }> = {
  Pending: { fg: 'var(--col-pending)', bg: 'var(--col-pending-bg)', label: 'PENDING' },
  Completed: { fg: 'var(--col-done)', bg: 'var(--col-done-bg)', label: 'COMPLETED' },
  Canceled: { fg: 'var(--col-cancel)', bg: 'var(--col-cancel-bg)', label: 'CANCELED' },
};

export function StatusPill({ status, size = 'sm' }: { status: FlightStatus; size?: 'sm' | 'lg' }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="mono inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap"
      style={{
        color: s.fg,
        background: s.bg,
        fontSize: size === 'lg' ? 11 : 9,
        padding: size === 'lg' ? '3px 10px' : '2px 7px',
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {s.label}
    </span>
  );
}

export function Tag({
  children,
  color = 'var(--ink-2)',
  filled = false,
  style,
}: {
  children: ReactNode;
  color?: string;
  filled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className="mono inline-block rounded px-1.5 py-px text-[9px] font-semibold whitespace-nowrap"
      style={{
        color: filled ? 'var(--bg)' : color,
        background: filled ? color : 'transparent',
        border: `1px solid ${color}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Chip({
  active = false,
  onClick,
  children,
  title,
  accent = 'var(--highlight)',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  accent?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="mono uc min-h-[30px] cursor-pointer rounded-md border px-2.5 text-[10px] font-semibold transition-colors"
      style={{
        borderColor: active ? accent : 'var(--line)',
        color: active ? accent : 'var(--ink-2)',
        background: active ? 'color-mix(in oklab, ' + accent + ' 14%, transparent)' : 'var(--surface)',
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line py-10 text-center">
      <div className="mono uc text-[11px] text-ink-2">{title}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function LoadingBlock({ label = 'loading data…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-[var(--highlight)]" />
      <span className="mono uc text-[10px] text-ink-3">{label}</span>
    </div>
  );
}
