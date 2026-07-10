// Auto Slot Finder — the dispatcher workflow (V2's Auto Slot Finder), rebuilt
// on the clean constraint engine. AP-127 SPs are ranked by curriculum pace
// (most-behind first); each gets an auto-proposed earliest valid slot; the
// dispatcher reserves them one by one and every reservation cascades into the
// remaining searches so the whole proposal set stays consistent.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, EmptyState, LoadingBlock, Panel, Tag } from '@/components/atoms';
import { useFlightsFile, useStudents } from '@/data/queries';
import { bkkToday, minutesOf } from '@/domain/dates';
import { behindSort } from '@/domain/pace';
import { inferFiQualifications } from '@/domain/slotfinder';
import {
  autoPropose,
  type AutoContextBase,
  type AutoRequestBase,
  type AutoReservation,
  type SlotOption,
  type SpProposal,
} from '@/domain/autoslot';

const DURATIONS = [45, 60, 75, 90, 120, 150];
const BUFFERS = [0, 15, 30, 45];
const TOP_NS = [5, 10, 15, 28];

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function rankColor(rank: number, total: number): string {
  if (rank <= 3) return 'var(--col-cancel)'; // most behind — highest priority
  if (rank <= Math.ceil(total * 0.4)) return 'var(--col-pending)';
  return 'var(--col-done)';
}

export default function SlotFinderView() {
  const file = useFlightsFile();
  const { students, isLoading: sLoading } = useStudents();
  const today = bkkToday();

  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(90);
  const [buffer, setBuffer] = useState(30);
  const [searchStart, setSearchStart] = useState('06:30');
  const [searchEnd, setSearchEnd] = useState('18:00');
  const [rwyClose, setRwyClose] = useState(false);
  const [rwyFrom, setRwyFrom] = useState('12:00');
  const [rwyTo, setRwyTo] = useState('13:00');
  const [topN, setTopN] = useState(10);
  const [includeSims, setIncludeSims] = useState(false);
  const [reservations, setReservations] = useState<AutoReservation[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({}); // studentKey -> "fi__tail"

  const flights = useMemo(() => file.data?.data.flights ?? [], [file.data]);
  const allResources = file.data?.data.resources ?? [];
  const leaves = file.data?.data.leaves ?? [];

  const resources = useMemo(
    () => allResources.filter((r) => !/Classroom/i.test(r.acType) && (includeSims || !/_SIM$/i.test(r.acType))),
    [allResources, includeSims],
  );
  const quals = useMemo(() => inferFiQualifications(flights), [flights]);
  const dayFlights = useMemo(() => flights.filter((f) => f.date === date), [flights, date]);

  const ranked = useMemo(() => behindSort(students, date).slice(0, topN), [students, date, topN]);

  const base: AutoRequestBase = useMemo(() => {
    const s = minutesOf(searchStart) ?? 390;
    const e = minutesOf(searchEnd) ?? 1080;
    return {
      date,
      durationMin: duration,
      bufferMin: buffer,
      searchStartMin: s,
      searchEndMin: e,
      runwayClosed: rwyClose ? { startMin: minutesOf(rwyFrom) ?? 0, endMin: minutesOf(rwyTo) ?? 0 } : null,
    };
  }, [date, duration, buffer, searchStart, searchEnd, rwyClose, rwyFrom, rwyTo]);

  const ctxBase: AutoContextBase = useMemo(
    () => ({ dayFlights, resources, leaves, quals }),
    [dayFlights, resources, leaves, quals],
  );

  const proposals = useMemo(
    () => autoPropose(ranked, reservations, base, ctxBase),
    [ranked, reservations, base, ctxBase],
  );

  // Reset reservations whenever the search parameters that would invalidate them change.
  const resetKey = `${date}|${duration}|${buffer}|${searchStart}|${searchEnd}|${rwyClose}|${includeSims}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    if (reservations.length) setReservations([]);
    if (Object.keys(choice).length) setChoice({});
  }

  const reserve = (p: SpProposal, opt: SlotOption) => {
    setReservations((prev) => [
      ...prev,
      {
        studentKey: p.student.key,
        studentName: p.student.name,
        nick: p.student.nick,
        startMin: opt.earliestStart,
        durationMin: duration,
        fi: opt.fi,
        tail: opt.tail,
        aircraftType: opt.aircraftType,
      },
    ]);
  };
  const release = (studentKey: string) => setReservations((prev) => prev.filter((r) => r.studentKey !== studentKey));

  const autoReserveAll = () => {
    // Greedy: reserve each proposable SP in rank order, re-proposing after each so cascade applies.
    let resv = [...reservations];
    for (const student of ranked) {
      if (resv.some((r) => r.studentKey === student.key)) continue;
      const props = autoPropose([student], resv, base, {
        ...ctxBase,
        dayFlights: [...dayFlights],
      });
      const p = props[0];
      if (p.status === 'proposed' && p.best) {
        resv = [
          ...resv,
          { studentKey: student.key, studentName: student.name, nick: student.nick, startMin: p.best.startMin, durationMin: duration, fi: p.best.fi, tail: p.best.tail, aircraftType: p.best.aircraftType },
        ];
      }
    }
    setReservations(resv);
  };

  if (file.isLoading || sLoading) return <LoadingBlock label="loading fleet, schedule & cohort…" />;

  const reservedCount = reservations.length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">Auto Slot Finder</div>
          <div className="mono uc text-[9px] text-ink-3">
            pace-ranked AP-127 SPs · auto-proposed slots · reserve with cascade feedback
          </div>
        </div>
      </div>

      {/* Config */}
      <Panel title="Search parameters">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" /></Field>
          <Field label="Duration"><select value={duration} onChange={(e) => setDuration(+e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink">{DURATIONS.map((d) => (<option key={d} value={d}>{fmtMin(d)} ({d}m)</option>))}</select></Field>
          <Field label="Buffer (both sides)"><select value={buffer} onChange={(e) => setBuffer(+e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink">{BUFFERS.map((b) => (<option key={b} value={b}>{b}m</option>))}</select></Field>
          <Field label="Show top-N SPs"><select value={topN} onChange={(e) => setTopN(+e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink">{TOP_NS.map((n) => (<option key={n} value={n}>{n === 28 ? 'All 28' : `Top ${n}`}</option>))}</select></Field>
          <Field label="Search from"><input type="time" value={searchStart} onChange={(e) => setSearchStart(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" /></Field>
          <Field label="Search to"><input type="time" value={searchEnd} onChange={(e) => setSearchEnd(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" /></Field>
          <Field label="Runway closure"><Chip active={rwyClose} onClick={() => setRwyClose((v) => !v)}>{rwyClose ? 'ON' : 'OFF'}</Chip></Field>
          <Field label="Include SIM devices"><Chip active={includeSims} onClick={() => setIncludeSims((v) => !v)}>{includeSims ? 'ON' : 'OFF'}</Chip></Field>
          {rwyClose && (
            <Field label="Closed window">
              <div className="flex gap-1">
                <input type="time" value={rwyFrom} onChange={(e) => setRwyFrom(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1 py-1 text-[10px] text-ink" />
                <input type="time" value={rwyTo} onChange={(e) => setRwyTo(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1 py-1 text-[10px] text-ink" />
              </div>
            </Field>
          )}
        </div>
        <div className="mono mt-2 text-[9px] text-ink-3">
          Ranked most-behind first (curriculum pace). Aircraft type is auto-matched to each SP's roster type.
          FI qualifications are inferred from real flight history.
        </div>
      </Panel>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active onClick={autoReserveAll} accent="var(--highlight)">⚡ Auto-reserve all proposable</Chip>
        {reservedCount > 0 && <Chip onClick={() => setReservations([])}>Release all ({reservedCount})</Chip>}
        <span className="mono uc ml-auto text-[9px] text-ink-3">{proposals.filter((p) => p.status === 'proposed').length} proposable · {reservedCount} reserved</span>
      </div>

      {/* Dispatcher proposal summary */}
      {reservedCount > 0 && (
        <Panel title="Dispatcher proposal" hint={`${reservedCount} reserved`} bodyClassName="p-0">
          <div className="overflow-x-auto scroll-shadow-x">
            <table className="w-full min-w-[520px] border-collapse text-[10.5px]">
              <thead>
                <tr className="mono uc bg-bg-2 text-[8px] text-ink-3">
                  <th className="px-2 py-1.5 text-left">SP</th>
                  <th className="px-2 text-left">Time</th>
                  <th className="px-2 text-left">FI</th>
                  <th className="px-2 text-left">Tail</th>
                  <th className="px-2 text-left">Type</th>
                  <th className="px-2" />
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.studentKey} className="border-b border-line-soft">
                    <td className="mono px-2 py-1.5 font-semibold text-[var(--highlight)]">{r.nick} · {r.studentName}</td>
                    <td className="mono px-2">{fmtMin(r.startMin)}–{fmtMin(r.startMin + r.durationMin)}</td>
                    <td className="mono px-2 text-ink-2">{r.fi}</td>
                    <td className="mono px-2 text-ink-2">{r.tail}</td>
                    <td className="mono px-2 text-[9px] text-ink-3">{r.aircraftType}</td>
                    <td className="px-2 text-right"><button type="button" onClick={() => release(r.studentKey)} className="mono uc cursor-pointer text-[8.5px] text-ink-3 hover:text-[var(--col-cancel)]">release</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Per-SP proposal cards */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {proposals.map((p) => (
          <SpCard
            key={p.student.key}
            p={p}
            total={ranked.length}
            choice={choice[p.student.key]}
            onChoose={(v) => setChoice((prev) => ({ ...prev, [p.student.key]: v }))}
            onReserve={(opt) => reserve(p, opt)}
            onRelease={() => release(p.student.key)}
          />
        ))}
      </div>

      {!proposals.length && <EmptyState title="No AP-127 students loaded" />}

      <div className="mono uc px-1 text-[8px] text-ink-3">
        Every proposed slot passed: FI type-qualification · runway closure · FI/SP leave · aircraft
        maintenance · FI duty-span (≤7h) · aircraft/FI/SP availability with buffer, plus all current
        reservations. See <Link to="/schedule/gantt" className="underline">Schedule → Gantt</Link> for the live board.
      </div>
    </div>
  );
}

function SpCard({
  p,
  total,
  choice,
  onChoose,
  onReserve,
  onRelease,
}: {
  p: SpProposal;
  total: number;
  choice: string | undefined;
  onChoose: (v: string) => void;
  onReserve: (opt: SlotOption) => void;
  onRelease: () => void;
}) {
  const s = p.student;
  const blocked = p.status !== 'reserved' && p.baselineOptions > 0 && p.currentOptions < p.baselineOptions;
  const chosen: SlotOption | undefined =
    p.best?.options.find((o) => `${o.fi}__${o.tail}` === choice) ?? p.best?.options[0];

  return (
    <div
      className="rounded-lg border bg-surface p-2.5"
      style={{
        borderColor: p.status === 'reserved' ? 'var(--highlight)' : 'var(--line)',
        boxShadow: p.status === 'reserved' ? 'inset 3px 0 0 var(--highlight)' : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="mono num flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold text-[11px]" style={{ color: rankColor(p.rank, total), border: `1px solid ${rankColor(p.rank, total)}` }}>
          {p.rank}
        </span>
        <div className="min-w-0">
          <Link to={`/student/${s.nick}`} className="mono text-[11px] font-bold text-[var(--highlight)] hover:underline">{s.nick}</Link>
          <span className="mono ml-1.5 text-[10px] text-ink-2">{s.name}</span>
        </div>
        <span className="mono ml-auto shrink-0 text-[8.5px] text-ink-3">
          {s.se.replace('DA40-', '')} · {s.done}/{s.total} · idle {p.idle === 9999 ? '—' : `${p.idle}d`}
        </span>
      </div>

      <div className="mt-2">
        {p.status === 'reserved' && p.reservation && (
          <div className="flex items-center gap-2">
            <Tag color="var(--highlight)" filled>★ RESERVED</Tag>
            <span className="mono text-[11px] font-bold text-ink">{fmtMin(p.reservation.startMin)}–{fmtMin(p.reservation.startMin + p.reservation.durationMin)}</span>
            <span className="mono text-[9.5px] text-ink-2">{p.reservation.fi} · {p.reservation.tail}</span>
            <button type="button" onClick={onRelease} className="mono uc ml-auto cursor-pointer rounded border border-line px-2 py-1 text-[8.5px] font-bold text-ink-3 hover:text-[var(--col-cancel)]">Release</button>
          </div>
        )}

        {p.status === 'proposed' && p.best && chosen && (
          <div className="flex flex-wrap items-center gap-2">
            <Tag color="var(--col-done)">PROPOSED</Tag>
            <span className="mono text-[12px] font-bold text-ink">{fmtMin(chosen.earliestStart)}</span>
            <select
              value={`${chosen.fi}__${chosen.tail}`}
              onChange={(e) => onChoose(e.target.value)}
              className="mono max-w-[150px] rounded border border-line bg-bg px-1 py-0.5 text-[9px] text-ink-2"
            >
              {p.best.options.map((o) => (
                <option key={`${o.fi}__${o.tail}`} value={`${o.fi}__${o.tail}`}>{fmtMin(o.earliestStart)} · {o.fi} · {o.tail.replace('HS-', '')}</option>
              ))}
            </select>
            <span className="mono text-[8.5px] text-ink-3">{p.currentOptions} option{p.currentOptions === 1 ? '' : 's'}{blocked && <span style={{ color: 'var(--col-pending)' }}> · −{p.baselineOptions - p.currentOptions} blocked</span>}</span>
            <button type="button" onClick={() => onReserve(chosen)} className="mono uc ml-auto cursor-pointer rounded border border-[var(--highlight)] bg-[var(--highlight-bg)] px-2.5 py-1 text-[8.5px] font-bold text-[var(--highlight)]">Reserve</button>
          </div>
        )}

        {p.status === 'no-slot' && (
          <div className="mono text-[10px]" style={{ color: 'var(--col-cancel)' }}>
            No valid slot{blocked ? ` — all ${p.baselineOptions} option(s) blocked by earlier reservations` : ' with current parameters'}.
          </div>
        )}
        {p.status === 'on-leave' && <div className="mono text-[10px] text-[var(--col-stby)]">On leave this day.</div>}
        {p.status === 'scheduled' && <div className="mono text-[10px] text-ink-3">Already has a flight scheduled this day.</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono uc mb-0.5 text-[8px] text-ink-3">{label}</div>
      {children}
    </div>
  );
}
