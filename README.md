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
| Tests | none | 82 vitest unit/golden-parity tests |
| Mobile | some panels desktop-only | full information parity (Home, Schedule, AP127, Student, Integrity, Aircraft) |

## Structure

```
pipeline/     ingest: fetch upstreams → normalize → validate → diff → write public/data/*.json
src/domain/   pure, tested functions/types shared by pipeline + app (dates, reconcile, pace, utilization…)
src/data/     TanStack Query hooks over public/data/*.json (same-origin/raw-repo, never hits upstream workers)
src/views/    home, schedule, ap127, student, integrity, aircraft (+ stubs for later phases)
tests/        golden-parity tests vs frozen real V2 output
```

## Scope

**Phase 1 (live):** Home, unified Schedule (Day/Gantt/Week/Month/Roster), AP127 Detail (+ time travel),
Student Lens, Data Integrity (cross-check + provenance), Aircraft (Fleet/Utilization/FI Stat/SP Stat).

**Later phases (route stubs reserved, not built):** School Performance, Simulation (ONE unified tab,
not V2's three), Slot Finder (ground-up redesign — V2's constraint logic is not being ported), Watchdog
admin UI (consumes the existing `ap127-watchdog` worker API, unchanged), Tutorial.

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

## Local development

```bash
npm install
npm run dev        # http://localhost:5173, serves public/data (real committed snapshots)
npm test           # vitest — domain + pipeline + golden-parity
npm run typecheck
npm run ingest     # refresh public/data/*.json from live upstreams
npm run build && npm run preview
```

## Deployment

Cloudflare Pages project `ap127-v3` (ap127-v3.pages.dev). `.github/workflows/deploy.yml` builds and
deploys on push to `main` via `wrangler pages deploy`.

**Open item:** the `CLOUDFLARE_API_TOKEN` repo secret has not been set yet (same class of gap this
ecosystem has hit before, e.g. DB001's dispatcher — see AP127_Docs §10). Until it's added, deploy
manually:

```bash
npm run build
npx wrangler pages deploy dist --project-name ap127-v3 --branch main
```

## What must never change

- V2 (`AP127CMD/CMDV2`), CMD_CTR, DB001, the `ap127-data-api` worker, and the `ap127-watchdog` worker
  are **read-only dependencies** — this repo never modifies them.
- The browser never calls upstream workers directly — only same-origin/raw-repo `/data/*.json`
  (protects free-tier worker quotas).
- Hours math uses `durMin` (block time) everywhere; `airborneMin` is display-only.
