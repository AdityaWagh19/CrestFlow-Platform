/**
 * Idle Capital Detector — identifies positions earning suboptimal yield.
 *
 * Tier classification:
 * - IDLE: position APY < 0.1% (capital sitting unused)
 * - UNDERPERFORMING: position APY below a configurable baseline
 * - SUBOPTIMAL: position APY > 2% below the best available opportunity for the same asset
 *
 * Filters out signals where the annual opportunity cost is < $0.50
 * to avoid noise from micro-positions.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { IdleTier } from '@crestflow/shared';

export interface IdleCapitalSignalData {
  assetSymbol: string;
  currentProtocol: string;
  currentApyPercent: string;
  bestAvailableApyPercent: string;
  bestAvailableOpportunityId: string;
  opportunityCostUsdPerYear: string;
  tier: IdleTier;
  actionSuggestion: string;
  positionValueUsd: string;
}

export interface PositionInput {
  assetSymbol: string;
  protocol: string;
  apyPercent: string;
  valueUsd: string;
}

export interface BestOpportunityInput {
  opportunityId: string;
  apyPercent: string;
}

const TIER_PRIORITY: Record<IdleTier, number> = {
  IDLE: 0,
  UNDERPERFORMING: 1,
  SUBOPTIMAL: 2,
};

const IDLE_APY_THRESHOLD = '0.1';
const SUBOPTIMAL_GAP_THRESHOLD = '2.0';
const MIN_ANNUAL_BENEFIT_USD = '0.50';

/**
 * Detect idle capital positions that could earn higher yield elsewhere.
 *
 * @param positions Current user positions with APY and value
 * @param bestOpportunitiesByAsset Map of asset symbol to best available opportunity
 * @param baselineApyPercent Minimum acceptable APY (below = UNDERPERFORMING)
 * @returns Sorted idle capital signals
 */
export function detectIdleCapital(
  positions: PositionInput[],
  bestOpportunitiesByAsset: Map<string, BestOpportunityInput>,
  baselineApyPercent: string,
): IdleCapitalSignalData[] {
  const signals: IdleCapitalSignalData[] = [];

  for (const position of positions) {
    const currentApy = new Decimal(position.apyPercent);
    const positionValue = new Decimal(position.valueUsd);

    const bestOpp = bestOpportunitiesByAsset.get(position.assetSymbol);
    if (!bestOpp) {
      continue;
    }

    const bestApy = new Decimal(bestOpp.apyPercent);
    const apyGap = bestApy.minus(currentApy);

    // Determine tier
    let tier: IdleTier | null = null;
    let actionSuggestion = '';

    if (currentApy.lt(new Decimal(IDLE_APY_THRESHOLD))) {
      tier = 'IDLE';
      actionSuggestion = `Capital is idle at ${toDecimalString(currentApy)}% APY. Consider deploying to ${position.assetSymbol} lending/LP at ${toDecimalString(bestApy)}% APY.`;
    } else if (currentApy.lt(new Decimal(baselineApyPercent))) {
      tier = 'UNDERPERFORMING';
      actionSuggestion = `Position yields ${toDecimalString(currentApy)}% APY, below the ${baselineApyPercent}% baseline. Best available: ${toDecimalString(bestApy)}% APY.`;
    } else if (apyGap.gte(new Decimal(SUBOPTIMAL_GAP_THRESHOLD))) {
      tier = 'SUBOPTIMAL';
      actionSuggestion = `Position yields ${toDecimalString(currentApy)}% APY but ${toDecimalString(bestApy)}% is available — a ${toDecimalString(apyGap)}% improvement.`;
    }

    if (!tier) {
      continue;
    }

    // Compute opportunity cost: (bestApy - currentApy) / 100 * positionValue
    const opportunityCost = apyGap.div(100).mul(positionValue);

    // Filter out < $0.50/year benefit
    if (opportunityCost.lt(new Decimal(MIN_ANNUAL_BENEFIT_USD))) {
      continue;
    }

    signals.push({
      assetSymbol: position.assetSymbol,
      currentProtocol: position.protocol,
      currentApyPercent: toDecimalString(currentApy),
      bestAvailableApyPercent: toDecimalString(bestApy),
      bestAvailableOpportunityId: bestOpp.opportunityId,
      opportunityCostUsdPerYear: toDecimalString(opportunityCost),
      tier,
      actionSuggestion,
      positionValueUsd: toDecimalString(positionValue),
    });
  }

  // Sort by tier priority (IDLE first) then by opportunity cost descending
  signals.sort((a, b) => {
    const tierDiff = TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return new Decimal(b.opportunityCostUsdPerYear)
      .minus(new Decimal(a.opportunityCostUsdPerYear))
      .toNumber();
  });

  return signals;
}
