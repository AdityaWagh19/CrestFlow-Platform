import { Decimal } from '@crestflow/shared';
import type { SustainabilityTier, TvlTrend } from '@crestflow/shared';

/**
 * Classify yield sustainability based on the ratio of organic to incentivized APY.
 * - ORGANIC: organic APY accounts for >= 80% of total
 * - MIXED: organic APY accounts for >= 40% of total
 * - INCENTIVIZED: organic APY accounts for < 40% of total
 *
 * @param organicApy Organic APY as a decimal string
 * @param incentivizedApy Incentivized APY as a decimal string
 * @returns Sustainability tier classification
 */
export function classifySustainability(
  organicApy: string,
  incentivizedApy: string,
): SustainabilityTier {
  const organic = new Decimal(organicApy);
  const incentivized = new Decimal(incentivizedApy);
  const total = organic.plus(incentivized);

  if (total.isZero()) {
    return 'ORGANIC';
  }

  const organicRatio = organic.div(total).toNumber();

  if (organicRatio >= 0.8) {
    return 'ORGANIC';
  }
  if (organicRatio >= 0.4) {
    return 'MIXED';
  }
  return 'INCENTIVIZED';
}

/**
 * Classify TVL trend based on 7-day percentage change.
 * - GROWING: > +5%
 * - STABLE: -5% to +5%
 * - DECLINING: -20% to -5%
 * - DISTRESS: < -20%
 *
 * @param tvlChange7dPercent 7-day TVL change as a percentage string (e.g. "5.0" for +5%)
 * @returns TVL trend classification
 */
export function classifyTvlTrend(tvlChange7dPercent: string): TvlTrend {
  const change = new Decimal(tvlChange7dPercent).toNumber();

  if (change > 5) {
    return 'GROWING';
  }
  if (change >= -5) {
    return 'STABLE';
  }
  if (change >= -20) {
    return 'DECLINING';
  }
  return 'DISTRESS';
}

/**
 * Convert a sustainability tier to a numeric score (0-100).
 *
 * @param tier Sustainability tier
 * @returns Numeric score
 */
export function sustainabilityToScore(tier: SustainabilityTier): number {
  const scores: Record<SustainabilityTier, number> = {
    ORGANIC: 100,
    MIXED: 65,
    INCENTIVIZED: 30,
  };
  return scores[tier];
}

/**
 * Convert a TVL trend to a scoring multiplier.
 *
 * @param trend TVL trend classification
 * @returns Multiplier (0-1)
 */
export function tvlTrendToMultiplier(trend: TvlTrend): number {
  const multipliers: Record<TvlTrend, number> = {
    GROWING: 1.0,
    STABLE: 0.9,
    DECLINING: 0.7,
    DISTRESS: 0.4,
  };
  return multipliers[trend];
}
