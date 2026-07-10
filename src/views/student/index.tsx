// Student Lens: one student's operations ⇄ progress, merged. Each curriculum
// lesson is one row showing both sides with its reconcile classification
// inline — conflicts explain themselves using the engine's shared window.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Kpi, LoadingBlock, Panel, StatusPill, Tag } from '@/components/atoms';
import { FlightDrawer } from '@/components/FlightDrawer';
import { SourceInfo } from '@/components/SourceInfo';
import { useFlights, useStudents } from '@/data/queries';
import { bkkToday, dateDiff } from '@/domain/dates';
import { normLesson } from '@/domain/lessons';
import { reconcile, type ReconcileRow } from '@/domain/reconcile';
import { buildCurriculumMap, idleDays, lastFlightDate, projectFinishDate, studentHours } from '@/domain/pace';
import { isAP127Batch } from '@/domain/batches';
import { upcomingLessons } from '@/domain/upcoming';
import type { Flight, Student } from '@/domain/types';

interface LensRow {
  lessonNorm: string;
  lesson: string;
  progDate?: string;
  progMins?: number | null;
  opsFlight?: Flight;
  /** Real ops-scheduled date for a not-yet-flown lesson; null = TBC (never a simulated date). */
  upcomingDate?: string | null;
  status: 'ok' | 'review' | 'missing_in_ops' | 'missing_in_progress' | 'scheduled' | 'upcoming';
  detail?: string;
}

const SRC_STYLE: Record<LensRow['status'], { color: string; label: string }> = {
  ok: { color: 'var(--col-done)', label: 'OK' },
  review: { color: 'var(--col-pending)', label: 'REVIEW' },
  missing_in_ops: { color: 'var(--col-cancel)', label: 'PROG ONLY' },
  missing_in_progress: { color: 'var(--col-cancel)', label: 'OPS ONLY' },
  scheduled: { color: 'var(--col-stby)', label: 'SCHED' },
  upcoming: { color: 'var(--ink-3)', label: 'UPCOMING' },
};

export default function StudentView() {
  const { nick } = useParams();
  const navigate = useNavigate();
  const { students, curriculum, isLoading } = useStudents();
  const { flights } = useFlights();
  const [drawer, setDrawer] = useState<Flight | null>(null);
  const today = bkkToday();

  const ordered = useMemo(() => [...students].sort((a, b) => a.nick.localeCompare(b.nick)), [students]);
  const student: Student | undefined = useMemo(
    () => students.find((s) => s.nick.toUpperCase() === (nick ?? '').toUpperCase()),
    [students, nick],
  );

  const recon = useMemo(
    () => (flights.length && students.length ? reconcile(flights, students) : null),
    [flights, students],
  );
  const curMap = useMemo(() => buildCurriculumMap(curriculum), [curriculum]);

  const model = useMemo(() => {
    if (!student || !recon) return null;
    const myRows = new Map<string, ReconcileRow>();
    for (const r of recon.rows) if (r.key === student.key) myRows.set(normLesson(r.lesson), r);

    const myOps = flights.filter((f) => isAP127Batch(f.batch) && f.studentKey === student.key);
    const opsByLesson = new Map<string, Flight[]>();
    for (const f of myOps) {
      const k = f.lessonNorm ?? normLesson(f.lesson);
      (opsByLesson.get(k) ?? opsByLesson.set(k, []).get(k)!).push(f);
    }
    const progByLesson = new Map(student.flown.map((f) => [f.lessonNorm, f]));
    // Remaining curriculum lessons, matched against the REAL ops schedule only
    // (TBC when not yet scheduled) — never the NGT scheduler's simulated plan.
    const upcoming = upcomingLessons(student, curriculum, flights);

    const keys = new Set<string>([
      ...progByLesson.keys(),
      ...[...opsByLesson.keys()].filter((k) => opsByLesson.get(k)!.some((f) => f.status !== 'Canceled')),
    ]);

    const rows: LensRow[] = [];
    for (const k of keys) {
      const prog = progByLesson.get(k);
      const opsAll = (opsByLesson.get(k) ?? []).filter((f) => f.status !== 'Canceled');
      const opsDone = opsAll.find((f) => f.status === 'Completed');
      const opsAny = opsDone ?? opsAll[0];
      const rec = myRows.get(k);
      let status: LensRow['status'];
      if (prog && opsDone) status = rec?.type === 'review' ? 'review' : 'ok';
      else if (prog && !opsDone) status = rec?.type === 'missing_in_ops' ? 'missing_in_ops' : opsAny ? 'ok' : 'ok';
      else if (!prog && opsDone) status = 'missing_in_progress';
      else status = 'scheduled';
      if (prog && !opsDone && rec?.type === 'missing_in_ops') status = 'missing_in_ops';
      rows.push({
        lessonNorm: k,
        lesson: prog?.lesson ?? opsAny?.lesson ?? k,
        progDate: prog?.date,
        progMins: prog?.actualMins,
        opsFlight: opsAny,
        status,
        detail: rec?.detail,
      });
    }
    // Remaining lessons not yet flown/matched above — real ops date or TBC.
    for (const u of upcoming) {
      if (!keys.has(u.lessonNorm)) {
        rows.push({ lessonNorm: u.lessonNorm, lesson: u.lesson, upcomingDate: u.date, opsFlight: u.opsFlight ?? undefined, status: 'upcoming' });
      }
    }
    // Activity (flown/scheduled) newest-first, then upcoming rows soonest-first (TBC last).
    const activity = rows.filter((r) => r.status !== 'upcoming');
    const upcomingRows = rows.filter((r) => r.status === 'upcoming');
    activity.sort((a, b) =>
      (b.progDate ?? b.opsFlight?.date ?? '').localeCompare(a.progDate ?? a.opsFlight?.date ?? ''),
    );
    upcomingRows.sort((a, b) => (a.upcomingDate ?? '9999').localeCompare(b.upcomingDate ?? '9999'));
    rows.length = 0;
    rows.push(...activity, ...upcomingRows);

    const upcomingOpsFlights = myOps
      .filter((f) => f.status === 'Pending' && f.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    const per = recon.perStudent.find((p) => p.key === student.key);
    const idle = idleDays(student, today);
    const hrs = studentHours(student, curMap);
    const paceWindowDays = 30;
    const from30 = student.flown.filter((f) => (dateDiff(today, f.date) ?? 99) <= paceWindowDays).length;
    const etc = projectFinishDate(student.remaining, from30 / 22, today); // ~22 workable days / 30
    return { rows, upcomingOpsFlights, per, idle, hrs, etc, windowStart: recon.totals.windowStart };
  }, [student, recon, flights, today, curMap, curriculum]);

  if (isLoading) return <LoadingBlock label="loading students…" />;

  // Picker when no/unknown student selected
  if (!student) {
    return (
      <div className="p-4">
        <div className="font-display mb-3 text-[18px] font-bold tracking-wider uppercase">
          Student <span className="text-highlight">Lens</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
          {ordered.map((s) => (
            <Link key={s.catcId} to={`/student/${s.nick}`} className="rounded-lg border border-line bg-surface px-3 py-2 no-underline hover:border-[var(--highlight)]">
              <div className="mono text-[11px] font-bold text-[var(--highlight)]">{s.nick}</div>
              <div className="truncate text-[10.5px] text-ink-2">{s.name}</div>
              <div className="mono mt-1 text-[8.5px] text-ink-3">{s.done}/{s.total} · {s.pct.toFixed(0)}%</div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const idx = ordered.findIndex((s) => s.catcId === student.catcId);
  const prev = ordered[(idx - 1 + ordered.length) % ordered.length];
  const next = ordered[(idx + 1) % ordered.length];

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate(`/student/${prev.nick}`)} className="mono h-8 w-8 cursor-pointer rounded border border-line text-ink-2" title={prev.nick}>
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[18px] leading-tight font-bold tracking-wide uppercase">
            {student.name} <span className="text-highlight">· {student.nick}</span>
          </div>
          <div className="mono uc text-[9px] text-ink-3">
            CATC {student.catcId} · FI {student.fi} ({student.fiFull}) · {student.se}
          </div>
        </div>
        <button type="button" onClick={() => navigate(`/student/${next.nick}`)} className="mono h-8 w-8 cursor-pointer rounded border border-line text-ink-2" title={next.nick}>
          ›
        </button>
        <Link to="/student" className="mono uc rounded border border-line px-2 py-1.5 text-[9px] text-ink-3 no-underline hover:text-ink">
          All SP
        </Link>
      </div>

      {/* Progress strip + KPIs */}
      <div className="flex flex-wrap gap-1.5">
        <Kpi label="Progress" value={`${student.pct.toFixed(1)}%`} sub={`${student.done}/${student.total} lessons`} color="var(--highlight)"
          info={<SourceInfo refSpec={{ sources: ['progress'] }} />} />
        <Kpi label="Hours" value={model?.hrs.toFixed(1) ?? '—'} sub="curriculum-weighted"
          info={<SourceInfo refSpec={{ sources: ['progress'], method: 'Per flown lesson: curriculum planned minutes when known, else actual minutes.' }} />} />
        <Kpi label="Idle" value={model?.idle === 9999 ? '—' : `${model?.idle}d`} color={(model?.idle ?? 0) > 5 ? 'var(--col-cancel)' : (model?.idle ?? 0) > 2 ? 'var(--col-pending)' : 'var(--col-done)'} sub={`last flt ${lastFlightDate(student) || '—'}`} />
        <Kpi label="Next lesson" value={<span className="text-[13px]">{student.nextLesson ?? '—'}</span>} color="var(--col-stby)" />
        <Kpi label="Proj. finish" value={<span className="text-[13px]">{model?.etc ?? '—'}</span>} sub="at 30-day pace, workdays only" color="#38bdf8" />
        <Kpi label="Data check" value={model?.per ? `${model.per.ok}✓ ${model.per.review}⚠ ${model.per.conflict}✗` : '—'} color={model?.per?.conflict ? 'var(--col-cancel)' : 'var(--col-done)'}
          info={<SourceInfo refSpec={{ sources: ['flights', 'progress'], basis: `pairings inside the shared window (from ${model?.windowStart})` }} />} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Merged timeline */}
        <Panel title="Lesson record — ops ⇄ progress merged" hint="newest first" className="lg:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto scroll-shadow-x">
            <table className="w-full min-w-[640px] border-collapse text-[10.5px]">
              <thead>
                <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                  <th className="px-2 py-1.5 text-left">Check</th>
                  <th className="px-2 text-left">Lesson</th>
                  <th className="px-2 text-left">Progress side</th>
                  <th className="px-2 text-left">Operations side</th>
                </tr>
              </thead>
              <tbody>
                {model?.rows.map((r) => {
                  const st = SRC_STYLE[r.status];
                  return (
                    <tr key={r.lessonNorm + (r.upcomingDate ?? '')} className="border-b border-line-soft align-top hover:bg-bg-2">
                      <td className="px-2 py-1.5">
                        <Tag color={st.color}>{st.label}</Tag>
                      </td>
                      <td className="mono px-2 py-1.5 font-bold whitespace-nowrap text-ink">{r.lesson}</td>
                      <td className="px-2 py-1.5">
                        {r.progDate ? (
                          <span className="mono text-ink-2">
                            {r.progDate} · {r.progMins ?? '—'}m
                          </span>
                        ) : r.status === 'upcoming' ? (
                          <span className="mono text-ink-3">{r.upcomingDate ? `real ops ${r.upcomingDate}` : 'TBC — not yet scheduled'}</span>
                        ) : (
                          <span className="mono" style={{ color: r.status === 'missing_in_progress' ? 'var(--col-cancel)' : 'var(--ink-3)' }}>
                            {r.status === 'missing_in_progress' ? 'not logged' : '—'}
                          </span>
                        )}
                        {r.detail && <div className="mt-0.5 max-w-[220px] text-[9px]" style={{ color: st.color }}>{r.detail}</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.opsFlight ? (
                          <button type="button" onClick={() => setDrawer(r.opsFlight!)} className="mono flex cursor-pointer items-center gap-1.5 text-left text-ink-2 hover:text-[var(--highlight)]">
                            <StatusPill status={r.opsFlight.status} />
                            {r.opsFlight.date} · {r.opsFlight.start ?? '—'} · {r.opsFlight.tail ?? ''}
                          </button>
                        ) : (
                          <span className="mono" style={{ color: r.status === 'missing_in_ops' ? 'var(--col-cancel)' : 'var(--ink-3)' }}>
                            {r.status === 'missing_in_ops' ? `no completed ops flight (window from ${model.windowStart})` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Upcoming */}
        <Panel title="Upcoming ops flights" hint={`${model?.upcomingOpsFlights.length ?? 0}`}>
          {(model?.upcomingOpsFlights.length ?? 0) === 0 && <div className="mono py-4 text-center text-[10px] text-ink-3">nothing scheduled yet</div>}
          <div className="flex flex-col gap-1">
            {model?.upcomingOpsFlights.map((f) => (
              <button key={f.id} type="button" onClick={() => setDrawer(f)} className="flex cursor-pointer items-center gap-2 rounded border border-line-soft bg-bg px-2 py-1.5 text-left hover:border-[var(--highlight)]">
                <span className="mono text-[10px] font-bold text-ink">{f.date}</span>
                <span className="mono text-[10px] text-ink-2">{f.start ?? '—'}</span>
                <span className="mono min-w-0 flex-1 truncate text-[10px] text-[var(--highlight)]">{f.lesson}</span>
                <span className="mono text-[9px] text-ink-3">{f.tail?.replace('HS-', '')}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <FlightDrawer flight={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
