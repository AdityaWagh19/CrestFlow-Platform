/**
 * Lightweight Cross-Sectional Momentum Overlay
 *
 * Applies a +/-2% absolute tilt to portfolio weights based on 14-day return sign.
 * Assets with positive 14D returns receive +2%, negative receive -2%.
 * Weights are clamped to zero (never negative) and renormalized to sum = 1.0.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

const TILT_AMOUNT = new Decimal('0.02');

/**
 * Apply momentum overlay to target weights.
 *
 * @param weights   Current target weights keyed by asset symbol (decimal strings summing to 1.0)
 * @param assetReturns14d  14-day returns keyed by asset symbol (decimal strings, e.g. "0.05" = +5%)
 * @returns Adjusted weights summing to 1.0, never negative
 */
export function applyMomentumOverlay(
  weights: Record<string, string>,
  assetReturns14d: Record<string, string>,
): Record<string, string> {
  const adjusted = new Map<string, Decimal>();

  for (const [asset, weight] of Object.entries(weights)) {
    let w = new Decimal(weight);
    const ret = assetReturns14d[asset];

    if (ret !== undefined) {
      const retValue = new Decimal(ret);
      if (retValue.gt(0)) {
        w = w.plus(TILT_AMOUNT);
      } else if (retValue.lt(0)) {
        w = w.minus(TILT_AMOUNT);
      }
      // zero return: no tilt
    }

    // Clamp to zero — weights must never be negative
    adjusted.set(asset, Decimal.max(new Decimal(0), w));
  }

  // Renormalize to sum = 1.0
  const total = [...adjusted.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const result: Record<string, string> = {};

  if (total.gt(0)) {
    for (const [asset, val] of adjusted.entries()) {
      result[asset] = toDecimalString(val.div(total));
    }
  } else {
    // Edge case: all weights zeroed out — fall back to equal weight
    const count = adjusted.size;
    for (const asset of adjusted.keys()) {
      result[asset] = toDecimalString(new Decimal(1).div(count));
    }
  }

  return result;
}
