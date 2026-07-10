// Tutorial / User Guide — explains every V3 view, the design decisions that
// differ from V2, and the traceability model. Static content, no data fetch.

import { Link } from 'react-router';
import { Panel, Tag } from '@/components/atoms';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'views', label: 'Views' },
  { id: 'traceability', label: 'Data traceability' },
  { id: 'simulated-vs-real', label: 'Simulated vs. real data' },
  { id: 'themes', label: 'Themes & batch colors' },
  { id: 'reconcile', label: 'Cross-check explained' },
  { id: 'mobile', label: 'Mobile tips' },
];

export default function HelpView() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="px-1">
        <div className="font-display text-[18px] font-bold tracking-wider uppercase">User Guide</div>
        <div className="mono uc text-[9px] text-ink-3">AP127 CMD V3 — what everything does, and why it's built this way</div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-1">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="mono uc rounded border border-line bg-surface px-2 py-1 text-[9px] font-semibold text-ink-2 no-underline hover:border-[var(--highlight)] hover:text-[var(--highlight)]">
            {s.label}
          </a>
        ))}
      </div>

      <Panel title="Overview" id="overview">
        <p className="text-[11px] leading-relaxed text-ink-2">
          AP127 CMD V3 is the successor to CMDV2, rebuilt for data traceability and a modern, maintainable
          codebase. <b>CMDV2 stays live and unaffected</b> at ap127-ngt2.pages.dev — V3 is a parallel rollout,
          not a replacement (yet). Both read the same underlying flight-operations and progress data.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-2">
          The headline difference: every number in V3 can tell you where it came from. Look for the <InfoDot /> icon
          next to any KPI, chart, or table header — it opens a popover showing which data snapshot was used, how
          recent it is, and the exact calculation method.
        </p>
      </Panel>

      <Panel title="Views" id="views">
        <div className="flex flex-col gap-2.5">
          <ViewEntry to="/" name="Home" desc="Daily brief: today's KPI strip, schedule pulse, next departures, AP-127 cohort pulse, fleet snapshot, who's on leave, and a data-integrity badge. Everything deep-links to its full view." />
          <ViewEntry to="/schedule" name="Schedule" desc="One shared date + filter state, five layouts: Day (sortable table), Gantt (timeline bars with a live Bangkok NOW-line), Week, Month, Roster (workload heatmap). Switching layouts keeps your date and filters." />
          <ViewEntry to="/ap127" name="AP127 Detail" desc="The full cohort picture: ranking table, pace monitor, pace bands, combined progress-vs-plan chart with 30d/15d projections, batch and individual lead/lag history, race chart, flight timeline, and overall progress. Includes Time Travel — replay the cohort as of any past date." />
          <ViewEntry to="/student" name="Student Lens" desc="One student's operations and progress records merged into a single timeline, with each lesson tagged OK / REVIEW / CONFLICT. Upcoming lessons always show the real scheduled date or 'TBC' — never a guess." />
          <ViewEntry to="/aircraft" name="Aircraft" desc="Fleet status, and utilization heatmaps by tail, instructor, and student — Block, Airborne, or Effective (curriculum-normalized) hours." />
          <ViewEntry to="/performance" name="School Performance" desc="Plan (fixed curriculum baseline) vs. actual flown hours/flights across all four batches, with a scorecard, daily/monthly charts, and a recent-days table." />
          <ViewEntry to="/sim" name="Simulation" desc="A what-if capacity scheduler — Conservative, Balanced, or Realist strategy. Every number here is an explicit projection; it never feeds any other view." />
          <ViewEntry to="/slots" name="Slot Finder" desc="Finds valid flight slots for a student by checking instructor qualification, duty limits, aircraft/instructor/student availability, leave, and runway closures — all independently, so a rejected slot always explains exactly why." />
          <ViewEntry to="/watchdog" name="Watchdog" desc="Status and history for the Telegram flight-change notifier: destinations, the SP-to-Telegram roster mapping, and a searchable notification log." />
          <ViewEntry to="/integrity" name="Data Integrity" desc="The full provenance surface: cross-check (operations vs. progress agreement, with adjustable tolerances), a manifest viewer per data source, and a change-diff view." />
        </div>
      </Panel>

      <Panel title="Data traceability" id="traceability">
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-2">
          <p>
            <b className="text-ink">FreshnessBar</b> (top of every page): three chips — OPS, PROG, NGT — show how long ago
            each data source last actually changed. Green under 2 hours, amber under 6, red beyond. Click it to open
            the Sources tab of Data Integrity.
          </p>
          <p>
            <b className="text-ink">"Data as of" vs. "last checked":</b> snapshots refresh hourly, but a file is only
            re-committed when its content genuinely changes. A quiet upstream (nothing happened) looks "old" by
            design — that's not staleness, it's an accurate record of when something last changed.
          </p>
          <p>
            <b className="text-ink">Source popovers</b> <InfoDot /> — every KPI, chart, and table can show exactly which
            snapshot(s) it reads, how many records, and its calculation method in one click.
          </p>
        </div>
      </Panel>

      <Panel title="Simulated vs. real data — an important rule" id="simulated-vs-real">
        <div className="rounded-md border border-[var(--highlight)] bg-[var(--highlight-bg)] p-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--highlight)' }}>
          A future lesson's date is <b>always</b> the real operations schedule (a Pending flight), or "TBC" when
          nothing is scheduled yet. It is <b>never</b> a projected/simulated date — that kind of projection only
          ever appears inside the Simulation view, clearly labeled as a what-if estimate. This keeps every other
          page trustworthy: if V3 shows you a date, it's a real one.
        </div>
      </Panel>

      <Panel title="Themes & batch colors" id="themes">
        <div className="mb-2 flex gap-1.5">
          <Tag color="var(--ink-2)">Cockpit (dark, default)</Tag>
          <Tag color="var(--ink-2)">Light</Tag>
          <Tag color="var(--ink-2)">Warm</Tag>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag color="var(--batch-ap124)" filled>AP-124</Tag>
          <Tag color="var(--batch-ap126)" filled>AP-126</Tag>
          <Tag color="var(--highlight)" filled>AP-127</Tag>
          <Tag color="var(--batch-ap128)" filled>AP-128</Tag>
          <Tag color="var(--batch-ap129)" filled>AP-129</Tag>
        </div>
        <p className="mt-2 text-[11px] text-ink-2">Switch themes from the top bar (desktop) or the mobile "More" sheet. AP-127's magenta identity is consistent across all three themes.</p>
      </Panel>

      <Panel title="Cross-check explained" id="reconcile">
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-2">
          <p>Operations (the flight schedule) and Progress (the curriculum tracker) are independent systems fed by
            different upstreams. The cross-check engine pairs each AP-127 flown lesson across both sides:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><Tag color="var(--col-done)">OK</Tag> — both sides agree (date within 1 day, duration within 20 minutes).</li>
            <li><Tag color="var(--col-pending)">REVIEW</Tag> — matched, but the date or duration differs beyond tolerance.</li>
            <li><Tag color="var(--col-cancel)">CONFLICT</Tag> — logged on one side only.</li>
          </ul>
          <p>Comparisons only happen within the date window both sources cover — a progress record from before
            operations history began isn't a real conflict, just an uncomparable gap. See <Link to="/integrity" className="underline">Data Integrity</Link> for live tolerance sliders and the full discrepancy list.</p>
        </div>
      </Panel>

      <Panel title="Mobile tips" id="mobile">
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-2">
          <p>Every view here works on mobile with full information parity — nothing exists on desktop that's unreachable on a phone.</p>
          <p>The bottom bar has 4 primary tabs + <b className="text-ink">More</b>, which lists every other view (plus theme and freshness). As views are added, More keeps them all reachable without redesigning the bar.</p>
          <p>Wide tables and heatmaps scroll horizontally — a subtle shadow on the right edge means there are more columns to swipe to.</p>
        </div>
      </Panel>
    </div>
  );
}

function InfoDot() {
  return (
    <span className="mono inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[8px] text-ink-3">i</span>
  );
}

function ViewEntry({ to, name, desc }: { to: string; name: string; desc: string }) {
  return (
    <div>
      <Link to={to} className="mono text-[11px] font-bold text-[var(--highlight)] hover:underline">
        {name}
      </Link>
      <p className="text-[10.5px] leading-relaxed text-ink-2">{desc}</p>
    </div>
  );
}
