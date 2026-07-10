// Recent flight activity feed: most recent flown lessons across the cohort.

import { useMemo } from 'react';
import { Link } from 'react-router';
import { Panel } from '@/components/atoms';
import type { Student } from '@/domain/types';

export function RecentFlights({ students, limit = 8 }: { students: readonly Student[]; limit?: number }) {
  const rows = useMemo(() => {
    const all = students.flatMap((s) => s.flown.map((f) => ({ s, f })));
    return all.sort((a, b) => (b.f.date + b.s.done).localeCompare(a.f.date + a.s.done)).slice(0, limit);
  }, [students, limit]);

  return (
    <Panel title="Recent activity" hint={`last ${rows.length}`}>
      {!rows.length && <div className="mono py-3 text-center text-[10px] text-ink-3">no flown lessons yet</div>}
      <div className="flex flex-col gap-1">
        {rows.map(({ s, f }, i) => (
          <Link
            key={i}
            to={`/student/${s.nick}`}
            className="flex items-baseline justify-between gap-2 rounded px-1.5 py-1 no-underline hover:bg-bg-2"
          >
            <span className="mono truncate text-[10px] font-semibold text-ink">
              {s.nick} <span className="text-ink-3">·</span> {f.lesson}
            </span>
            <span className="mono shrink-0 text-[8.5px] text-ink-3">
              {f.date.slice(5)} · {s.done}/{s.total}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
