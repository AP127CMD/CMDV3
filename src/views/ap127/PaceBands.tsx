// 3-band ahead/mid/behind split (V2 Pace Bands panel), replacing the plain
// dot-spread. Each band lists its students by call-sign, links to Student Lens.

import { Link } from 'react-router';
import { Panel } from '@/components/atoms';
import type { PaceBand } from '@/domain/pace';

const BAND_COLOR: Record<PaceBand['band'], string> = {
  ahead: 'var(--col-done)',
  mid: 'var(--col-pending)',
  behind: 'var(--col-cancel)',
};
const BAND_LABEL: Record<PaceBand['band'], string> = {
  ahead: 'Ahead',
  mid: 'Mid pack',
  behind: 'Behind',
};

export function PaceBands({ bands }: { bands: PaceBand[] }) {
  if (!bands.length) return null;
  return (
    <Panel title="Pace bands" hint="lessons-done thirds">
      <div className="flex flex-col gap-2">
        {bands.map((b) => (
          <div key={b.band}>
            <div className="mono uc mb-1 flex items-center gap-1.5 text-[8.5px]" style={{ color: BAND_COLOR[b.band] }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: BAND_COLOR[b.band] }} />
              {BAND_LABEL[b.band]} · {b.lo}–{b.hi} lessons · {b.students.length}
            </div>
            <div className="flex flex-wrap gap-1">
              {b.students.map((s) => (
                <Link
                  key={s.catcId}
                  to={`/student/${s.nick}`}
                  className="mono rounded px-1.5 py-0.5 text-[9px] font-semibold no-underline"
                  style={{ color: BAND_COLOR[b.band], background: `color-mix(in oklab, ${BAND_COLOR[b.band]} 14%, transparent)` }}
                >
                  {s.nick}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
