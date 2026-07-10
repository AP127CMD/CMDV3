// Slot Finder — GROUND-UP REDESIGN (see domain/slotfinder.ts). Composes
// independent constraint checks instead of one entangled busy-map, and every
// rejected slot can say exactly which rule blocked it via evaluateCandidate.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, EmptyState, LoadingBlock, Panel } from '@/components/atoms';
import { useFlightsFile } from '@/data/queries';
import { bkkToday, minutesOf } from '@/domain/dates';
import {
  findSlots,
  inferFiQualifications,
  type SlotGroup,
  type SlotRequest,
} from '@/domain/slotfinder';

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const DURATIONS = [45, 60, 75, 90, 120, 150, 180, 240];
const BUFFERS = [0, 15, 30, 45, 60];

export default function SlotFinderView() {
  const file = useFlightsFile();
  const today = bkkToday();
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(90);
  const [buffer, setBuffer] = useState(30);
  const [studentName, setStudentName] = useState('');
  const [searchStart, setSearchStart] = useState('06:30');
  const [searchEnd, setSearchEnd] = useState('18:00');
  const [rwyClose, setRwyClose] = useState(false);
  const [rwyFrom, setRwyFrom] = useState('12:00');
  const [rwyTo, setRwyTo] = useState('13:00');
  const [fiFilter, setFiFilter] = useState<string[]>([]);
  const [includeSims, setIncludeSims] = useState(false);

  const flights = file.data?.data.flights ?? [];
  const allResources = file.data?.data.resources ?? [];
  const leaves = file.data?.data.leaves ?? [];

  // "Classroom" is a ground-training resource, never a valid flight slot.
  // SIM devices are real bookable resources but excluded by default (a
  // dispatcher searching for a flight slot usually wants a real aircraft).
  const resources = useMemo(
    () => allResources.filter((r) => !/Classroom/i.test(r.acType) && (includeSims || !/_SIM$/i.test(r.acType))),
    [allResources, includeSims],
  );

  const quals = useMemo(() => inferFiQualifications(flights), [flights]);
  const dayFlights = useMemo(() => flights.filter((f) => f.date === date), [flights, date]);
  const allFIs = useMemo(() => [...quals.keys()].sort(), [quals]);

  const req: SlotRequest | null = useMemo(() => {
    if (!studentName.trim()) return null;
    const s = minutesOf(searchStart);
    const e = minutesOf(searchEnd);
    if (s == null || e == null) return null;
    return {
      date,
      durationMin: duration,
      bufferMin: buffer,
      searchStartMin: s,
      searchEndMin: e,
      stepMin: 15,
      studentKey: studentName.trim().toUpperCase(),
      studentName: studentName.trim(),
      candidateFIs: fiFilter.length ? fiFilter : undefined,
      runwayClosed: rwyClose ? { startMin: minutesOf(rwyFrom) ?? 0, endMin: minutesOf(rwyTo) ?? 0 } : null,
    };
  }, [studentName, date, duration, buffer, searchStart, searchEnd, fiFilter, rwyClose, rwyFrom, rwyTo]);

  const groups: SlotGroup[] = useMemo(() => {
    if (!req) return [];
    return findSlots(req, { dayFlights, resources, leaves, quals })
      .sort((a, b) => a.fi.localeCompare(b.fi) || a.tail.localeCompare(b.tail));
  }, [req, dayFlights, resources, leaves, quals]);

  const groupedByFI = useMemo(() => {
    const m = new Map<string, SlotGroup[]>();
    for (const g of groups) (m.get(g.fi) ?? m.set(g.fi, []).get(g.fi)!).push(g);
    return [...m.entries()];
  }, [groups]);

  if (file.isLoading) return <LoadingBlock label="loading fleet & schedule…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">Slot Finder</div>
          <div className="mono uc text-[9px] text-ink-3">
            ground-up redesign — independent constraint checks, not a port of V2's logic
          </div>
        </div>
      </div>

      <Panel title="Request">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Student">
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. SETASIT P." className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink outline-none" />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Duration">
            <select value={duration} onChange={(e) => setDuration(+e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink">
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{fmtMin(d)} ({d}m)</option>
              ))}
            </select>
          </Field>
          <Field label="Buffer (both sides)">
            <select value={buffer} onChange={(e) => setBuffer(+e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink">
              {BUFFERS.map((b) => (
                <option key={b} value={b}>{b}m</option>
              ))}
            </select>
          </Field>
          <Field label="Search from">
            <input type="time" value={searchStart} onChange={(e) => setSearchStart(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Search to">
            <input type="time" value={searchEnd} onChange={(e) => setSearchEnd(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Runway closure">
            <Chip active={rwyClose} onClick={() => setRwyClose((v) => !v)}>{rwyClose ? 'ON' : 'OFF'}</Chip>
          </Field>
          <Field label="Include SIM devices">
            <Chip active={includeSims} onClick={() => setIncludeSims((v) => !v)}>{includeSims ? 'ON' : 'OFF'}</Chip>
          </Field>
          {rwyClose && (
            <Field label="Closed window">
              <div className="flex gap-1">
                <input type="time" value={rwyFrom} onChange={(e) => setRwyFrom(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1 py-1 text-[10px] text-ink" />
                <input type="time" value={rwyTo} onChange={(e) => setRwyTo(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1 py-1 text-[10px] text-ink" />
              </div>
            </Field>
          )}
        </div>
        <div className="mt-2">
          <div className="mono uc mb-1 text-[8px] text-ink-3">Instructor filter (empty = all qualified)</div>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {allFIs.map((fi) => (
              <Chip key={fi} active={fiFilter.includes(fi)} onClick={() => setFiFilter((f) => (f.includes(fi) ? f.filter((x) => x !== fi) : [...f, fi]))}>
                {fi}
              </Chip>
            ))}
          </div>
        </div>
      </Panel>

      {!studentName.trim() && (
        <EmptyState title="Enter a student name to search" hint="Instructor qualifications are inferred live from real flight history — no hardcoded list to go stale." />
      )}

      {studentName.trim() && groupedByFI.length === 0 && (
        <EmptyState title="No valid slots found" hint="Try a wider search window, a shorter duration, a smaller buffer, or fewer instructor filters." />
      )}

      {groupedByFI.map(([fi, fiGroups]) => (
        <Panel key={fi} title={fi} hint={`${fiGroups.length} aircraft option(s)`}>
          <div className="flex flex-col gap-2">
            {fiGroups.map((g) => (
              <div key={g.tail} className="rounded-md border border-line-soft bg-bg p-2">
                <div className="mono mb-1 flex items-center gap-2 text-[10px] font-bold text-ink">
                  {g.tail}
                  <span className="text-ink-3">{g.aircraftType}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.startRanges.map((r, i) => (
                    <span key={i} className="mono rounded border border-[var(--col-done)] bg-[var(--col-done-bg)] px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: 'var(--col-done)' }}>
                      {fmtMin(r.startMin)}{r.endMin > r.startMin ? `–${fmtMin(r.endMin)}` : ''} start
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <div className="mono uc px-1 text-[8px] text-ink-3">
        Every slot above passed: instructor type-qualification (from flight history) · runway closure ·
        FI/student leave · aircraft maintenance status · FI duty-span (≤7h, one rule, always applied) ·
        aircraft/FI/student availability with your buffer. See <Link to="/schedule/day" className="underline">Schedule</Link> for the live board.
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
