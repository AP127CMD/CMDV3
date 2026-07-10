// Batch normalization — the SAME tolerant rule everywhere (V2 p95 I2 fix:
// the AP-127 focus filter and Cross-Check must classify batches identically).

export const HIGHLIGHT_BATCH = 'AP-127';

/** "AP-127" / "AP 127" / "ap127 " → "AP127". */
export function normBatch(b: string | null | undefined): string {
  return String(b ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

export function isAP127Batch(b: string | null | undefined): boolean {
  return normBatch(b).includes('AP127');
}

/** CSS variable for a batch's identity color (AP-127 magenta reserved). */
export function batchColorVar(b: string | null | undefined): string {
  const k = normBatch(b);
  if (k.includes('AP124')) return 'var(--batch-ap124)';
  if (k.includes('AP126')) return 'var(--batch-ap126)';
  if (k.includes('AP127')) return 'var(--batch-ap127)';
  if (k.includes('AP128')) return 'var(--batch-ap128)';
  if (k.includes('AP129')) return 'var(--batch-ap129)';
  return 'var(--ink-3)';
}
