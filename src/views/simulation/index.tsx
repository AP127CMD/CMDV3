// Unified Simulation — ONE tab consolidating V2's three separate schedulers
// (Simulation/Sim2/Sim3) behind a single strategy switch. Every number here
// is explicitly a projection, clearly labeled as such — this is the ONLY
// place in the app where a simulated schedule is legitimate to compute or
// show (see domain/upcoming.ts for why every other view must not).

import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chip, Kpi, LoadingBlock, Panel } from '@/components/atoms';
import { ChartCard, useChartDefaults } from '@/components/charts';
import { useNgtFile } from '@/data/queries';
import { bkkToday, addDays } from '@/domain/dates';
import {
  DEFAULT_REALISM,
  SIM_BATCHES,
  applyExaminerDrag,
  defaultSimConfig,
  runScheduler,
  type SchedulingStrategy,
  type SimBatch,
  type SimConfig,
  type SimStudent,
} from '@/domain/simulation';

const BATCH_HEX: Record<SimBatch, string> = {
  AP124: '#4ba3f7',
  AP126: '#7acf7e',
  AP127: '#e88aff',
  AP129: '#e9bd63',
};

const STRATEGY_LABEL: Record<SchedulingStrategy, string> = {
  conservative: 'Conservative — fixed priority order',
  balanced: 'Balanced — weighted allocation',
  realist: 'Realist — fleet/instructor/weather constrained',
};

export default function SimulationView() {
  const ngt = useNgtFile();
  const today = bkkToday();
  const [cfg, setCfg] = useState<SimConfig>(() => defaultSimConfig(addDays(today, 1)));
  const [ap129Start, setAp129Start] = useState(() => addDays(today, 30));

  const data = ngt.data?.data;

  const batches: Record<SimBatch, SimStudent[]> = useMemo(() => {
    if (!data) return { AP124: [], AP126: [], AP127: [], AP129: [] };
    const map = (rows: Array<{ catcId: string; name: string; done: number; total: number }> = []) =>
      rows.map((s) => ({ key: s.catcId, name: s.name, done: s.done, total: s.total }));
    return {
      AP124: map(data.batches.ap124 as any),
      AP126: map(data.batches.ap126 as any),
      AP127: map(data.batches.ap127 as any),
      AP129: map(data.batches.ap129 as any),
    };
  }, [data]);

  const curricula = useMemo(
    () =>
      data
        ? { AP124: data.curricula.cur124 ?? [], AP126: data.curricula.cur126 ?? [], AP127: data.curricula.cur127 ?? [], AP129: [] }
        : { AP124: [], AP126: [], AP127: [], AP129: [] },
    [data],
  );

  const result = useMemo(() => {
    if (!data) return null;
    return runScheduler(cfg, batches, curricula, ap129Start);
  }, [data, cfg, batches, curricula, ap129Start]);

  const activeStudents = SIM_BATCHES.reduce((a, b) => a + batches[b].length, 0);
  const finishByBatch = useMemo(() => {
    if (!result) return null;
    if (cfg.strategy !== 'realist' || !cfg.realism) return result.finishByBatch;
    const dragged: Record<SimBatch, string | null> = { AP124: null, AP126: null, AP127: null, AP129: null };
    for (const b of SIM_BATCHES) dragged[b] = applyExaminerDrag(result.finishByBatch[b], cfg.realism, activeStudents);
    return dragged;
  }, [result, cfg.strategy, cfg.realism, activeStudents]);

  const defs = useChartDefaults();

  if (ngt.isLoading || !data || !result || !finishByBatch) return <LoadingBlock label="loading curriculum data…" />;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div>
          <div className="font-display text-[18px] font-bold tracking-wider uppercase">Simulation</div>
          <div className="mono uc text-[9px] text-ink-3">what-if capacity scheduler — projection only, not a real schedule</div>
        </div>
      </div>

      <div className="rounded-md border border-[var(--col-pending)] bg-[var(--col-pending-bg)] px-3 py-2 text-[10.5px]" style={{ color: 'var(--col-pending)' }}>
        Every date and finish estimate below is a SIMULATED projection from the parameters you set — it is never used
        elsewhere in this app. Real "next lesson" dates always come from the live operations schedule (see AP127
        Detail / Student Lens).
      </div>

      {/* Strategy selector */}
      <Panel title="Strategy">
        <div className="flex flex-wrap gap-1.5">
          {(['conservative', 'balanced', 'realist'] as SchedulingStrategy[]).map((s) => (
            <Chip
              key={s}
              active={cfg.strategy === s}
              onClick={() =>
                setCfg((c) => ({ ...c, strategy: s, realism: s === 'realist' ? (c.realism ?? DEFAULT_REALISM) : c.realism }))
              }
            >
              {s}
            </Chip>
          ))}
        </div>
        <div className="mono mt-1.5 text-[9.5px] text-ink-3">{STRATEGY_LABEL[cfg.strategy]}</div>
      </Panel>

      {/* Shared config */}
      <Panel title="Shared parameters">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Start date">
            <input type="date" value={cfg.startDate} onChange={(e) => setCfg((c) => ({ ...c, startDate: e.target.value }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Horizon (days)">
            <input type="number" value={cfg.horizonDays} min={30} max={1000} onChange={(e) => setCfg((c) => ({ ...c, horizonDays: +e.target.value }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Weekday cap (flights)">
            <input type="number" value={cfg.weekdayCap} min={0} onChange={(e) => setCfg((c) => ({ ...c, weekdayCap: +e.target.value }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Weekend cap">
            <input type="number" value={cfg.weekendCap} min={0} onChange={(e) => setCfg((c) => ({ ...c, weekendCap: +e.target.value }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Holiday cap">
            <input type="number" value={cfg.holidayCap} min={0} onChange={(e) => setCfg((c) => ({ ...c, holidayCap: +e.target.value }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="AP129 start">
            <input type="date" value={ap129Start} onChange={(e) => setAp129Start(e.target.value)} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
          </Field>
          <Field label="Rest regulation">
            <Chip active={cfg.restRegulation} onClick={() => setCfg((c) => ({ ...c, restRegulation: !c.restRegulation }))}>
              {cfg.restRegulation ? 'ON (2d after ≥120min)' : 'OFF'}
            </Chip>
          </Field>
        </div>
      </Panel>

      {/* Strategy-specific panel */}
      {cfg.strategy === 'balanced' && (
        <Panel title="Batch weights" hint="higher = more slots per eligible student">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SIM_BATCHES.map((b) => (
              <Field key={b} label={b}>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.5}
                  value={cfg.batchWeights[b]}
                  onChange={(e) => setCfg((c) => ({ ...c, batchWeights: { ...c.batchWeights, [b]: +e.target.value } }))}
                  className="w-full accent-[var(--highlight)]"
                />
                <div className="mono num text-[9px] text-ink-2">{cfg.batchWeights[b].toFixed(1)}×</div>
              </Field>
            ))}
          </div>
        </Panel>
      )}

      {cfg.strategy === 'realist' && cfg.realism && (
        <Panel title="Realism factors" hint="reduces effective daily capacity + inflates curriculum">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Fleet size">
              <input type="number" value={cfg.realism.fleetSize} min={1} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, fleetSize: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Fleet availability">
              <input type="number" value={cfg.realism.availability} min={0} max={1} step={0.05} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, availability: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Instructors">
              <input type="number" value={cfg.realism.instructors} min={1} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, instructors: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Instructor availability">
              <input type="number" value={cfg.realism.instructorAvail} min={0} max={1} step={0.05} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, instructorAvail: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Washback rate">
              <input type="number" value={cfg.realism.washbackRate} min={0} max={0.6} step={0.05} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, washbackRate: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Check pass rate">
              <input type="number" value={cfg.realism.checkPassRate} min={0.3} max={1} step={0.05} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, checkPassRate: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Examiner slots/wk">
              <input type="number" value={cfg.realism.examinerSlotsPerWeek} min={1} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, examinerSlotsPerWeek: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
            <Field label="Check gates">
              <input type="number" value={cfg.realism.checkGates} min={1} onChange={(e) => setCfg((c) => ({ ...c, realism: { ...c.realism!, checkGates: +e.target.value } }))} className="mono w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink" />
            </Field>
          </div>
        </Panel>
      )}

      {/* Results */}
      <Panel title="Projected finish dates" hint={`${result.atRiskCount} student(s) not finished within horizon`}>
        <div className="flex flex-wrap gap-1.5">
          {SIM_BATCHES.map((b) => (
            <Kpi key={b} label={b} value={finishByBatch[b] ?? '— (beyond horizon)'} color={BATCH_HEX[b]} />
          ))}
          <Kpi label="Overall" value={[...SIM_BATCHES].map((b) => finishByBatch[b]).filter(Boolean).sort().at(-1) ?? '—'} color="var(--highlight)" />
        </div>
      </Panel>

      <ChartCard
        title="Monthly capacity consumed"
        refSpec={{ sources: ['ngt'], basis: `${cfg.strategy} strategy, projected forward from ${cfg.startDate}`, method: 'This is a simulation — not the real schedule.' }}
        height={260}
      >
        <Bar
          data={{
            labels: result.monthly.map((m) => m.month),
            datasets: SIM_BATCHES.map((b) => ({
              label: b,
              data: result.monthly.map((m) => m.byBatch[b]),
              backgroundColor: BATCH_HEX[b],
              stack: 'm',
            })),
          }}
          options={{
            ...defs.base,
            scales: {
              x: { ...defs.base.scales.x, stacked: true },
              y: { ...defs.base.scales.y, stacked: true, title: { display: true, text: 'flights', color: defs.theme.ink3, font: { family: 'JetBrains Mono', size: 8 } } },
            },
          }}
        />
      </ChartCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono uc mb-0.5 text-[8px] text-ink-3">{label}</div>
      {children}
    </div>
  );
}
