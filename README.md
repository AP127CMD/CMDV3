# AP127 CMD V3

Unified flight-training command center for the AP127 cohort — successor to
[CMDV2](https://github.com/AP127CMD/CMDV2), rebuilt on a modern typed stack
with an emphasis on **data traceability**. CMDV2 stays live and unaffected;
this is a parallel, additive project.

- **Live:** https://ap127-v3.pages.dev
- **V2 (unaffected, still primary):** https://ap127-ngt2.pages.dev
- **Docs:** https://ap127-docs.pages.dev

## What's different from V2

| | V2 | V3 |
|---|---|---|
| Build | CDN React + Babel Standalone (no-build) | Vite + React 19 + TypeScript |
| Cache-busting | manual `?v=pNN` bump | content-hashed by Vite |
| Data hygiene | browser IIFEs at load time | typed, unit-tested ingest pipeline |
| Data trust | console warnings only | provenance manifest + in-UI lineage popovers |
| Tests | none | 152 vitest unit/golden-parity tests |
| Mobile | some panels desktop-only | full information parity on every view (a scalable bottom-tab + "More" sheet) |
| Simulation | 3 separate tabs (Simulation/Sim2/Sim3) | 1 unified tab, strategy switch |
| Slot Finder | Auto Slot Finder: dispatcher ranking + reserve/release, on an entangled busy-map with a duty-hour exemption patch | Auto Slot Finder rebuilt on independent composable constraint predicates (one duty rule, always applied); same ranking + reserve/release + cascade |
| "Next lesson" dates | sometimes the simulator's projection | always the real ops schedule, or explicit "TBC" — never a simulated guess |

## Structure

```
pipeline/     ingest: fetch upstreams → normalize → validate → diff → write public/data/*.json
src/domain/   pure, tested functions/types shared by pipeline + app (dates, reconcile, pace, utilization, simulation, slotfinder…)
src/data/     TanStack Query hooks over public/data/*.json (same-origin/raw-repo, never hits upstream workers) + a
              dedicated watchdog.ts client for the one external service V3 talks to (see below)
src/views/    home, schedule, ap127, student, aircraft, performance, sim, slots, watchdog, integrity, help
tests/        golden-parity tests vs frozen real V2 output
```

## Views (all 10 phases from the original plan are live, plus Curriculum Prog)

Home (daily brief + full Day Glance analytics: status-mix donut, batch breakdown, instructor load,
AP-127 spotlight table) · Schedule (Day/Gantt/Week/Month/Roster, one URL-shareable state) · AP127 Detail
(ranking, pace monitor, pace bands, combined/race/lead-lag/timeline/overall charts, time travel) ·
Student Lens · Curriculum Prog (per-student plan cards across all 4 batches, full real-record drawer) ·
Aircraft (live Fleet sheet, OPS Cross-Check, Roster, Utilization/FI Stat/SP Stat) · School Performance
(plan vs. real flown records) · Simulation (unified what-if scheduler) · Auto Slot Finder (pace-ranked
SPs, auto-proposed slots, reserve/release with cascade deconfliction, Cards/Timeline layouts) ·
Watchdog admin · Data Integrity (cross-check + full provenance) · User Guide.

## Data pipeline

Read-only mirror of the same three upstreams V2 uses — no new infrastructure, no changes to the
dispatcher chain. Runs hourly (`:25`, offset from V2's `:20`) via `.github/workflows/refresh-data.yml`:

1. `flight-data.js` (CMD_CTR, ops) → dedup (ACTUAL_ONLY twins) + canonicalize → `public/data/flights.json`
2. `ap127-data-api` worker (progress) → roster injection by name → `public/data/progress.json`
3. `cache.json` (DB001, all batches) → `public/data/ngt.json`
4. `public/data/manifest.json` — per-source provenance: content hash, last-real-change timestamp,
   record counts, validation warnings, transform stats, diff vs previous commit

Every number in the app can show **where it came from** via the ⓘ lineage popover on KPIs/charts/tables,
and `/integrity?tab=sources` is the full manifest viewer.

## The one external service: ap127-watchdog

Watchdog's live status/roster/destinations/log come from the existing `ap127-watchdog` Cloudflare
Worker's HTTP API, called directly from the browser (`src/data/watchdog.ts`) — the only place V3 talks
to anything other than its own `/data/*.json`. This required a **one-line CORS allowlist addition** on
that worker (adding `https://ap127-v3.pages.dev`; no business logic touched) — see
`AP127CMD/CMDV2@59cdbd60`. Local dev (`localhost`) is intentionally not in the allowlist, so the
Watchdog view shows a clear "expected in local dev" message there and only works fully once deployed.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173, serves public/data (real committed snapshots)
npm test           # vitest — domain + pipeline + golden-parity (140 tests)
npm run typecheck
npm run ingest     # refresh public/data/*.json from live upstreams
npm run build && npm run preview
```

## Deployment

Cloudflare Pages project `ap127-v3` (ap127-v3.pages.dev). `.github/workflows/deploy.yml` builds and
deploys automatically on push to `main` via `wrangler pages deploy`, using the `CLOUDFLARE_API_TOKEN`
repo secret (set 2026-07-10).

Manual deploy (rarely needed — CI handles pushes to `main`):

```bash
npm run build
npx wrangler pages deploy dist --project-name ap127-v3 --branch main
```

## What must never change

- V2 (`AP127CMD/CMDV2`), CMD_CTR, DB001, and the `ap127-data-api` worker are **read-only dependencies**
  — this repo never modifies them. The one narrow exception is documented above (watchdog CORS).
- The browser never calls upstream data workers directly — only same-origin/raw-repo `/data/*.json`
  (protects free-tier worker quotas). Watchdog's own API is the sole exception, by design.
- Hours math uses `durMin` (block time) everywhere; `airborneMin` is display-only.
- A future lesson's date is always the real ops schedule or explicit "TBC" — never a value from
  `Student.planned[]` (the NGT scheduler's simulated projection), which is reserved for the Simulation
  view only. See `src/domain/upcoming.ts`.
