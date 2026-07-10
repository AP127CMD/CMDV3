// Schedule state lives in the URL — layout in the path, everything else in
// search params — so any view of the schedule is a shareable link and state
// persists across layout switches (the V2 "five views were one schedule"
// consolidation, taken to its conclusion).

import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { bkkToday } from '@/domain/dates';
import { isAP127Batch } from '@/domain/batches';
import type { Flight } from '@/domain/types';
import { useFlights } from '@/data/queries';

export type ScheduleLayout = 'day' | 'gantt' | 'week' | 'month' | 'roster';
export const LAYOUTS: ScheduleLayout[] = ['day', 'gantt', 'week', 'month', 'roster'];

export interface ScheduleState {
  layout: ScheduleLayout;
  date: string;
  q: string;
  batches: string[]; // batchKey values; empty = all
  fis: string[];
  tails: string[];
  statuses: string[];
  showSim: boolean;
  showStandby: boolean;
  showCanceled: boolean;
  hl127: boolean; // AP-127 highlight (dim others)
  only127: boolean; // hide others entirely
}

const csv = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);

export function useScheduleState() {
  const { layout: layoutParam } = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { flights, isLoading, dataUpdatedAt } = useFlights();

  const allDates = useMemo(
    () => [...new Set(flights.map((f) => f.date))].sort(),
    [flights],
  );
  const defaultDate = useMemo(() => {
    const today = bkkToday();
    if (allDates.includes(today)) return today;
    return allDates.find((d) => d >= today) ?? allDates.at(-1) ?? today;
  }, [allDates]);

  const state: ScheduleState = useMemo(
    () => ({
      layout: (LAYOUTS as string[]).includes(layoutParam ?? '') ? (layoutParam as ScheduleLayout) : 'day',
      date: sp.get('date') ?? defaultDate,
      q: sp.get('q') ?? '',
      batches: csv(sp.get('batch')),
      fis: csv(sp.get('fi')),
      tails: csv(sp.get('tail')),
      statuses: csv(sp.get('status')),
      showSim: sp.get('sim') !== '0',
      showStandby: sp.get('stby') !== '0',
      showCanceled: sp.get('cx') !== '0',
      hl127: sp.get('hl') === '1',
      only127: sp.get('only') === '1',
    }),
    [layoutParam, sp, defaultDate],
  );

  const patch = useCallback(
    (p: Partial<ScheduleState>) => {
      const next = new URLSearchParams(sp);
      const setOrDel = (k: string, v: string | null) => {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      };
      if (p.date !== undefined) setOrDel('date', p.date === defaultDate ? null : p.date);
      if (p.q !== undefined) setOrDel('q', p.q);
      if (p.batches !== undefined) setOrDel('batch', p.batches.join(','));
      if (p.fis !== undefined) setOrDel('fi', p.fis.join(','));
      if (p.tails !== undefined) setOrDel('tail', p.tails.join(','));
      if (p.statuses !== undefined) setOrDel('status', p.statuses.join(','));
      if (p.showSim !== undefined) setOrDel('sim', p.showSim ? null : '0');
      if (p.showStandby !== undefined) setOrDel('stby', p.showStandby ? null : '0');
      if (p.showCanceled !== undefined) setOrDel('cx', p.showCanceled ? null : '0');
      if (p.hl127 !== undefined) setOrDel('hl', p.hl127 ? '1' : null);
      if (p.only127 !== undefined) setOrDel('only', p.only127 ? '1' : null);
      if (p.layout !== undefined) {
        navigate({ pathname: `/schedule/${p.layout}`, search: next.toString() ? `?${next}` : '' });
        return;
      }
      setSp(next, { replace: true });
    },
    [sp, setSp, navigate, defaultDate],
  );

  /** The filter predicate every layout shares (V2 dayFlights semantics). */
  const matches = useCallback(
    (f: Flight): boolean => {
      if (!state.showSim && f.isSim) return false;
      if (!state.showStandby && f.isStandby) return false;
      if (!state.showCanceled && f.status === 'Canceled') return false;
      if (state.only127 && !isAP127Batch(f.batch)) return false;
      if (state.batches.length && !state.batches.includes(f.batchKey ?? '')) return false;
      if (state.fis.length && !state.fis.includes(f.instructor ?? '')) return false;
      if (state.tails.length && !state.tails.includes(f.tail ?? '')) return false;
      if (state.statuses.length && !state.statuses.includes(f.status)) return false;
      if (state.q) {
        const q = state.q.toUpperCase();
        const hay = [f.student, f.instructor, f.lesson, f.tail, f.type, f.batch]
          .filter(Boolean)
          .join(' ')
          .toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [state],
  );

  const dayFlights = useMemo(
    () => flights.filter((f) => f.date === state.date && matches(f)),
    [flights, state.date, matches],
  );

  const activeFilterCount =
    state.batches.length +
    state.fis.length +
    state.tails.length +
    state.statuses.length +
    (state.q ? 1 : 0) +
    (state.only127 ? 1 : 0);

  return {
    state,
    patch,
    matches,
    flights,
    dayFlights,
    allDates,
    defaultDate,
    isLoading,
    dataUpdatedAt,
    activeFilterCount,
  };
}
