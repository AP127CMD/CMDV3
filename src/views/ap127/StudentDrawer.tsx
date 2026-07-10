// Quick-peek Student Drawer for AP127 Detail (V2 openAP127Drawer), for users
// who don't want to leave the ranking table. Full detail still lives at
// /student/:nick (Student Lens) — this is a fast preview, not a duplicate.
//
// Future lesson dates come ONLY from the real ops schedule (upcomingLessons),
// never from the simulated NGT scheduler output — see domain/upcoming.ts.

import { useEffect } from 'react';
import { Link } from 'react-router';
import { Kpi, StatusPill } from '@/components/atoms';
import type { Flight, Student } from '@/domain/types';
import { studentHours, idleDays, lastFlightDate, dayDelta } from '@/domain/pace';
import { upcomingLessons } from '@/domain/upcoming';
import type { CurriculumRow } from '@/domain/types';

function fmtMins(m: number | null): string {
  if (!m) return '';
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') + 'm' : ''}`;
}

export function StudentDrawer({
  student,
  curriculum,
  curMap,
  planMap,
  opsFlights,
  today,
  onClose,
  onOpenFlight,
}: {
  student: Student | null;
  curriculum: readonly CurriculumRow[];
  curMap: Record<string, number>;
  planMap: Record<string, string>;
  opsFlights: readonly Flight[];
  today: string;
  onClose: () => void;
  onOpenFlight: (f: Flight) => void;
}) {
  useEffect(() => {
    if (!student) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [student, onClose]);

  if (!student) return null;
  const s = student;
  const hrs = studentHours(s, curMap);
  const hrsDelta = hrs - (curriculum.filter((c) => c.plannedDate && c.plannedDate <= today).reduce((a, c) => a + (c.plannedMins ?? 0), 0) / 60);
  const idle = idleDays(s, today);
  const dd = dayDelta(s, planMap, today);
  const upcoming = upcomingLessons(s, curriculum, opsFlights);
  const flownDesc = [...s.flown].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-bg p-4 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-bold text-ink">
              {s.name} <span className="text-highlight">· {s.nick}</span>
            </div>
            <div className="mono uc text-[9px] text-ink-3">
              CATC {s.catcId} · FI {s.fi} · {s.se}
            </div>
          </div>
          <button type="button" onClick={onClose} className="mono ml-auto h-8 w-8 shrink-0 cursor-pointer rounded border border-line text-ink-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <Kpi label="Lessons" value={`${s.done}/${s.total}`} color="var(--highlight)" />
          <Kpi label="Hours" value={hrs.toFixed(1)} />
          <Kpi label="Idle" value={idle === 9999 ? '—' : `${idle}d`} color={idle > 5 ? 'var(--col-cancel)' : idle > 2 ? 'var(--col-pending)' : 'var(--col-done)'} />
          <Kpi label="Day Δ" value={dd == null ? '—' : `${dd > 0 ? '+' : ''}${dd}d`} color={dd != null && dd > 0 ? 'var(--col-cancel)' : 'var(--col-done)'} />
          <Kpi label="Hrs Δ" value={`${hrsDelta >= 0 ? '+' : ''}${hrsDelta.toFixed(1)}h`} color={hrsDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)'} />
        </div>

        <Link to={`/student/${s.nick}`} className="mono uc mb-3 inline-block text-[9px] text-[var(--highlight)] hover:underline">
          Full Student Lens →
        </Link>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mono uc mb-1 text-[8.5px] text-ink-3">Completed ({flownDesc.length})</div>
            <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
              {flownDesc.map((f, i) => (
                <div key={i} className="mono flex justify-between rounded px-1.5 py-1 text-[9.5px] text-ink-2 hover:bg-bg-2">
                  <span>{f.date}</span>
                  <span className="text-ink">{f.lesson}</span>
                  <span className="text-ink-3">{fmtMins(f.actualMins)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mono uc mb-1 text-[8.5px] text-ink-3">Upcoming ({upcoming.length}) · real ops schedule</div>
            <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
              {upcoming.map((u, i) =>
                u.opsFlight ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onOpenFlight(u.opsFlight!)}
                    className="mono flex cursor-pointer items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[9.5px] hover:bg-bg-2"
                  >
                    <span className="text-ink-2">{u.date}</span>
                    <span className="text-ink">{u.lesson}</span>
                    <StatusPill status={u.opsFlight.status} />
                  </button>
                ) : (
                  <div key={i} className="mono flex justify-between rounded px-1.5 py-1 text-[9.5px]">
                    <span className="text-ink-3">TBC</span>
                    <span className="text-ink-2">{u.lesson}</span>
                    <span className="text-ink-3">not yet scheduled</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
        <div className="mono mt-3 text-[8px] text-ink-3">
          Last flown: {lastFlightDate(s) || '—'}. Upcoming dates are read from the live operations
          schedule only — never a simulated projection.
        </div>
      </aside>
    </>
  );
}
