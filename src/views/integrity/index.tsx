import { useMemo } from 'react';
import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { useFlights, useStudents } from '@/data/queries';
import { reconcile } from '@/domain/reconcile';

export default function IntegrityView() {
  const { flights, isLoading } = useFlights();
  const { students } = useStudents();
  const res = useMemo(
    () => (flights.length && students.length ? reconcile(flights, students) : null),
    [flights, students],
  );
  if (isLoading || !res) return <LoadingBlock />;
  return (
    <div className="p-4">
      <Panel title="Data Integrity — stub (M8)">
        <div className="flex flex-wrap gap-2">
          <Kpi label="Consistency" value={`${res.totals.consistency}%`} color="var(--col-done)" />
          <Kpi label="OK" value={res.totals.ok} color="var(--col-done)" />
          <Kpi label="Review" value={res.totals.review} color="var(--col-pending)" />
          <Kpi label="Conflicts" value={res.totals.conflict} color="var(--col-cancel)" />
        </div>
      </Panel>
    </div>
  );
}
