/**
 * Inverse Volatility (Naive Risk Parity) Optimizer
 *
 * Allocates portfolio weights inversely proportional to each asset's realized
 * volatility.  Assets with lower volatility receive higher weights, producing
 * a portfolio where each asset contributes roughly equal risk.
 *
 * This is the simplest risk-parity approach and serves as a robust baseline
 * when more sophisticated optimizers (HRP, Mean-CVaR) lack sufficient data.
 *
 * Zero-volatility assets receive zero weight.  If all assets have zero
 * volatility, equal weight is used as a fallback.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

/**
 * Compute inverse-volatility weights.
 *
 * @param assetVols  Map of symbol to annualized volatility as a decimal string.
 * @returns          Map of symbol to weight as a decimal string (sums to "1.0").
 */
export function inverseVolOptimize(assetVols: Record<string, string>): Record<string, string> {
  const symbols = Object.keys(assetVols);
  if (symbols.length === 0) return {};

  // Compute inverse volatilities
  const inverses: Record<string, Decimal> = {};
  let totalInverse = new Decimal('0');

  for (const symbol of symbols) {
    const vol = new Decimal(assetVols[symbol]!);
    if (vol.isZero() || vol.isNegative()) {
      inverses[symbol] = new Decimal('0');
    } else {
      const inv = new Decimal('1').div(vol);
      inverses[symbol] = inv;
      totalInverse = totalInverse.plus(inv);
    }
  }

  // If all vols are zero, fall back to equal weight
  if (totalInverse.isZero()) {
    const equalWeight = new Decimal('1').div(symbols.length);
    const result: Record<string, string> = {};
    for (const symbol of symbols) {
      result[symbol] = toDecimalString(equalWeight);
    }
    return result;
  }

  // Normalize to sum to 1.0
  const result: Record<string, string> = {};
  for (const symbol of symbols) {
    const weight = inverses[symbol]!.div(totalInverse);
    result[symbol] = toDecimalString(weight);
  }

  return result;
}
