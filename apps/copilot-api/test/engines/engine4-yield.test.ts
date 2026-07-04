/**
 * Engine 4 — Yield & Opportunity Tests
 * Tests APY normalization, TOPSIS ranking, IL computation, idle capital detection.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import {
  aprToApy,
  computeApyCv,
  computeExcessYield,
} from '../../src/modules/yield/normalizers/apy.normalizer.js';
import {
  computeIL,
  estimateAnnualizedIL,
  computeTrueYield,
  classifyILRisk,
} from '../../src/modules/yield/normalizers/il-adjusted-yield.js';
import { topsisRank, GOAL_WEIGHTS } from '../../src/modules/yield/ranking/topsis.ranker.js';
import {
  classifySustainability,
  classifyTvlTrend,
  sustainabilityToScore,
} from '../../src/modules/yield/scoring/sustainability.tagger.js';
import {
  computePortfolioFitScore,
  computeFinalScore,
} from '../../src/modules/yield/scoring/portfolio-fit.scorer.js';
import { computeLiquidityScore } from '../../src/modules/yield/scoring/liquidity.scorer.js';

// ════════════════════════════════════════════════════════════════════════════
// APY NORMALIZATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 4 — APY Normalization', () => {
  it('APR 0% → APY 0%', () => {
    const apy = aprToApy('0');
    expect(new Decimal(apy).toNumber()).toBe(0);
  });

  it('APR 10% → APY ≈ 10.52% (daily compounding)', () => {
    const apy = aprToApy('0.10');
    // (1 + 0.10/365)^365 - 1 ≈ 0.10516
    expect(new Decimal(apy).toNumber()).toBeCloseTo(0.10516, 3);
  });

  it('APR 100% → APY ≈ 171.5%', () => {
    const apy = aprToApy('1.0');
    expect(new Decimal(apy).toNumber()).toBeCloseTo(1.7146, 2);
  });

  it('CV returns null with < 7 data points', () => {
    expect(computeApyCv(['5', '6', '5.5'])).toBeNull();
  });

  it('CV = 0 for perfectly uniform APY history', () => {
    const cv = computeApyCv(['5', '5', '5', '5', '5', '5', '5']);
    expect(new Decimal(cv!).toNumber()).toBe(0);
  });

  it('CV > 0 for variable APY history', () => {
    const cv = computeApyCv(['2', '8', '3', '7', '4', '6', '5']);
    expect(new Decimal(cv!).toNumber()).toBeGreaterThan(0);
  });

  it('excess yield = net - baseline', () => {
    const excess = computeExcessYield('0.08', '0.04');
    expect(new Decimal(excess).toNumber()).toBeCloseTo(0.04, 8);
  });

  it('negative excess yield when below baseline', () => {
    const excess = computeExcessYield('0.02', '0.04');
    expect(new Decimal(excess).toNumber()).toBeLessThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// IL COMPUTATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 4 — Impermanent Loss', () => {
  it('no price change (d=1) → IL = 0', () => {
    const il = computeIL('1');
    expect(new Decimal(il).toNumber()).toBeCloseTo(0, 6);
  });

  it('price doubles (d=2) → IL ≈ -5.72%', () => {
    const il = computeIL('2');
    expect(new Decimal(il).toNumber()).toBeCloseTo(-0.0572, 3);
  });

  it('price quadruples (d=4) → IL ≈ -20%', () => {
    const il = computeIL('4');
    expect(new Decimal(il).toNumber()).toBeCloseTo(-0.2, 2);
  });

  it('annualized IL estimate from volatilities', () => {
    const il = estimateAnnualizedIL('80', '20', '0.5');
    // Should be negative (IL is a loss)
    expect(new Decimal(il).toNumber()).toBeLessThan(0);
  });

  it('zero volatilities → ~zero IL', () => {
    const il = estimateAnnualizedIL('0', '0', '0');
    expect(new Decimal(il).toNumber()).toBeCloseTo(0, 4);
  });

  it('true yield = fee + reward + IL (IL negative reduces total)', () => {
    const trueYield = computeTrueYield('0.10', '0.02', '-0.05');
    expect(new Decimal(trueYield).toNumber()).toBeCloseTo(0.07, 8);
  });

  it('IL risk classification', () => {
    expect(classifyILRisk('-0.005')).toBe('NEGLIGIBLE');
    expect(classifyILRisk('-0.03')).toBe('LOW');
    expect(classifyILRisk('-0.10')).toBe('MODERATE');
    expect(classifyILRisk('-0.20')).toBe('HIGH');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TOPSIS RANKING
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 4 — TOPSIS Ranker', () => {
  it('single opportunity → rank 1, closeness = 1.0', () => {
    const result = topsisRank(
      [
        {
          id: 'opp1',
          criteria: {
            netApy: 5,
            protocolSafetyScore: 88,
            yieldConsistencyScore: 70,
            liquidityScore: 80,
            ilRiskScore: 10,
          },
        },
      ],
      'MODERATE',
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.rank).toBe(1);
    expect(new Decimal(result[0]!.closenessCoefficient).toNumber()).toBeCloseTo(1.0, 4);
  });

  it('empty array → empty result', () => {
    expect(topsisRank([], 'MODERATE')).toEqual([]);
  });

  it('better opportunity ranked higher', () => {
    const result = topsisRank(
      [
        {
          id: 'good',
          criteria: {
            netApy: 8,
            protocolSafetyScore: 90,
            yieldConsistencyScore: 80,
            liquidityScore: 85,
            ilRiskScore: 5,
          },
        },
        {
          id: 'bad',
          criteria: {
            netApy: 2,
            protocolSafetyScore: 50,
            yieldConsistencyScore: 30,
            liquidityScore: 40,
            ilRiskScore: 80,
          },
        },
      ],
      'MODERATE',
    );
    expect(result[0]!.id).toBe('good');
    expect(result[0]!.rank).toBe(1);
    expect(result[1]!.id).toBe('bad');
    expect(result[1]!.rank).toBe(2);
  });

  it('CONSERVATIVE profile weights safety highest', () => {
    const weights = GOAL_WEIGHTS.CONSERVATIVE;
    const vals = Object.values(weights);
    const maxWeight = Math.max(...vals);
    expect(weights.protocolSafetyScore).toBe(maxWeight);
  });

  it('AGGRESSIVE profile weights APY highest', () => {
    const weights = GOAL_WEIGHTS.AGGRESSIVE;
    const vals = Object.values(weights);
    const maxWeight = Math.max(...vals);
    expect(weights.netApy).toBe(maxWeight);
  });

  it('goal profile weights sum to 1.0', () => {
    for (const profile of ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const) {
      const sum = Object.values(GOAL_WEIGHTS[profile]).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });

  it('ranks are consecutive 1-indexed integers', () => {
    const result = topsisRank(
      [
        {
          id: 'a',
          criteria: {
            netApy: 5,
            protocolSafetyScore: 80,
            yieldConsistencyScore: 70,
            liquidityScore: 75,
            ilRiskScore: 20,
          },
        },
        {
          id: 'b',
          criteria: {
            netApy: 8,
            protocolSafetyScore: 85,
            yieldConsistencyScore: 60,
            liquidityScore: 80,
            ilRiskScore: 10,
          },
        },
        {
          id: 'c',
          criteria: {
            netApy: 3,
            protocolSafetyScore: 90,
            yieldConsistencyScore: 80,
            liquidityScore: 70,
            ilRiskScore: 5,
          },
        },
      ],
      'MODERATE',
    );
    const ranks = result.map((r) => r.rank).sort();
    expect(ranks).toEqual([1, 2, 3]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUSTAINABILITY TAGGER
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 4 — Sustainability Tagger', () => {
  it('100% organic yield → ORGANIC', () => {
    expect(classifySustainability('5', '0')).toBe('ORGANIC');
  });

  it('high incentivized fraction → INCENTIVIZED', () => {
    expect(classifySustainability('1', '9')).toBe('INCENTIVIZED');
  });

  it('mixed yield → MIXED', () => {
    expect(classifySustainability('5', '3')).toBe('MIXED');
  });

  it('TVL trend classification', () => {
    expect(classifyTvlTrend('10')).toBe('GROWING');
    expect(classifyTvlTrend('0')).toBe('STABLE');
    expect(classifyTvlTrend('-15')).toBe('DECLINING');
    expect(classifyTvlTrend('-30')).toBe('DISTRESS');
  });

  it('sustainability scores: ORGANIC=100, MIXED=65, INCENTIVIZED=30', () => {
    expect(sustainabilityToScore('ORGANIC')).toBe(100);
    expect(sustainabilityToScore('MIXED')).toBe(65);
    expect(sustainabilityToScore('INCENTIVIZED')).toBe(30);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PORTFOLIO FIT + LIQUIDITY SCORING
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 4 — Portfolio Fit & Liquidity', () => {
  it('CONSERVATIVE + LP → score penalized by 50', () => {
    const score = computePortfolioFitScore({
      opportunityAsset: 'ALGO',
      opportunityType: 'LP',
      currentPortfolioWeights: { ALGO: '0.30' },
      goalProfile: 'CONSERVATIVE',
    });
    expect(score).toBeLessThanOrEqual(50);
  });

  it('asset > 50% portfolio → score penalized by 30', () => {
    const score = computePortfolioFitScore({
      opportunityAsset: 'ALGO',
      opportunityType: 'LENDING',
      currentPortfolioWeights: { ALGO: '0.60' },
      goalProfile: 'MODERATE',
    });
    expect(score).toBeLessThanOrEqual(70);
  });

  it('new asset + LENDING → bonus +10', () => {
    const score = computePortfolioFitScore({
      opportunityAsset: 'goETH',
      opportunityType: 'LENDING',
      currentPortfolioWeights: { ALGO: '0.50', USDC: '0.50' },
      goalProfile: 'MODERATE',
    });
    expect(score).toBeGreaterThanOrEqual(70); // bonus for new asset, clamped at 100
  });

  it('score always clamped [0, 100]', () => {
    const score = computePortfolioFitScore({
      opportunityAsset: 'ALGO',
      opportunityType: 'LP',
      currentPortfolioWeights: { ALGO: '0.80' },
      goalProfile: 'CONSERVATIVE',
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('final score = 70% TOPSIS + 30% fit', () => {
    const score = computeFinalScore('0.80', 60);
    // 0.80 * 0.70 + (60/100) * 0.30 = 0.56 + 0.18 = 0.74
    expect(new Decimal(score).toNumber()).toBeCloseTo(0.74, 4);
  });

  it('liquidity score: high TVL ratio → high score', () => {
    const score = computeLiquidityScore('10000000', '1000');
    // TVL/position = 10000x → score = 100
    expect(score).toBe(100);
  });

  it('liquidity score: low TVL ratio → low score', () => {
    const score = computeLiquidityScore('5000', '1000');
    // TVL/position = 5x → score = 20
    expect(score).toBeLessThanOrEqual(40);
  });
});
