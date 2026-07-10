// Always-visible per-source freshness chips. Ages read from the manifest's
// lastChangedAt ("data as of" — commit-only-on-change semantics; the
// Integrity page explains this). Green <2h, amber <6h, red beyond/failed.

import { Link } from 'react-router';
import { useManifest } from '@/data/queries';
import type { SourceManifest } from '@/domain/types';

function ageMin(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function fmtAge(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function chipColor(m: number | null, failed: boolean): string {
  if (failed || m == null) return 'var(--col-cancel)';
  if (m < 120) return 'var(--col-done)';
  if (m < 360) return 'var(--col-pending)';
  return 'var(--col-cancel)';
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: color }}
    />
  );
}

function SourceChip({ label, m }: { label: string; m: SourceManifest | undefined }) {
  const failed = !!m?.validation.errors.length;
  const a = ageMin(m?.lastChangedAt);
  const color = chipColor(a, failed);
  return (
    <span className="mono flex items-center gap-1 text-[9px] text-ink-3" title={`${label}: data as of ${m?.lastChangedAt ?? 'unknown'}${failed ? ' — last fetch FAILED, snapshot retained' : ''}`}>
      <Dot color={color} pulse={!failed && a != null && a < 120} />
      <span className="uc">{label}</span>
      <span className="text-ink-2">{failed ? '⚠' : fmtAge(a)}</span>
    </span>
  );
}

export function FreshnessBar() {
  const q = useManifest();
  const src = q.data?.data.sources;
  return (
    <Link
      to="/integrity?tab=sources"
      className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-2 py-1 no-underline hover:border-[var(--highlight)]"
      title="Data freshness — click for full provenance"
    >
      {q.isError ? (
        <span className="mono text-[9px]" style={{ color: 'var(--col-cancel)' }}>
          ⚠ DATA OFFLINE
        </span>
      ) : (
        <>
          <SourceChip label="OPS" m={src?.flights} />
          <SourceChip label="PROG" m={src?.progress} />
          <SourceChip label="NGT" m={src?.ngt} />
        </>
      )}
    </Link>
  );
}
