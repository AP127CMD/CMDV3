import { EmptyState } from '@/components/atoms';

export default function SoonView({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <EmptyState
        title={`${title} — coming in a later phase`}
        hint="This V3 view is planned. Until then, the corresponding V2 view at ap127-ngt2.pages.dev remains fully available."
      />
    </div>
  );
}
