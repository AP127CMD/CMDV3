import { LoadingBlock, Panel } from '@/components/atoms';
import { useStudents } from '@/data/queries';

export default function StudentView() {
  const { students, isLoading } = useStudents();
  if (isLoading) return <LoadingBlock />;
  return (
    <div className="p-4">
      <Panel title="Student Lens — stub (M7)">
        <div className="mono text-[10px] text-ink-2">{students.map((s) => s.nick).join(' · ')}</div>
      </Panel>
    </div>
  );
}
