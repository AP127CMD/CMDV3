# CMDV3 — Claude Code Context

## What this project is
AP127 CMD V3 — successor to CMDV2, built on Vite+React+TypeScript for sustainability and data
traceability. **Additive only — never modify CMDV2, CMD_CTR, DB001, or their workers.**
GitHub: `AP127CMD/CMDV3` | Live: https://ap127-v3.pages.dev | Local: `/Users/nugui/AP127_V3/`

## Verify actual state — run before starting
```bash
git log --oneline -10                              # last real changes
npm test 2>&1 | tail -6                             # 82 tests should pass
grep -c '"flights"' public/data/manifest.json       # confirm manifest is intact
cat public/data/manifest.json | python3 -c "import json,sys; m=json.load(sys.stdin); print(m['generatedAt'])"
```

## Key facts — things that trip up new sessions
- **Directory discipline**: this repo is `/Users/nugui/AP127_V3`. `/Users/nugui` itself is ALSO a git
  repo (a personal one, never commit into it — always confirm `pwd` before `git add -A`).
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
- **Mobile is not a final pass** — every view was built and verified at both 1280px and 375px per
  milestone. `scroll-shadow-x` class marks every horizontally-scrollable table so the swipe affordance
  is discoverable; `Kpi` sub-text wraps rather than truncates. Keep this pattern for new components.
- **Hours = block time, always.** `durMin` is the only field summed for hours; `airborneMin` is
  reference-only. This is tested (`kpis.test.ts`, `utilization.test.ts`) and documented in every
  `SourceInfo` popover that shows hours.

## Later phases (route stubs exist, not implemented)
`/performance` `/sim` `/slots` `/watchdog` — see `src/views/soon.tsx`. Per user direction: Simulation
should ship as ONE unified tab (not V2's three Simulation/Sim2/Sim3), and Slot Finder is a ground-up
redesign — do NOT port V2's `view-slotfinder.js`/`view-autoslotfinder.js` logic, its constraint model
is considered imperfect.

## Master reference
Full ecosystem architecture, deploy steps, secrets: https://ap127-docs.pages.dev (§2.10)
