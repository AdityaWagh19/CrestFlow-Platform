import { Decimal, toDecimalString } from '@crestflow/shared';
import type { GoalProfile, OpportunityType } from '@crestflow/shared';

interface PortfolioFitParams {
  opportunityAsset: string;
  opportunityType: OpportunityType;
  currentPortfolioWeights: Record<string, string>;
  goalProfile: GoalProfile;
  pairAssets?: string[];
}

/**
 * Maximum single-asset concentration allowed per goal profile.
 * CONSERVATIVE profiles tolerate less concentration.
 */
const MAX_CONCENTRATION: Record<GoalProfile, number> = {
  CONSERVATIVE: 0.25,
  MODERATE: 0.35,
  AGGRESSIVE: 0.5,
};

/**
 * LP type bonus per goal profile.
 * AGGRESSIVE profiles get a higher bonus for LP positions.
 */
const LP_BONUS: Record<GoalProfile, number> = {
  CONSERVATIVE: 0,
  MODERATE: 5,
  AGGRESSIVE: 10,
};

/**
 * Compute a portfolio fit score (0-100) for a yield opportunity
 * based on current portfolio composition, asset concentration risk,
 * and alignment with the investor's goal profile.
 *
 * @param params Portfolio fit parameters
 * @returns Score from 0 to 100
 */
export function computePortfolioFitScore(params: PortfolioFitParams): number {
  const { opportunityAsset, opportunityType, currentPortfolioWeights, goalProfile, pairAssets } =
    params;

  let score = 50; // Base score

  // 1. Diversification bonus: asset not already heavily weighted
  const currentWeight = new Decimal(currentPortfolioWeights[opportunityAsset] ?? '0').toNumber();
  const maxConcentration = MAX_CONCENTRATION[goalProfile];

  if (currentWeight < maxConcentration * 0.5) {
    // Very low exposure — strong diversification benefit
    score += 30;
  } else if (currentWeight < maxConcentration) {
    // Moderate exposure — some diversification benefit
    score += 15;
  } else {
    // Already at or above max concentration — penalty
    score -= 20;
  }

  // 2. LP-specific scoring
  if (opportunityType === 'LP') {
    score += LP_BONUS[goalProfile];

    // Check pair asset concentration
    if (pairAssets) {
      for (const pairAsset of pairAssets) {
        const pairWeight = new Decimal(currentPortfolioWeights[pairAsset] ?? '0').toNumber();
        if (pairWeight > maxConcentration) {
          score -= 10;
        }
      }
    }
  }

  // 3. Goal alignment: conservative profiles prefer lending
  if (goalProfile === 'CONSERVATIVE' && opportunityType === 'LENDING') {
    score += 10;
  }
  if (goalProfile === 'CONSERVATIVE' && opportunityType === 'LP') {
    score -= 10;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Compute the final composite score by blending TOPSIS closeness
 * coefficient (70%) with portfolio fit score (30%).
 *
 * @param topsisCloseness TOPSIS closeness coefficient as a decimal string (0-1)
 * @param portfolioFitScore Portfolio fit score (0-100)
 * @returns Final composite score as a decimal string
 */
export function computeFinalScore(topsisCloseness: string, portfolioFitScore: number): string {
  const topsis = new Decimal(topsisCloseness);
  const fitNormalized = new Decimal(portfolioFitScore).div(100);

  // 70% TOPSIS + 30% portfolio fit
  const finalScore = topsis.mul('0.7').plus(fitNormalized.mul('0.3'));

  return toDecimalString(finalScore);
}
