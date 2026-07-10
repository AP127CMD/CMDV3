import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { useFlightsFile } from '@/data/queries';

export default function AircraftView() {
  const q = useFlightsFile();
  if (q.isLoading) return <LoadingBlock />;
  const resources = q.data?.data.resources ?? [];
  const maint = resources.filter((r) => r.isMaint).length;
  return (
    <div className="p-4">
      <Panel title="Aircraft — stub (M9)">
        <div className="flex flex-wrap gap-2">
          <Kpi label="Fleet" value={resources.length} />
          <Kpi label="In maintenance" value={maint} color="var(--col-cancel)" />
        </div>
      </Panel>
    </div>
  );
}
