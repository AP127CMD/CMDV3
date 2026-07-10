// Shared flight-detail drawer, reused by every schedule layout, Home and
// Student Lens. Actual times (tkoff/ldg/airborne) are DISPLAY ONLY — hours
// math everywhere uses block time.

import { useEffect } from 'react';
import { Link } from 'react-router';
import type { Flight } from '@/domain/types';
import { StatusPill, Tag } from './atoms';
import { batchColorVar, isAP127Batch } from '@/domain/batches';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5 last:border-0">
      <div className="mono uc shrink-0 text-[8.5px] text-ink-3">{label}</div>
      <div className="text-right text-[12px] text-ink">{value}</div>
    </div>
  );
}

function fmtMin(m: number | null): string | null {
  if (m == null) return null;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function FlightDrawer({ flight, onClose }: { flight: Flight | null; onClose: () => void }) {
  useEffect(() => {
    if (!flight) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [flight, onClose]);

  if (!flight) return null;
  const f = flight;
  const ap127 = isAP127Batch(f.batch);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-line bg-bg p-4 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-center gap-2">
          <StatusPill status={f.status} size="lg" />
          {f.isSim && <Tag color="var(--col-sim)">SIM</Tag>}
          {f.isStandby && <Tag color="var(--col-stby)">STBY</Tag>}
          {f.flags?.unplanned && <Tag color="var(--col-pending)">UNPLANNED</Tag>}
          {ap127 && <Tag color="var(--highlight)" filled>AP-127</Tag>}
          <button
            type="button"
            onClick={onClose}
            className="mono ml-auto h-8 w-8 cursor-pointer rounded border border-line text-[12px] text-ink-2 hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-1 text-[19px] font-bold text-ink">
          {ap127 && f.nick ? (
            <Link to={`/student/${f.nick}`} className="text-[var(--highlight)] hover:underline">
              {f.student}
            </Link>
          ) : (
            f.student ?? '—'
          )}
        </div>
        <div className="mono mb-3 text-[10.5px] text-ink-3">
          {f.date} · {f.start ?? '—'}–{f.end ?? '—'} · {fmtMin(f.durMin) ?? '—'} block
        </div>

        <Row label="Lesson" value={<span className="mono font-bold">{f.lesson}</span>} />
        <Row label="Condition" value={f.cond} />
        <Row
          label="Batch"
          value={<span className="mono font-bold" style={{ color: batchColorVar(f.batch) }}>{f.batch}</span>}
        />
        <Row label="Instructor" value={f.instructor} />
        <Row label="Aircraft" value={f.type} />
        <Row label="Tail" value={<span className="mono">{f.tail}</span>} />
        <Row label="T/O · LDG" value={f.to != null || f.ldg != null ? `${f.to ?? '—'} · ${f.ldg ?? '—'}` : null} />
        <Row label="Actual T/O" value={f.tkoff && f.tkoff !== '00:00' ? f.tkoff : null} />
        <Row label="Actual LDG" value={f.ldgTime && f.ldgTime !== '00:00' ? f.ldgTime : null} />
        <Row
          label="Airborne (ref only)"
          value={f.airborneMin ? `${fmtMin(f.airborneMin)} — display only, hours use block time` : null}
        />
        <Row label="Flight ID" value={<span className="mono text-[10px] text-ink-3">{f.id}</span>} />
        {f.studentRaw && (
          <Row label="Raw name" value={<span className="mono text-[10px] text-ink-3">{f.studentRaw}</span>} />
        )}
      </aside>
    </>
  );
}
