/**
 * Goal Profile Hard Constraint Enforcer
 *
 * Clips allocations to hard limits defined by the user's goal profile.
 * Defensive mode shifts 10% from volatile to stable assets when risk score
 * exceeds the profile's maximum.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

// ── Profile configurations ────────────────────────────────────────────────────

interface GoalProfileConfig {
  maxVolatilePercent: string; // DECIMAL — max total allocation to volatile assets
  minStablePercent: string; // DECIMAL — min total allocation to stablecoins
  maxRiskScore: number; // composite risk score ceiling
}

export const GOAL_PROFILES: Record<'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE', GoalProfileConfig> =
  {
    CONSERVATIVE: {
      maxVolatilePercent: '0.30',
      minStablePercent: '0.40',
      maxRiskScore: 40,
    },
    MODERATE: {
      maxVolatilePercent: '0.60',
      minStablePercent: '0.20',
      maxRiskScore: 65,
    },
    AGGRESSIVE: {
      maxVolatilePercent: '0.85',
      minStablePercent: '0.05',
      maxRiskScore: 85,
    },
  };

// ── Asset classification ──────────────────────────────────────────────────────

export const VOLATILE_ASSETS = new Set<string>(['ALGO', 'goBTC', 'goETH']);

export const STABLE_ASSETS = new Set<string>(['USDC', 'USDt', 'USDA']);

// ── Enforcer ──────────────────────────────────────────────────────────────────

export interface GoalConstraintResult {
  weights: Record<string, string>;
  defensiveMode: boolean;
}

export function enforceGoalConstraints(
  weights: Record<string, string>,
  goalProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE',
  riskScore: number,
): GoalConstraintResult {
  const config = GOAL_PROFILES[goalProfile];
  const maxVolatile = new Decimal(config.maxVolatilePercent);
  const minStable = new Decimal(config.minStablePercent);
  const defensiveMode = riskScore > config.maxRiskScore;

  // Clone weights into Decimal map
  const w = new Map<string, Decimal>();
  for (const [asset, weight] of Object.entries(weights)) {
    w.set(asset, new Decimal(weight));
  }

  // ── Defensive mode: shift 10% from volatile to stablecoins ──────────
  if (defensiveMode) {
    const shiftAmount = new Decimal('0.10');
    const volatileEntries = [...w.entries()].filter(([a]) => VOLATILE_ASSETS.has(a));
    const stableEntries = [...w.entries()].filter(([a]) => STABLE_ASSETS.has(a));

    const totalVolatile = volatileEntries.reduce((s, [, v]) => s.plus(v), new Decimal(0));
    const totalStable = stableEntries.reduce((s, [, v]) => s.plus(v), new Decimal(0));

    if (totalVolatile.gt(0) && totalStable.gt(0)) {
      // Reduce volatile proportionally
      for (const [asset, val] of volatileEntries) {
        const fraction = val.div(totalVolatile);
        const reduction = shiftAmount.mul(fraction);
        w.set(asset, Decimal.max(new Decimal(0), val.minus(reduction)));
      }
      // Add to stable proportionally
      for (const [asset, val] of stableEntries) {
        const fraction = val.div(totalStable);
        const addition = shiftAmount.mul(fraction);
        w.set(asset, val.plus(addition));
      }
    }
  }

  // ── Clip volatile above max ─────────────────────────────────────────
  const volatileTotal = [...w.entries()]
    .filter(([a]) => VOLATILE_ASSETS.has(a))
    .reduce((s, [, v]) => s.plus(v), new Decimal(0));

  if (volatileTotal.gt(maxVolatile)) {
    const scale = maxVolatile.div(volatileTotal);
    for (const [asset, val] of w.entries()) {
      if (VOLATILE_ASSETS.has(asset)) {
        w.set(asset, val.mul(scale));
      }
    }
  }

  // ── Ensure stable meets minimum ────────────────────────────────────
  const stableTotal = [...w.entries()]
    .filter(([a]) => STABLE_ASSETS.has(a))
    .reduce((s, [, v]) => s.plus(v), new Decimal(0));

  if (stableTotal.lt(minStable) && stableTotal.gt(0)) {
    const deficit = minStable.minus(stableTotal);
    // Take deficit from non-stable, non-volatile assets first, then volatile
    const nonStableEntries = [...w.entries()].filter(([a]) => !STABLE_ASSETS.has(a));
    const nonStableTotal = nonStableEntries.reduce((s, [, v]) => s.plus(v), new Decimal(0));
    if (nonStableTotal.gt(0)) {
      for (const [asset, val] of nonStableEntries) {
        const fraction = val.div(nonStableTotal);
        const reduction = deficit.mul(fraction);
        w.set(asset, Decimal.max(new Decimal(0), val.minus(reduction)));
      }
      // Boost stable proportionally
      for (const [asset, val] of w.entries()) {
        if (STABLE_ASSETS.has(asset)) {
          const fraction = val.div(stableTotal);
          const addition = deficit.mul(fraction);
          w.set(asset, val.plus(addition));
        }
      }
    }
  }

  // ── Renormalize to sum = 1.0 ───────────────────────────────────────
  const total = [...w.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const result: Record<string, string> = {};
  if (total.gt(0)) {
    for (const [asset, val] of w.entries()) {
      result[asset] = toDecimalString(val.div(total));
    }
  } else {
    // Fallback: equal weight
    const count = w.size;
    for (const asset of w.keys()) {
      result[asset] = toDecimalString(new Decimal(1).div(count));
    }
  }

  return { weights: result, defensiveMode };
}
