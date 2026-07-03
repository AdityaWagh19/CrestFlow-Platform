import { Decimal, toDecimalString } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';

export interface TopsisInput {
  id: string;
  criteria: {
    netApy: number;
    protocolSafetyScore: number;
    yieldConsistencyScore: number;
    liquidityScore: number;
    ilRiskScore: number;
  };
}

export interface TopsisResult {
  id: string;
  closenessCoefficient: string;
  rank: number;
}

/**
 * Weight vectors for each goal profile.
 * Order: [netApy, protocolSafety, yieldConsistency, liquidity, ilRisk]
 */
export const GOAL_WEIGHTS = {
  CONSERVATIVE: {
    netApy: 0.15,
    protocolSafetyScore: 0.3,
    yieldConsistencyScore: 0.25,
    liquidityScore: 0.15,
    ilRiskScore: 0.15,
  },
  MODERATE: {
    netApy: 0.3,
    protocolSafetyScore: 0.2,
    yieldConsistencyScore: 0.2,
    liquidityScore: 0.15,
    ilRiskScore: 0.15,
  },
  AGGRESSIVE: {
    netApy: 0.4,
    protocolSafetyScore: 0.1,
    yieldConsistencyScore: 0.15,
    liquidityScore: 0.2,
    ilRiskScore: 0.15,
  },
} as const;

const CRITERIA_KEYS = [
  'netApy',
  'protocolSafetyScore',
  'yieldConsistencyScore',
  'liquidityScore',
  'ilRiskScore',
] as const;

type CriterionKey = (typeof CRITERIA_KEYS)[number];

/** ilRiskScore is a cost criterion (lower is better); all others are benefit (higher is better) */
const COST_CRITERIA: ReadonlySet<CriterionKey> = new Set(['ilRiskScore']);

/**
 * Rank yield opportunities using TOPSIS (Technique for Order of Preference
 * by Similarity to Ideal Solution).
 *
 * @param opportunities Array of opportunities with criteria scores
 * @param goalProfile Investor goal profile determining weight vector
 * @returns Ranked results with closeness coefficients, sorted best-first
 */
export function topsisRank(opportunities: TopsisInput[], goalProfile: GoalProfile): TopsisResult[] {
  if (opportunities.length === 0) {
    return [];
  }

  if (opportunities.length === 1) {
    return [
      {
        id: opportunities[0]?.id ?? '',
        closenessCoefficient: '1.00000000',
        rank: 1,
      },
    ];
  }

  const weights = GOAL_WEIGHTS[goalProfile];

  // Step 1: Build the decision matrix and compute column norms for normalization
  const columnNorms: Record<CriterionKey, Decimal> = {} as Record<CriterionKey, Decimal>;
  for (const key of CRITERIA_KEYS) {
    const sumOfSquares = opportunities.reduce(
      (sum, opp) => sum.plus(new Decimal(opp.criteria[key]).pow(2)),
      new Decimal(0),
    );
    columnNorms[key] = sumOfSquares.sqrt();
  }

  // Step 2: Normalize and weight the decision matrix
  const weightedNormalized: Array<{ id: string; values: Record<CriterionKey, Decimal> }> =
    opportunities.map((opp) => {
      const values: Record<CriterionKey, Decimal> = {} as Record<CriterionKey, Decimal>;
      for (const key of CRITERIA_KEYS) {
        const norm = columnNorms[key];
        const normalized = norm.isZero()
          ? new Decimal(0)
          : new Decimal(opp.criteria[key]).div(norm);
        values[key] = normalized.mul(weights[key]);
      }
      return { id: opp.id, values };
    });

  // Step 3: Determine ideal best (A+) and ideal worst (A-) solutions
  const idealBest: Record<CriterionKey, Decimal> = {} as Record<CriterionKey, Decimal>;
  const idealWorst: Record<CriterionKey, Decimal> = {} as Record<CriterionKey, Decimal>;

  for (const key of CRITERIA_KEYS) {
    const columnValues = weightedNormalized.map((row) => row.values[key]);
    const isCost = COST_CRITERIA.has(key);

    if (isCost) {
      // Cost criterion: ideal best = min, ideal worst = max
      idealBest[key] = Decimal.min(...columnValues);
      idealWorst[key] = Decimal.max(...columnValues);
    } else {
      // Benefit criterion: ideal best = max, ideal worst = min
      idealBest[key] = Decimal.max(...columnValues);
      idealWorst[key] = Decimal.min(...columnValues);
    }
  }

  // Step 4: Compute Euclidean distances to ideal best and ideal worst
  const distances = weightedNormalized.map((row) => {
    let distBestSquared = new Decimal(0);
    let distWorstSquared = new Decimal(0);

    for (const key of CRITERIA_KEYS) {
      distBestSquared = distBestSquared.plus(row.values[key].minus(idealBest[key]).pow(2));
      distWorstSquared = distWorstSquared.plus(row.values[key].minus(idealWorst[key]).pow(2));
    }

    return {
      id: row.id,
      distBest: distBestSquared.sqrt(),
      distWorst: distWorstSquared.sqrt(),
    };
  });

  // Step 5: Compute closeness coefficient C = D- / (D+ + D-)
  const results: TopsisResult[] = distances.map((d) => {
    const denominator = d.distBest.plus(d.distWorst);
    const closeness = denominator.isZero() ? new Decimal(0) : d.distWorst.div(denominator);

    return {
      id: d.id,
      closenessCoefficient: toDecimalString(closeness),
      rank: 0, // assigned after sorting
    };
  });

  // Step 6: Sort by closeness coefficient descending (higher is better)
  results.sort((a, b) => {
    const diff = new Decimal(b.closenessCoefficient).minus(new Decimal(a.closenessCoefficient));
    return diff.toNumber();
  });

  // Assign ranks
  for (const [i, result] of results.entries()) {
    result.rank = i + 1;
  }

  return results;
}
