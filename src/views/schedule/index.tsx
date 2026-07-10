import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { useFlights } from '@/data/queries';

export default function ScheduleView() {
  const { flights, isLoading } = useFlights();
  if (isLoading) return <LoadingBlock />;
  const dates = new Set(flights.map((f) => f.date));
  return (
    <div className="p-4">
      <Panel title="Schedule — stub (M4)">
        <div className="flex flex-wrap gap-2">
          <Kpi label="Flights" value={flights.length.toLocaleString()} />
          <Kpi label="Days covered" value={dates.size} />
        </div>
      </Panel>
    </div>
  );
}
