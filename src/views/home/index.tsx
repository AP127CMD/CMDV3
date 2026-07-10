import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { useFlights, useStudents } from '@/data/queries';

export default function HomeView() {
  const { flights, isLoading } = useFlights();
  const { students } = useStudents();
  if (isLoading) return <LoadingBlock />;
  return (
    <div className="p-4">
      <Panel title="Home — stub (M5)">
        <div className="flex flex-wrap gap-2">
          <Kpi label="Flights loaded" value={flights.length.toLocaleString()} color="var(--col-pending)" />
          <Kpi label="AP127 students" value={students.length} color="var(--highlight)" />
        </div>
      </Panel>
    </div>
  );
}
