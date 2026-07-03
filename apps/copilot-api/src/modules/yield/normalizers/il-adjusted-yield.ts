import { Decimal, toDecimalString } from '@crestflow/shared';
import type { ILRiskTier } from '@crestflow/shared';

/**
 * Compute impermanent loss given a price ratio change.
 * IL = 2 * sqrt(d) / (1 + d) - 1
 * where d = new_price / old_price (the ratio change).
 *
 * @param priceRatioChange The price ratio (new/old) as a decimal string
 * @returns IL as a negative decimal string (loss)
 */
export function computeIL(priceRatioChange: string): string {
  const d = new Decimal(priceRatioChange);

  // IL = 2 * sqrt(d) / (1 + d) - 1
  const sqrtD = d.sqrt();
  const il = sqrtD.mul(2).div(d.plus(1)).minus(1);

  return toDecimalString(il);
}

/**
 * Estimate annualized impermanent loss using Ito's lemma approximation.
 * sigma_pair^2 ~ vol1^2 + vol2^2 - 2 * corr * vol1 * vol2
 * Annualized IL ~ -0.5 * sigma_pair^2
 *
 * @param asset1Vol30d 30-day volatility of asset 1 (annualized, as decimal string)
 * @param asset2Vol30d 30-day volatility of asset 2 (annualized, as decimal string)
 * @param correlation Correlation between assets (-1 to 1), defaults to "0"
 * @returns Estimated annualized IL as a decimal string (negative)
 */
export function estimateAnnualizedIL(
  asset1Vol30d: string,
  asset2Vol30d: string,
  correlation = '0',
): string {
  const vol1 = new Decimal(asset1Vol30d);
  const vol2 = new Decimal(asset2Vol30d);
  const corr = new Decimal(correlation);

  // sigma_pair^2 = vol1^2 + vol2^2 - 2 * corr * vol1 * vol2
  const sigmaPairSquared = vol1.pow(2).plus(vol2.pow(2)).minus(corr.mul(2).mul(vol1).mul(vol2));

  // Annualized IL ~ -0.5 * sigma_pair^2
  const annualizedIL = new Decimal('-0.5').mul(sigmaPairSquared);

  return toDecimalString(annualizedIL);
}

/**
 * Compute true yield by summing trading fee APY, reward APY, and estimated IL.
 * True yield = tradingFeeApy + rewardApy + estimatedAnnualIL
 * (estimatedAnnualIL is typically negative)
 *
 * @param tradingFeeApy Trading fee APY as a decimal string
 * @param rewardApy Reward/incentive APY as a decimal string
 * @param estimatedAnnualIL Estimated annualized IL as a decimal string (negative)
 * @returns True yield as a decimal string
 */
export function computeTrueYield(
  tradingFeeApy: string,
  rewardApy: string,
  estimatedAnnualIL: string,
): string {
  const trueYield = new Decimal(tradingFeeApy)
    .plus(new Decimal(rewardApy))
    .plus(new Decimal(estimatedAnnualIL));

  return toDecimalString(trueYield);
}

/**
 * Classify IL risk based on estimated annualized IL magnitude.
 * Uses absolute value of IL for classification:
 * - < 1%: NEGLIGIBLE
 * - 1-5%: LOW
 * - 5-15%: MODERATE
 * - > 15%: HIGH
 *
 * @param estimatedAnnualIL Estimated annualized IL as a decimal string
 * @returns IL risk tier classification
 */
export function classifyILRisk(estimatedAnnualIL: string): ILRiskTier {
  const absIL = new Decimal(estimatedAnnualIL).abs();

  const one = new Decimal('0.01');
  const five = new Decimal('0.05');
  const fifteen = new Decimal('0.15');

  if (absIL.lt(one)) {
    return 'NEGLIGIBLE';
  }
  if (absIL.lt(five)) {
    return 'LOW';
  }
  if (absIL.lt(fifteen)) {
    return 'MODERATE';
  }
  return 'HIGH';
}
