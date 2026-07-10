import { Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { useStudents } from '@/data/queries';

export default function Ap127View() {
  const { students, curriculum, isLoading } = useStudents();
  if (isLoading) return <LoadingBlock />;
  const done = students.reduce((a, s) => a + s.done, 0);
  return (
    <div className="p-4">
      <Panel title="AP127 Detail — stub (M6)">
        <div className="flex flex-wrap gap-2">
          <Kpi label="Students" value={students.length} color="var(--highlight)" />
          <Kpi label="Lessons done" value={done} color="var(--col-done)" />
          <Kpi label="Curriculum" value={curriculum.length} />
        </div>
      </Panel>
    </div>
  );
}
