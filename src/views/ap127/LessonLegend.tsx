// Static lesson-code legend (V2's "Lesson Codes" sidebar panel).

import { Panel } from '@/components/atoms';
import { PHASE_OTHER, lessonPhase } from '@/domain/lessons';

const CODES: Array<{ code: string; label: string }> = [
  { code: 'GL', label: 'General handling' },
  { code: 'IL', label: 'Instrument (local)' },
  { code: 'XV', label: 'Cross-country (visual)' },
  { code: 'XI', label: 'Cross-country (instrument)' },
  { code: 'NL', label: 'Night' },
  { code: 'SP', label: 'Solo / PIC' },
  { code: 'M', label: 'Multi-engine' },
];

export function LessonLegend() {
  return (
    <Panel title="Lesson codes">
      <div className="flex flex-col gap-1">
        {CODES.map((c) => {
          const phase = lessonPhase(c.code);
          return (
            <div key={c.code} className="flex items-center gap-1.5 text-[9.5px]">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: phase.color }} />
              <span className="mono font-bold text-ink-2">{c.code}</span>
              <span className="text-ink-3">{c.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 text-[9.5px]">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PHASE_OTHER.color }} />
          <span className="text-ink-3">Other / ground</span>
        </div>
      </div>
    </Panel>
  );
}
