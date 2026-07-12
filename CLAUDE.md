# CMDV3 — Claude Code Context

## What this project is
AP127 CMD V3 — successor to CMDV2, built on Vite+React+TypeScript for sustainability and data
traceability. **Additive only — never modify CMDV2, CMD_CTR, DB001, or their workers** (one narrow,
user-approved exception: the ap127-watchdog worker's CORS allowlist — see below).
GitHub: `AP127CMD/CMDV3` | Live: https://ap127-v3.pages.dev | Local: `/Users/nugui/AP127_V3/`

## Verify actual state — run before starting
```bash
git log --oneline -10                              # last real changes
npm test 2>&1 | tail -6                             # 179 tests should pass
grep -c '"flights"' public/data/manifest.json       # confirm manifest is intact
cat public/data/manifest.json | python3 -c "import json,sys; m=json.load(sys.stdin); print(m['generatedAt'])"
```

## Key facts — things that trip up new sessions
- **Directory discipline**: this repo is `/Users/nugui/AP127_V3`. `/Users/nugui` itself is ALSO a git
  repo (a personal one, never commit into it — always confirm `pwd` before `git add -A`). Also watch for
  a leftover `cd` into `AP127_V2/watchdog` (needed for worker deploys) — return to this repo before any
  git operation here.
- **Deploy**: CF Pages project `ap127-v3`. `.github/workflows/deploy.yml` auto-deploys on push to `main`
  using the `CLOUDFLARE_API_TOKEN` repo secret (set 2026-07-10). Manual fallback: `npm run build &&
  npx wrangler pages deploy dist --project-name ap127-v3 --branch main`.
- **Data ingest**: `.github/workflows/refresh-data.yml` runs hourly at :25. `npm run ingest` runs it
  locally. Never make a single upstream source's failure fatal (per-source isolation is load-bearing —
  see pipeline/ingest.ts).
- **Domain layer is the source of truth**: `src/domain/*` is pure, tested, and shared between the
  pipeline and the app. If you change a calculation, change it there — never duplicate logic in a view.
- **Golden parity tests** (`tests/golden-parity.test.ts`) compare V3's pipeline output against V2's
  actual browser code (frozen fixtures in `tests/fixtures/`, captured 2026-07-10). If V2's logic changes
  in a way that matters, refresh the fixtures — but the point of this suite is that V3's numbers must
  never silently drift from V2's proven ones for shared calculations (dedup, reconcile).
- **Mobile is not a final pass** — every view is built and verified at both 1280px and 375px per
  milestone. `scroll-shadow-x` class marks every horizontally-scrollable table so the swipe affordance
  is discoverable; `Kpi` sub-text wraps rather than truncates. The mobile bottom bar has 4 primary tabs
  + a "More" sheet (`AppShell.tsx`, `MOBILE_PRIMARY`/`ALL_NAV`) that lists every other view — when adding
  a new view, add it to `NAV_MAIN` (or `NAV_SOON` if not yet built) and it's automatically reachable on
  mobile via More; don't add fixed bottom-bar slots, that ceiling was hit once already.
- **Hours = block time, always.** `durMin` is the only field summed for hours; `airborneMin` is
  reference-only. Tested (`kpis.test.ts`, `utilization.test.ts`) and documented in every `SourceInfo`
  popover that shows hours.
- **"Next lesson" dates are ALWAYS real, never simulated.** `src/domain/upcoming.ts` is the single
  source of truth: a remaining lesson's date comes from a real Pending ops flight, or shows "TBC". Never
  read `Student.planned[]` (the NGT scheduler's simulated projection) to display a date anywhere outside
  the Simulation view — see `types.ts`'s comment on that field and `pipeline/transform.ts`. This was a
  real bug found and fixed in Student Lens; don't reintroduce it in new views.
- **Slot Finder is the AUTO Slot Finder, not a manual lookup** (`src/views/slots`, `src/domain/autoslot.ts`).
  It ranks AP-127 SPs by pace (behindSort), auto-proposes each one's earliest valid slot, and reserves
  them with cascade deconfliction (a reservation becomes a synthetic busy flight for everyone searched
  after it). It sits ON TOP of the composable constraint engine (`src/domain/slotfinder.ts`) — don't
  confuse the two; slotfinder.ts is the predicates, autoslot.ts is the dispatcher workflow. An earlier
  build shipped only the manual single-lookup; the user corrected that.
- **Home is the full V2 Day Glance**, not a lighter brief: status-mix donut (`StatusDonut.tsx`, inline
  SVG), batch breakdown, instructor load, and the AP-127 spotlight table are all present, powered by
  tested `batchBreakdown`/`instructorLoad`/`tailUsage` in `kpis.ts`. An earlier build dropped these; the
  user flagged them as missed features. Keep Home rich.
- **Every V2 view now has a V3 counterpart** — the last three to land were Ops Analytics
  (`views/analytics`, V2 SummaryBoard), School Analysis (`views/analysis` + tested
  `domain/analysis.ts`), and Watchdog's ☁ CF Usage tab (V2's cfusage view; same X-API-Key as the
  test panel). Nav also honors V2's `?g=students` / `?g=instructors` share presets (AppShell,
  session-sticky; any other `?g=` clears). If a "V3 is missing X from V2" report comes in, check
  V2's `js/shell.js` GROUPS nav + the registry() map first — that's the authoritative view list.
- **ChartCard self-heals zero-width mounts** (`components/charts.tsx`): a chart created while its
  container measures 0px keeps its bars at the origin (V2's observeChartResize problem). ChartCard
  always renders, and if the wrapper measured 0 at mount it RAF-polls briefly and remounts the chart
  once real width appears. Do NOT replace this with a render-gate on ResizeObserver — that deadlocks
  blank in environments where RO never fires (the embedded preview browser does exactly this).
- **Numeric datalabels on charts are OFF by default app-wide** (`chartjs-plugin-datalabels`, registered
  once in `components/charts.tsx`, defaulted off via `useChartDefaults()`'s `base.plugins.datalabels`) —
  matches V2's `copts()` rule. The ONLY charts that opt in are School Performance's 3 stacked bars
  (`views/performance/index.tsx`: Daily/Monthly hours label segments ≥0.5h 1dp, Recent-days-flights
  labels any non-zero integer count) — same threshold/format as V2. Don't turn datalabels on elsewhere
  without checking with the user first; V2 deliberately keeps every other chart tooltip-only.
- **AP127 Detail's Race chart student filter is per-student TOGGLE BUTTONS, not a dropdown**
  (`views/ap127/RaceChart.tsx`) — a wrapping row below the chart, one button per SP, click to solo/
  click again for ALL (V2's `d127-race-toggles` exactly). It also renders a dashed "Planned target"
  line (cumulative curriculum lessons/hours by `plannedDate`) — don't drop either when touching this
  chart; both were explicitly requested after an earlier build shipped a single `<select>` and no
  planned-target line.
- **Aircraft's Fleet + OPS Cross-Check tabs fetch a live Google Sheet CSV directly** (`src/data/fleetSheet.ts`,
  same public `/pub?...output=csv` URL V2 uses) — the SECOND deliberate exception to "V3 only fetches its
  own /data/*.json" (after Watchdog), because the sheet is ops-hand-edited throughout the day and mirroring
  it through the hourly pipeline would show stale maintenance/cert status. Parsing is pure/tested in
  `src/domain/fleetSheet.ts`. The old ops-resource-derived roster/type breakdown is now the "Roster" tab
  (`fleet` was renamed `sheet`/`crosscheck`/`roster` — don't confuse the tab ids).
- **Curriculum Prog** (`src/views/curriculum`, `/curriculum`) is the ONLY view spanning all 4 batches at
  the student-card level. AP127 students come from the roster-merged `Student[]` (progress.json); AP124/
  126/129 come from `ngt.json`'s `batches.ap124/ap126/ap129` (`NgtBatchStudent[]` — no nick/fi/se, matching
  V2's own AP127-only roster scope). `domain/curriculumProg.ts` merges the two shapes and provides a
  batch-agnostic version of the real-ops-only upcoming-lesson rule — don't use `domain/upcoming.ts` here,
  it's hardcoded to AP127.
- **Watchdog talks to a live external worker** (`src/data/watchdog.ts`, `ap127-watchdog.anusorn-tanmetha.workers.dev`)
  — the only exception to "V3 only fetches its own /data/*.json". Its CORS allowlist only permits
  `ap127-v3.pages.dev` (added in `AP127CMD/CMDV2@59cdbd60`, user-approved) — **not** localhost, so the
  Watchdog view always shows a "cannot reach" message in local dev. That's expected, not a bug; verify
  Watchdog changes against the deployed site.
- **Chart.js linear-scale y-axis tick gotcha**: the default tick generator starts at `min` and steps by
  `stepSize`, which can land on non-integer values (e.g. `min:0.5` → ticks at 0.5, 1.5, 2.5…) that never
  match an integer-keyed label lookup. Found in `FlightTimeline.tsx`; fixed via `afterBuildTicks` forcing
  exact tick positions. Watch for this pattern in any future custom-axis chart.

## Master reference
Full ecosystem architecture, deploy steps, secrets: https://ap127-docs.pages.dev (§2.10)
