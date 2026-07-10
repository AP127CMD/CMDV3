// The "where did this number come from" popover — every KPI, chart and table
// can carry one. Renders dataset provenance from the manifest plus a method
// note produced where the number is computed.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useManifest } from '@/data/queries';
import type { Manifest } from '@/domain/types';

export interface SourceRef {
  /** Which snapshot(s) the widget reads. */
  sources: Array<keyof Manifest['sources']>;
  /** How the number is computed, e.g. "Hours = block time (durMin)". */
  method?: string;
  /** Human description of active filters/window applied. */
  basis?: string;
}

function ago(iso: string | undefined | null): string {
  if (!iso) return '—';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const SOURCE_LABEL: Record<string, string> = {
  flights: 'Operations (flight schedule)',
  progress: 'Progress (AP127 curriculum)',
  ngt: 'Training program (all batches)',
};

export function SourceInfo({ refSpec, align = 'right' }: { refSpec: SourceRef; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const manifest = useManifest().data?.data;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={box}>
      <button
        type="button"
        aria-label="Data source info"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="mono inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-line text-[8px] text-ink-3 hover:border-[var(--highlight)] hover:text-[var(--highlight)]"
      >
        i
      </button>
      {open && (
        <div
          className="absolute top-5 z-50 w-64 rounded-lg border border-line bg-surface p-3 text-left shadow-[var(--shadow)]"
          style={align === 'right' ? { right: 0 } : { left: 0 }}
        >
          <div className="mono uc mb-1.5 text-[9px] font-bold text-ink">Data lineage</div>
          {refSpec.sources.map((k) => {
            const m = manifest?.sources[k];
            return (
              <div key={k} className="mb-1.5 border-b border-line-soft pb-1.5 last:mb-0 last:border-0 last:pb-0">
                <div className="text-[10px] font-semibold text-ink-2">{SOURCE_LABEL[k] ?? k}</div>
                {m ? (
                  <div className="mono mt-0.5 text-[9px] leading-relaxed text-ink-3">
                    data as of {ago(m.lastChangedAt)} · checked {ago(m.fetchedAt)}
                    <br />
                    {Object.entries(m.records)
                      .slice(0, 3)
                      .map(([n, c]) => `${c.toLocaleString()} ${n}`)
                      .join(' · ')}
                    {m.validation.warnings.length > 0 && (
                      <>
                        <br />
                        <span style={{ color: 'var(--col-pending)' }}>
                          ⚠ {m.validation.warnings.length} data warning(s)
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mono text-[9px] text-ink-3">manifest unavailable</div>
                )}
              </div>
            );
          })}
          {refSpec.basis && <div className="mt-1 text-[10px] text-ink-2">{refSpec.basis}</div>}
          {refSpec.method && <div className="mt-1 text-[9.5px] text-ink-3 italic">{refSpec.method}</div>}
          <a href="/integrity?tab=sources" className="mono uc mt-2 inline-block text-[9px] text-[var(--highlight)] hover:underline">
            full provenance →
          </a>
        </div>
      )}
    </div>
  );
}

/** Standard method notes reused across widgets. */
export const METHOD_BLOCK_TIME =
  'Hours = block time (durMin). Airborne time is shown for reference only and never summed.';

export function InfoRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}
