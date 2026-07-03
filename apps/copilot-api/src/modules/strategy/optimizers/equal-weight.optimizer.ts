/**
 * Equal Weight Optimizer — Seed Model (Day 1)
 *
 * The simplest allocation strategy: distribute capital equally among all
 * assets.  This is used as the default model on Day 1 when no historical
 * return data is available for more sophisticated optimizers.
 *
 * Despite its simplicity, equal weighting is a well-studied baseline that
 * often outperforms cap-weighted portfolios (DeMiguel et al., 2009).
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

/**
 * Compute equal-weight allocation across the given symbols.
 *
 * @param symbols  Array of asset symbols to allocate across.
 * @returns        Map of symbol to weight as a decimal string (sums to "1.0").
 */
export function equalWeightOptimize(symbols: string[]): Record<string, string> {
  if (symbols.length === 0) return {};

  const weight = new Decimal('1').div(symbols.length);
  const result: Record<string, string> = {};

  for (const symbol of symbols) {
    result[symbol] = toDecimalString(weight);
  }

  return result;
}
