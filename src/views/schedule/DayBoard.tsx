// Day layout: the sortable ops table (V2 OpsBoard), with a pinned TOTALS row.
// Mobile: horizontal scroll, sticky first column, all columns reachable.

import { useMemo, useState } from 'react';
import type { Flight } from '@/domain/types';
import { StatusPill, Tag, EmptyState } from '@/components/atoms';
import { SourceInfo, METHOD_BLOCK_TIME } from '@/components/SourceInfo';
import { batchColorVar, isAP127Batch } from '@/domain/batches';
import { minutesOf } from '@/domain/dates';

type SortKey = 'start' | 'end' | 'durMin' | 'batch' | 'student' | 'instructor' | 'lesson' | 'type' | 'tail' | 'status';

const COLS: Array<{ key: SortKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'batch', label: 'Batch' },
  { key: 'student', label: 'Student' },
  { key: 'instructor', label: 'Instructor' },
  { key: 'lesson', label: 'Lesson' },
  { key: 'start', label: 'Start' },
  { key: 'durMin', label: 'Dur' },
  { key: 'end', label: 'End' },
  { key: 'type', label: 'A/C' },
  { key: 'tail', label: 'Tail' },
];

function cmp(a: Flight, b: Flight, k: SortKey): number {
  if (k === 'durMin') return (a.durMin ?? 0) - (b.durMin ?? 0);
  if (k === 'start' || k === 'end') return (minutesOf(a[k]) ?? 9999) - (minutesOf(b[k]) ?? 9999);
  return String(a[k] ?? '').localeCompare(String(b[k] ?? ''));
}

function fmtMin(m: number | null): string {
  if (m == null) return '—';
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function DayBoard({
  flights,
  hl127,
  onOpen,
}: {
  flights: readonly Flight[];
  hl127: boolean;
  onOpen: (f: Flight) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'start', dir: 1 });

  const rows = useMemo(
    () => [...flights].sort((a, b) => cmp(a, b, sort.key) * sort.dir),
    [flights, sort],
  );
  const totals = useMemo(() => {
    const done = flights.filter((f) => f.status === 'Completed');
    return {
      n: flights.length,
      durH: flights.reduce((a, f) => a + (f.durMin ?? 0), 0) / 60,
      doneN: done.length,
      doneH: done.reduce((a, f) => a + (f.durMin ?? 0), 0) / 60,
    };
  }, [flights]);

  if (!flights.length) {
    return <EmptyState title="No flights match" hint="Loosen the filters or pick another date — ‹ › arrow keys change day." />;
  }

  const click = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[11.5px]">
        <thead>
          <tr className="sticky top-0 z-10 bg-bg-2">
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => click(c.key)}
                className={`mono uc cursor-pointer border-b border-line px-2 py-1.5 text-left text-[8.5px] whitespace-nowrap text-ink-3 select-none hover:text-ink ${c.key === 'status' ? 'sticky left-0 z-20 bg-bg-2' : ''}`}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                {c.key === 'durMin' && (
                  <span className="ml-1 align-middle normal-case">
                    <SourceInfo refSpec={{ sources: ['flights'], method: METHOD_BLOCK_TIME }} align="left" />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="mono bg-bg-2/70 text-[10px] font-bold text-ink">
            <td className="sticky left-0 z-10 border-b border-line bg-bg-2 px-2 py-1.5">TOTAL · {totals.n}</td>
            <td className="border-b border-line px-2" colSpan={4}>
              {totals.doneN} completed · {totals.doneH.toFixed(1)}h flown
            </td>
            <td className="border-b border-line px-2" colSpan={2}>
              {totals.durH.toFixed(1)}h sched
            </td>
            <td className="border-b border-line px-2" colSpan={3} />
          </tr>
          {rows.map((f) => {
            const ap = isAP127Batch(f.batch);
            return (
              <tr
                key={f.id}
                onClick={() => onOpen(f)}
                className="cursor-pointer border-b border-line-soft hover:bg-bg-2"
                style={{
                  opacity: hl127 && !ap ? 0.28 : 1,
                  boxShadow: ap ? 'inset 3px 0 0 var(--highlight)' : undefined,
                }}
              >
                <td className="sticky left-0 z-10 bg-bg px-2 py-1.5 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    <StatusPill status={f.status} />
                    {f.isSim && <Tag color="var(--col-sim)">S</Tag>}
                    {f.isStandby && <Tag color="var(--col-stby)">◌</Tag>}
                  </span>
                </td>
                <td className="mono px-2 font-bold whitespace-nowrap" style={{ color: batchColorVar(f.batch) }}>
                  {f.batch ?? '—'}
                </td>
                <td className="px-2 font-semibold whitespace-nowrap text-ink">{f.student ?? '—'}</td>
                <td className="px-2 whitespace-nowrap text-ink-2">{f.instructor ?? '—'}</td>
                <td className="mono px-2 whitespace-nowrap text-ink">{f.lesson ?? '—'}{f.cond ? <span className="ml-1 text-[9px] text-[var(--col-solo)]">{f.cond}</span> : null}</td>
                <td className="mono px-2 whitespace-nowrap">{f.start ?? '—'}</td>
                <td className="mono px-2 whitespace-nowrap text-ink-2">{fmtMin(f.durMin)}</td>
                <td className="mono px-2 whitespace-nowrap">{f.end ?? '—'}</td>
                <td className="mono px-2 text-[10px] whitespace-nowrap text-ink-2">{f.type ?? '—'}</td>
                <td className="mono px-2 whitespace-nowrap text-ink-2">{f.tail ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
