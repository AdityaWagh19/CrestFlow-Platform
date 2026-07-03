import { Decimal, toDecimalString } from '@crestflow/shared';

/**
 * Convert APR to APY using compound interest formula.
 * APY = (1 + APR/n)^n - 1
 * @param apr Annual percentage rate as a decimal string (e.g. "0.05" for 5%)
 * @param compoundingsPerYear Number of compounding periods per year (default 365)
 * @returns APY as a decimal string
 */
export function aprToApy(apr: string, compoundingsPerYear = 365): string {
  const r = new Decimal(apr);
  const n = new Decimal(compoundingsPerYear);

  // APY = (1 + r/n)^n - 1
  const apy = r.div(n).plus(1).pow(n).minus(1);
  return toDecimalString(apy);
}

/**
 * Compute a time-weighted average APY using exponential decay.
 * More recent observations are weighted more heavily.
 * Falls back to spotApy if fewer than 7 historical data points.
 *
 * @param historicalApy Array of historical APY observations sorted oldest-first
 * @param spotApy Current spot APY as fallback
 * @returns TWAP APY as a decimal string
 */
export function computeTwapApy(
  historicalApy: Array<{ apyPercent: string; recordedAt: Date }>,
  spotApy: string,
): string {
  if (historicalApy.length < 7) {
    return toDecimalString(spotApy);
  }

  const lambda = new Decimal('0.9');

  // Sort by date ascending (oldest first) so most recent gets highest weight
  const sorted = [...historicalApy].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  let weightedSum = new Decimal(0);
  let weightSum = new Decimal(0);

  for (const [i, entry] of sorted.entries()) {
    // Weight = lambda^(n - 1 - i), so most recent (last) gets lambda^0 = 1
    const exponent = sorted.length - 1 - i;
    const weight = lambda.pow(exponent);
    weightedSum = weightedSum.plus(new Decimal(entry.apyPercent).mul(weight));
    weightSum = weightSum.plus(weight);
  }

  const twap = weightedSum.div(weightSum);
  return toDecimalString(twap);
}

/**
 * Compute the coefficient of variation (CV) of APY history.
 * CV = standard_deviation / mean
 * Returns null if fewer than 7 data points.
 *
 * @param apyHistory Array of APY values as decimal strings
 * @returns CV as a decimal string, or null if insufficient data
 */
export function computeApyCv(apyHistory: string[]): string | null {
  if (apyHistory.length < 7) {
    return null;
  }

  const values = apyHistory.map((v) => new Decimal(v));
  const n = new Decimal(values.length);

  const mean = values.reduce((sum, v) => sum.plus(v), new Decimal(0)).div(n);

  if (mean.isZero()) {
    return null;
  }

  const variance = values.reduce((sum, v) => sum.plus(v.minus(mean).pow(2)), new Decimal(0)).div(n);

  const sigma = variance.sqrt();
  const cv = sigma.div(mean);

  return toDecimalString(cv);
}

/**
 * Compute excess yield over a baseline.
 *
 * @param netApy Net APY of the opportunity
 * @param baselineApy Baseline APY to compare against
 * @returns Excess yield as a decimal string (can be negative)
 */
export function computeExcessYield(netApy: string, baselineApy: string): string {
  const excess = new Decimal(netApy).minus(new Decimal(baselineApy));
  return toDecimalString(excess);
}
