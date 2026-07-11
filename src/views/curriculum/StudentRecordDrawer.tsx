// Full real-record drawer for one student, across any batch — V2's SP detail
// modal (openSpModal). Shows only real records (PROG flown ∪ OPS flights),
// each tagged with a source-agreement dot; no projected/simulated dates.

import { useEffect } from 'react';
import { batchColorVar } from '@/domain/batches';
import { buildFullRecord, type RecordSource, type UnifiedStudent } from '@/domain/curriculumProg';
import type { CurriculumRow, Flight } from '@/domain/types';

const SRC_STYLE: Record<RecordSource, { color: string; label: string; title: string }> = {
  both: { color: '#22c55e', label: 'Both agree', title: 'Confirmed in both Operations & Progress' },
  review: { color: '#fbbf24', label: 'Differ', title: 'In both, but date/duration differ — review' },
  ops: { color: '#fb923c', label: 'Ops only', title: 'Flown in Operations, not yet posted to Progress' },
  prog: { color: '#60a5fa', label: 'Prog only', title: 'Logged in Progress, no matching Operations flight' },
  sched: { color: '#38bdf8', label: 'Scheduled', title: 'Scheduled in Operations (upcoming)' },
};

function fmtMins(m: number): string {
  if (!m) return '—';
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') + 'm' : ''}`;
}

export function StudentRecordDrawer({
  student,
  curriculum,
  opsFlights,
  onClose,
}: {
  student: UnifiedStudent | null;
  curriculum: readonly CurriculumRow[];
  opsFlights: readonly Flight[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!student) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [student, onClose]);

  if (!student) return null;
  const col = batchColorVar(student.batch);
  const rows = buildFullRecord(student, curriculum, opsFlights);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l-2 bg-bg p-4 shadow-[var(--shadow)]" style={{ borderColor: col }}>
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-bold text-ink">
              {student.name}
              {student.nick && <span className="mono ml-1.5 rounded px-1.5 py-0.5 text-[10px]" style={{ color: col, background: `color-mix(in oklab, ${col} 15%, transparent)` }}>{student.nick}</span>}
            </div>
            <div className="mono uc text-[9px] text-ink-3">
              {student.batch} · {student.done}/{student.total} lessons · {student.pct.toFixed(1)}% · {student.remaining} remaining
            </div>
          </div>
          <button type="button" onClick={onClose} className="mono ml-auto h-8 w-8 shrink-0 cursor-pointer rounded border border-line text-ink-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mono mb-3 rounded border border-line-soft bg-surface px-2.5 py-2 text-[9.5px] text-ink-2">
          <b className="text-ink">How this is processed:</b> shows only real records — completed lessons from
          Progress and flights from the live Operations schedule. No projected plan dates. Dots show agreement
          between the two systems.
        </div>

        <div className="mono mb-2 flex flex-wrap gap-2.5 text-[9px] text-ink-3">
          {(Object.keys(SRC_STYLE) as RecordSource[]).map((k) => (
            <span key={k} title={SRC_STYLE[k].title} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SRC_STYLE[k].color }} />
              {SRC_STYLE[k].label}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto rounded border border-line-soft">
          <table className="w-full min-w-[420px] border-collapse text-[11px]">
            <thead>
              <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                <th className="w-6 px-2 py-1.5 text-center">●</th>
                <th className="px-2 text-left">Date</th>
                <th className="px-2 text-left">Lesson</th>
                <th className="px-2 text-right">Hrs</th>
                <th className="px-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="mono py-6 text-center text-[10px] text-ink-3">no records</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line-soft">
                  <td className="px-2 py-1.5 text-center" title={SRC_STYLE[r.src].title}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SRC_STYLE[r.src].color }} />
                  </td>
                  <td className="mono px-2 whitespace-nowrap text-ink-2">{r.date || '—'}</td>
                  <td className="mono px-2 text-ink">{r.lesson}</td>
                  <td className="mono px-2 text-right text-ink-2">{fmtMins(r.mins)}</td>
                  <td className="px-2">
                    <span className="mono uc rounded px-1.5 py-0.5 text-[9px]" style={{ color: r.status === 'Completed' ? 'var(--col-done)' : '#38bdf8', background: `color-mix(in oklab, ${r.status === 'Completed' ? 'var(--col-done)' : '#38bdf8'} 15%, transparent)` }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </>
  );
}
