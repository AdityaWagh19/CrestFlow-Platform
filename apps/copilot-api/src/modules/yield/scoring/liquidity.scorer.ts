import { Decimal } from '@crestflow/shared';

/**
 * Compute a liquidity score (0-100) based on TVL relative to position size
 * and utilization rate.
 *
 * TVL/position ratio scoring:
 * - > 100x = 100
 * - > 50x  = 80
 * - > 20x  = 60
 * - > 10x  = 40
 * - else   = 20
 *
 * Utilization penalty:
 * - > 90% utilization: -20
 * - > 80% utilization: -10
 *
 * @param tvlUsd Total value locked in USD as a decimal string
 * @param positionSizeUsd Position size in USD as a decimal string
 * @param utilizationRate Optional utilization rate as a decimal string (e.g. "0.85" for 85%)
 * @returns Liquidity score from 0 to 100
 */
export function computeLiquidityScore(
  tvlUsd: string,
  positionSizeUsd: string,
  utilizationRate?: string,
): number {
  const tvl = new Decimal(tvlUsd);
  const position = new Decimal(positionSizeUsd);

  // Avoid division by zero
  let baseScore: number;
  if (position.isZero()) {
    baseScore = 100;
  } else {
    const ratio = tvl.div(position).toNumber();

    if (ratio > 100) {
      baseScore = 100;
    } else if (ratio > 50) {
      baseScore = 80;
    } else if (ratio > 20) {
      baseScore = 60;
    } else if (ratio > 10) {
      baseScore = 40;
    } else {
      baseScore = 20;
    }
  }

  // Apply utilization penalty
  let penalty = 0;
  if (utilizationRate !== undefined) {
    const utilization = new Decimal(utilizationRate).toNumber();

    if (utilization > 0.9) {
      penalty = 20;
    } else if (utilization > 0.8) {
      penalty = 10;
    }
  }

  return Math.max(0, baseScore - penalty);
}
