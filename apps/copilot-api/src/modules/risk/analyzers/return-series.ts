/**
 * Return Series Extractor
 * Converts portfolio snapshot history into a daily return series
 * for quantitative risk analyzers.
 */

import { Decimal } from '@crestflow/shared';

/**
 * Extract return series from snapshot history.
 * Input: snapshots ordered newest first (as returned by Prisma).
 * Output: returns[] oldest first (chronological order).
 */
export function extractReturnSeries(
  snapshots: { totalValueUsd: string; snapshotAt: Date }[],
): number[] {
  if (snapshots.length < 2) return [];

  // Sort oldest → newest
  const sorted = [...snapshots].sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());

  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevSnap = sorted[i - 1];
    const currSnap = sorted[i];
    if (!prevSnap || !currSnap) continue;
    const prev = new Decimal(prevSnap.totalValueUsd);
    const curr = new Decimal(currSnap.totalValueUsd);
    if (prev.isZero()) continue;
    returns.push(curr.minus(prev).div(prev).toNumber());
  }
  return returns;
}
