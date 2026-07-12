// Unified Schedule: five layouts over ONE URL-backed state. Date, filters and
// focus persist across layout switches; every state is a shareable link.

import { useState } from 'react';
import { LoadingBlock } from '@/components/atoms';
import { FlightDrawer } from '@/components/FlightDrawer';
import { SourceInfo, METHOD_BLOCK_TIME } from '@/components/SourceInfo';
import type { Flight } from '@/domain/types';
import { useFlightsFile } from '@/data/queries';
import { useScheduleState } from './useScheduleState';
import { ScheduleHeader } from './ScheduleHeader';
import { DayBoard } from './DayBoard';
import { GanttDay } from './GanttDay';
import { WeekGrid } from './WeekGrid';
import { MonthCalendar } from './MonthCalendar';
import { RosterMatrix } from './RosterMatrix';

export default function ScheduleView() {
  const s = useScheduleState();
  const file = useFlightsFile();
  const [drawer, setDrawer] = useState<Flight | null>(null);

  if (s.isLoading) return <LoadingBlock label="loading schedule…" />;
  const leaves = file.data?.data.leaves ?? [];

  return (
    <div>
      <ScheduleHeader
        state={s.state}
        patch={s.patch}
        flights={s.flights}
        allDates={s.allDates}
        activeFilterCount={s.activeFilterCount}
        showDate={s.state.layout !== 'month'}
      />
      <div className="p-3">
        <div className="mono uc mb-2 flex items-center gap-2 px-1 text-[8.5px] text-ink-3">
          {s.state.layout === 'day' || s.state.layout === 'gantt'
            ? `${s.dayFlights.length} flights · ${s.state.date}`
            : s.state.layout === 'roster'
              ? 'workload heatmap'
              : s.state.date.slice(0, 7)}
          <SourceInfo
            refSpec={{
              sources: ['flights'],
              method: METHOD_BLOCK_TIME,
              basis: s.activeFilterCount ? `${s.activeFilterCount} filter(s) active` : 'no filters active',
            }}
            align="left"
          />
        </div>

        {s.state.layout === 'day' && <DayBoard flights={s.dayFlights} hl127={s.state.hl127} onOpen={setDrawer} />}
        {s.state.layout === 'gantt' && (
          <GanttDay flights={s.dayFlights} date={s.state.date} hl127={s.state.hl127} onOpen={setDrawer} />
        )}
        {s.state.layout === 'week' && (
          <WeekGrid
            flights={s.flights}
            date={s.state.date}
            matches={s.matches}
            hl127={s.state.hl127}
            onOpen={setDrawer}
            onPickDay={(d) => s.patch({ date: d, layout: 'day' })}
          />
        )}
        {s.state.layout === 'month' && (
          <MonthCalendar
            flights={s.flights}
            leaves={leaves}
            date={s.state.date}
            matches={s.matches}
            onPickDay={(d) => s.patch({ date: d, layout: 'day' })}
            onOpen={setDrawer}
          />
        )}
        {s.state.layout === 'roster' && (
          <RosterMatrix
            flights={s.flights}
            leaves={leaves}
            date={s.state.date}
            matches={s.matches}
            hl127={s.state.hl127}
            onOpen={setDrawer}
          />
        )}
      </div>
      <FlightDrawer flight={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
