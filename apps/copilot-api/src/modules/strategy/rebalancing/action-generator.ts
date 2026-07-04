/**
 * Rebalancing Action Generator
 *
 * Computes per-asset rebalancing actions with deviation thresholds that
 * widen during high-volatility regimes to avoid unnecessary churn.
 *
 * Base threshold: 8% deviation triggers rebalancing.
 * High-vol threshold: 12% when realized 30D vol > 60%.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

// ── Thresholds ────────────────────────────────────────────────────────────────

const BASE_THRESHOLD_PCT = 8;
const HIGH_VOL_THRESHOLD_PCT = 12;
const HIGH_VOL_REGIME_PCT = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RebalancingAction {
  assetSymbol: string;
  currentWeightPercent: string; // DECIMAL — e.g. "34.50"
  targetWeightPercent: string; // DECIMAL
  deltaPercent: string; // DECIMAL — signed
  currentValueUsd: string; // DECIMAL
  targetValueUsd: string; // DECIMAL
  deltaUsd: string; // DECIMAL — signed
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  action: 'INCREASE' | 'DECREASE' | 'HOLD';
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generate rebalancing actions for each asset.
 *
 * @param currentWeights     Current portfolio weights (decimal strings summing to ~1.0)
 * @param targetWeights      Target portfolio weights (decimal strings summing to 1.0)
 * @param positionValues     Current USD value per asset (decimal strings)
 * @param portfolioTotalUsd  Total portfolio value in USD (decimal string)
 * @param realizedVol30dPercent  30-day annualized volatility percentage (decimal string, e.g. "45.30"), or null
 * @returns Rebalancing actions sorted by |delta| descending
 */
export function generateRebalancingActions(
  currentWeights: Record<string, string>,
  targetWeights: Record<string, string>,
  positionValues: Record<string, string>,
  portfolioTotalUsd: string,
  realizedVol30dPercent: string | null,
): RebalancingAction[] {
  const total = new Decimal(portfolioTotalUsd);

  // Determine threshold based on volatility regime
  const vol = realizedVol30dPercent !== null ? new Decimal(realizedVol30dPercent).toNumber() : 0;
  const threshold = vol > HIGH_VOL_REGIME_PCT ? HIGH_VOL_THRESHOLD_PCT : BASE_THRESHOLD_PCT;

  // Collect all asset symbols from both current and target
  const allAssets = new Set([...Object.keys(currentWeights), ...Object.keys(targetWeights)]);

  const actions: RebalancingAction[] = [];

  for (const asset of allAssets) {
    const currentW = new Decimal(currentWeights[asset] ?? '0');
    const targetW = new Decimal(targetWeights[asset] ?? '0');
    const delta = targetW.minus(currentW);
    const deltaPct = delta.mul(100);
    const absDeltaPct = deltaPct.abs().toNumber();

    const currentVal = new Decimal(positionValues[asset] ?? '0');
    const targetVal = total.mul(targetW);
    const deltaVal = targetVal.minus(currentVal);

    // Determine action
    let action: 'INCREASE' | 'DECREASE' | 'HOLD';
    if (absDeltaPct < threshold) {
      action = 'HOLD';
    } else if (delta.gt(0)) {
      action = 'INCREASE';
    } else {
      action = 'DECREASE';
    }

    // Determine urgency based on deviation magnitude
    let urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    if (absDeltaPct >= 25) {
      urgency = 'CRITICAL';
    } else if (absDeltaPct >= 15) {
      urgency = 'HIGH';
    } else if (absDeltaPct >= threshold) {
      urgency = 'MEDIUM';
    } else {
      urgency = 'LOW';
    }

    // Only include non-HOLD actions (drift above threshold)
    if (action !== 'HOLD') {
      actions.push({
        assetSymbol: asset,
        currentWeightPercent: toDecimalString(currentW.mul(100), 2),
        targetWeightPercent: toDecimalString(targetW.mul(100), 2),
        deltaPercent: toDecimalString(deltaPct, 2),
        currentValueUsd: toDecimalString(currentVal, 2),
        targetValueUsd: toDecimalString(targetVal, 2),
        deltaUsd: toDecimalString(deltaVal, 2),
        urgency,
        action,
      });
    }
  }

  // Sort by |delta| descending
  actions.sort((a, b) => {
    const absA = new Decimal(a.deltaPercent).abs();
    const absB = new Decimal(b.deltaPercent).abs();
    return absB.minus(absA).toNumber();
  });

  return actions;
}
