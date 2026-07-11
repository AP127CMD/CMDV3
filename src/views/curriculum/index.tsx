// Curriculum Prog — per-student plan/progress cards across ALL FOUR batches
// (V2's "Progress Detail" / 'plans' page). Search + sort + batch filter over
// the whole school; each card shows recent flown lessons and real-ops-only
// upcoming lessons (TBC if not yet scheduled); click a card for the full
// real-record drawer (V2's SP modal).

import { useMemo, useState } from 'react';
import { Chip, EmptyState, LoadingBlock, Panel } from '@/components/atoms';
import { useFlightsFile, useNgtFile, useStudents } from '@/data/queries';
import { batchColorVar } from '@/domain/batches';
import {
  buildUnifiedRoster,
  curriculumForBatch,
  progUpcoming,
  PROG_BATCHES,
  type UnifiedStudent,
} from '@/domain/curriculumProg';
import { StudentRecordDrawer } from './StudentRecordDrawer';

type SortMode = 'batch' | 'pct' | 'name';
const RECENT_N = 3;
const UPCOMING_N = 3;

function fmtMins(m: number | null): string {
  if (!m) return '';
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') + 'm' : ''}`;
}

export default function CurriculumProgView() {
  const { students: ap127Students, isLoading: pLoading } = useStudents();
  const ngt = useNgtFile();
  const opsFile = useFlightsFile();

  const [batch, setBatch] = useState<'ALL' | (typeof PROG_BATCHES)[number]>('ALL');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('batch');
  const [drawerStudent, setDrawerStudent] = useState<UnifiedStudent | null>(null);

  const opsFlights = opsFile.data?.data.flights ?? [];
  const curricula = ngt.data?.data.curricula ?? {};
  const batches = ngt.data?.data.batches ?? {};

  const roster = useMemo(() => buildUnifiedRoster(ap127Students, batches), [ap127Students, batches]);

  const rows = useMemo(() => {
    let arr = batch === 'ALL' ? roster : roster.filter((s) => s.batch === batch);
    const query = q.toLowerCase().trim();
    if (query) arr = arr.filter((s) => s.name.toLowerCase().includes(query) || s.nick.toLowerCase().includes(query) || s.fi.toLowerCase().includes(query));
    const sorted = [...arr];
    if (sort === 'pct') sorted.sort((a, b) => b.pct - a.pct);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => PROG_BATCHES.indexOf(a.batch as never) - PROG_BATCHES.indexOf(b.batch as never) || b.pct - a.pct);
    return sorted;
  }, [roster, batch, q, sort]);

  const isLoading = pLoading || ngt.isLoading || opsFile.isLoading;
  if (isLoading) return <LoadingBlock label="loading curriculum progress…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-display text-[18px] font-bold tracking-wider uppercase">
          Curriculum <span className="text-highlight">Prog</span>
        </div>
        <span className="mono uc text-[9px] text-ink-3">per-student plan · all 4 batches</span>
      </div>

      <Panel title="Progress Detail — per-student plan">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search…"
            className="mono min-w-[160px] rounded border border-line bg-bg px-2 py-1 text-[10px] text-ink placeholder:text-ink-3"
          />
          <Chip active={batch === 'ALL'} onClick={() => setBatch('ALL')}>All batches</Chip>
          {PROG_BATCHES.map((b) => (
            <Chip key={b} active={batch === b} onClick={() => setBatch(b)} accent={batchColorVar(b)}>{b}</Chip>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line sm:inline-block" />
          {(['batch', 'pct', 'name'] as SortMode[]).map((s) => (
            <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
              {s === 'batch' ? 'Batch order' : s === 'pct' ? 'Progress %' : 'Name A–Z'}
            </Chip>
          ))}
          <span className="mono ml-auto text-[9px] text-ink-3">{rows.length} students</span>
        </div>
        <div className="mono uc mt-2 text-[8px] text-ink-3">
          Upcoming dates from live Operations schedule · TBC = not yet scheduled · click a card for all records
        </div>
      </Panel>

      {rows.length === 0 ? (
        <EmptyState title="No students match" hint="Loosen the search or batch filter." />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <ProgCard key={s.catcId} student={s} curriculum={curriculumForBatch(s.batch, curricula)} opsFlights={opsFlights} onOpen={() => setDrawerStudent(s)} />
          ))}
        </div>
      )}

      <StudentRecordDrawer student={drawerStudent} curriculum={drawerStudent ? curriculumForBatch(drawerStudent.batch, curricula) : []} opsFlights={opsFlights} onClose={() => setDrawerStudent(null)} />
    </div>
  );
}

function ProgCard({
  student,
  curriculum,
  opsFlights,
  onOpen,
}: {
  student: UnifiedStudent;
  curriculum: ReturnType<typeof curriculumForBatch>;
  opsFlights: Parameters<typeof progUpcoming>[2];
  onOpen: () => void;
}) {
  const col = batchColorVar(student.batch);
  const recent = [...student.flown].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_N);
  const upcoming = useMemo(() => progUpcoming(student, curriculum, opsFlights), [student, curriculum, opsFlights]);
  const shown = upcoming.slice(0, UPCOMING_N);
  const next = upcoming[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex cursor-pointer flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-[var(--highlight)]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-ink">
            {student.name}
            {student.nick && (
              <span className="mono ml-1.5 rounded px-1 py-0.5 text-[8px] font-normal" style={{ color: col, background: `color-mix(in oklab, ${col} 15%, transparent)` }}>
                {student.nick}
              </span>
            )}
          </div>
          <div className="mono uc text-[8.5px] text-ink-3">{student.batch} · {student.done}/{student.total}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[16px] font-bold" style={{ color: col }}>{student.pct.toFixed(1)}%</div>
          <div className="mono text-[8px] text-ink-3">{student.remaining} left</div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full" style={{ width: `${Math.max(student.pct, 1.5)}%`, background: col }} />
      </div>

      <div className="mono flex max-h-32 flex-col gap-0.5 overflow-y-auto text-[9.5px]">
        {recent.map((f, i) => (
          <div key={`r${i}`} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--col-done)' }} />
            <span className="shrink-0 text-ink-3">{f.date.slice(5)}</span>
            <span className="truncate" style={{ color: 'var(--col-done)' }}>{f.lesson}</span>
            <span className="ml-auto shrink-0 text-ink-3">{fmtMins(f.actualMins)}</span>
          </div>
        ))}
        {recent.length > 0 && shown.length > 0 && (
          <div className="mono uc py-0.5 text-[8px] text-ink-3">▸ {student.remaining} remaining · next {shown.length} scheduled shown</div>
        )}
        {shown.map((u, i) => (
          <div key={`u${i}`} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full opacity-50" style={{ background: col }} />
            <span className={`shrink-0 ${u.date ? 'text-ink-2' : 'text-ink-3 italic'}`}>{u.date ? u.date.slice(5) : 'TBC'}</span>
            <span className="truncate" style={{ color: col }}>{u.lesson}</span>
          </div>
        ))}
        {upcoming.length > UPCOMING_N && <div className="mono text-[8px] text-ink-3">+{upcoming.length - UPCOMING_N} more</div>}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-1.5">
        <span className="mono text-[9px] text-ink-3">
          {next ? (
            <>
              Next: <b style={{ color: col }}>{next.lesson}</b>{' '}
              <span className={next.date ? 'text-ink-2' : 'italic'}>{next.date ?? 'TBC'}</span>
            </>
          ) : (
            'curriculum complete'
          )}
        </span>
        <span className="mono uc rounded border px-1.5 py-0.5 text-[8px]" style={{ color: col, borderColor: `color-mix(in oklab, ${col} 40%, transparent)` }}>
          View all ›
        </span>
      </div>
    </button>
  );
}
