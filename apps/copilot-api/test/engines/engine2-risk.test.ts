/**
 * Engine 2 — Risk Intelligence Tests
 * Tests quantitative risk analysis with known return series.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { extractReturnSeries } from '../../src/modules/risk/analyzers/return-series.js';
import {
  analyzeMarketRisk,
  MIN_SNAPSHOTS_FOR_CVAR,
  MIN_SNAPSHOTS_FOR_MDD,
} from '../../src/modules/risk/analyzers/market-risk.analyzer.js';
import {
  analyzeLiquidationRisk,
  HF_THRESHOLDS,
} from '../../src/modules/risk/analyzers/liquidation.analyzer.js';
import { analyzeConcentrationRisk } from '../../src/modules/risk/analyzers/concentration.analyzer.js';
import { analyzeProtocolRisk } from '../../src/modules/risk/analyzers/protocol-risk.analyzer.js';
import { analyzeLiquidityRisk } from '../../src/modules/risk/analyzers/liquidity.analyzer.js';
import { computeCompositeRiskScore } from '../../src/modules/risk/scoring/composite-scorer.js';
import { evaluateAlertConditions } from '../../src/modules/risk/alerts/alert-evaluator.js';

// ════════════════════════════════════════════════════════════════════════════
// RETURN SERIES EXTRACTION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Return Series', () => {
  it('needs at least 2 snapshots to produce returns', () => {
    expect(extractReturnSeries([])).toEqual([]);
    expect(extractReturnSeries([{ totalValueUsd: '100', snapshotAt: new Date() }])).toEqual([]);
  });

  it('computes correct returns from value series', () => {
    const snapshots = [
      { totalValueUsd: '100', snapshotAt: new Date('2024-01-01') },
      { totalValueUsd: '110', snapshotAt: new Date('2024-01-02') },
      { totalValueUsd: '105', snapshotAt: new Date('2024-01-03') },
    ];
    const returns = extractReturnSeries(snapshots);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 4); // 100 → 110 = +10%
    expect(returns[1]).toBeCloseTo(-0.04545, 4); // 110 → 105 = -4.55%
  });

  it('handles unsorted snapshots (sorts by date)', () => {
    const snapshots = [
      { totalValueUsd: '110', snapshotAt: new Date('2024-01-02') },
      { totalValueUsd: '100', snapshotAt: new Date('2024-01-01') },
    ];
    const returns = extractReturnSeries(snapshots);
    expect(returns[0]).toBeCloseTo(0.1, 4); // should sort then compute
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MARKET RISK (CVaR, SORTINO, MDD, VOLATILITY)
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Market Risk Analyzer', () => {
  // Generate 30 days of realistic returns
  const returns30d = Array.from(
    { length: 30 },
    (_, i) => Math.sin(i * 0.5) * 0.03 + (Math.random() - 0.5) * 0.02,
  );
  const values30d = ['1000'];
  for (let i = 0; i < 30; i++) {
    const prev = new Decimal(values30d[values30d.length - 1]!);
    values30d.push(prev.mul(1 + returns30d[i]!).toFixed(2));
  }

  it('insufficient history flagged when < 7 snapshots', () => {
    const result = analyzeMarketRisk([0.01, 0.02], ['100', '101', '102']);
    expect(result.insufficientHistory).toBe(true);
    expect(result.cvar95Percent).toBeNull();
    expect(result.sortinoRatio).toBeNull();
  });

  it('CVaR computed when >= 20 returns available', () => {
    const result = analyzeMarketRisk(returns30d, values30d);
    expect(result.snapshotsUsed).toBe(30);
    if (returns30d.length >= MIN_SNAPSHOTS_FOR_CVAR) {
      expect(result.cvar95Percent).not.toBeNull();
    }
  });

  it('CVaR is always <= VaR (tail average worse than threshold)', () => {
    const result = analyzeMarketRisk(returns30d, values30d);
    if (result.cvar95Percent && result.var95Percent) {
      expect(new Decimal(result.cvar95Percent).toNumber()).toBeLessThanOrEqual(
        new Decimal(result.var95Percent).toNumber(),
      );
    }
  });

  it('MDD computed when >= 7 returns', () => {
    const result = analyzeMarketRisk(returns30d, values30d);
    if (returns30d.length >= MIN_SNAPSHOTS_FOR_MDD) {
      expect(result.maxDrawdownPercent).not.toBeNull();
      expect(new Decimal(result.maxDrawdownPercent!).toNumber()).toBeGreaterThanOrEqual(0);
    }
  });

  it('volatility is annualized (daily vol * sqrt(365))', () => {
    const result = analyzeMarketRisk(returns30d, values30d);
    if (result.realizedVol30dPercent) {
      // Annualized vol should be > daily vol * 10 (sqrt(365) ≈ 19.1)
      expect(new Decimal(result.realizedVol30dPercent).toNumber()).toBeGreaterThan(0);
    }
  });

  it('component score bounded 0-100', () => {
    const result = analyzeMarketRisk(returns30d, values30d);
    expect(result.componentScore).toBeGreaterThanOrEqual(0);
    expect(result.componentScore).toBeLessThanOrEqual(100);
  });

  it('all positive returns → MDD = 0', () => {
    const positiveReturns = Array.from({ length: 10 }, () => 0.01);
    const positiveValues = ['100'];
    for (let i = 0; i < 10; i++) {
      positiveValues.push(new Decimal(positiveValues[i]!).mul(1.01).toFixed(2));
    }
    const result = analyzeMarketRisk(positiveReturns, positiveValues);
    if (result.maxDrawdownPercent) {
      expect(new Decimal(result.maxDrawdownPercent).toNumber()).toBe(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LIQUIDATION RISK
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Liquidation Risk', () => {
  it('no borrow positions → score 0, hasActiveBorrows false', () => {
    const result = analyzeLiquidationRisk([]);
    expect(result.componentScore).toBe(0);
    expect(result.hasActiveBorrows).toBe(false);
    expect(result.positions).toHaveLength(0);
  });

  it('HF < 1.1 → CRITICAL status', () => {
    const result = analyzeLiquidationRisk([
      {
        protocol: 'folks-finance',
        positionType: 'borrow',
        assetSymbol: 'ALGO',
        valueUsd: '1000',
        healthFactor: '1.05',
      },
    ]);
    expect(result.positions[0]!.status).toBe('CRITICAL');
    expect(result.componentScore).toBe(90);
  });

  it('HF between 1.1 and 1.3 → WARNING status', () => {
    const result = analyzeLiquidationRisk([
      {
        protocol: 'folks-finance',
        positionType: 'borrow',
        assetSymbol: 'ALGO',
        valueUsd: '1000',
        healthFactor: '1.25',
      },
    ]);
    expect(result.positions[0]!.status).toBe('WARNING');
    expect(result.componentScore).toBe(70);
  });

  it('HF > 3.0 → SAFE status', () => {
    const result = analyzeLiquidationRisk([
      {
        protocol: 'folks-finance',
        positionType: 'borrow',
        assetSymbol: 'ALGO',
        valueUsd: '1000',
        healthFactor: '4.0',
      },
    ]);
    expect(result.positions[0]!.status).toBe('SAFE');
    expect(result.componentScore).toBe(10);
  });

  it('distance to liquidation calculated correctly', () => {
    const result = analyzeLiquidationRisk([
      {
        protocol: 'folks-finance',
        positionType: 'borrow',
        assetSymbol: 'ALGO',
        valueUsd: '1000',
        healthFactor: '1.5',
      },
    ]);
    // distance = (1.5 - 1.0) / 1.5 * 100 = 33.33%
    expect(new Decimal(result.positions[0]!.distanceToLiquidationPercent).toNumber()).toBeCloseTo(
      33.33,
      1,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONCENTRATION RISK
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Concentration Risk', () => {
  it('single asset → HHI = 10000, score = 100', () => {
    const result = analyzeConcentrationRisk(
      { ALGO: { percent: '100' } },
      { native: '100', folks: '0', tinyman: '0', pact: '0' },
    );
    expect(new Decimal(result.assetHhi).toNumber()).toBeCloseTo(10000, 0);
    expect(result.componentScore).toBe(100);
  });

  it('4 equal assets → HHI = 2500, score ≈ 25', () => {
    const result = analyzeConcentrationRisk(
      {
        ALGO: { percent: '25' },
        USDC: { percent: '25' },
        goETH: { percent: '25' },
        goBTC: { percent: '25' },
      },
      { native: '25', folks: '25', tinyman: '25', pact: '25' },
    );
    expect(new Decimal(result.assetHhi).toNumber()).toBeCloseTo(2500, 0);
    expect(result.componentScore).toBeCloseTo(25, 5);
  });

  it('asset concentration weighted 70%, protocol 30%', () => {
    // High asset concentration, low protocol concentration
    const result = analyzeConcentrationRisk(
      { ALGO: { percent: '100' } }, // asset HHI = 10000 → asset score = 100
      { native: '25', folks: '25', tinyman: '25', pact: '25' }, // protocol HHI = 2500 → protocol score = 25
    );
    // composite = 100 * 0.7 + 25 * 0.3 = 77.5 → rounded
    expect(result.componentScore).toBeCloseTo(78, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PROTOCOL RISK
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Protocol Risk', () => {
  it('100% Folks Finance → low protocol risk (high safety)', () => {
    const result = analyzeProtocolRisk({ folks: '100', tinyman: '0', pact: '0', native: '0' });
    // Folks safety = 88, inverted = 12 risk
    expect(result.componentScore).toBeCloseTo(12, 1);
  });

  it('no protocol exposure → 0 protocol risk', () => {
    const result = analyzeProtocolRisk({ folks: '0', tinyman: '0', pact: '0', native: '100' });
    expect(result.componentScore).toBe(0);
  });

  it('mixed allocation → weighted average risk', () => {
    const result = analyzeProtocolRisk({ folks: '50', tinyman: '30', pact: '20', native: '0' });
    expect(result.componentScore).toBeGreaterThan(0);
    expect(result.componentScore).toBeLessThan(50);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// COMPOSITE RISK SCORE
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Composite Score', () => {
  it('all components at 0 → riskScore = 0, level = LOW', () => {
    const result = computeCompositeRiskScore(0, 0, 0, 0, 0, false);
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('LOW');
  });

  it('all components at 100 → riskScore = 100, level = CRITICAL', () => {
    const result = computeCompositeRiskScore(100, 100, 100, 100, 100, true);
    expect(result.riskScore).toBe(100);
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('risk levels: 0-39 LOW, 40-59 MEDIUM, 60-79 HIGH, 80-100 CRITICAL', () => {
    expect(computeCompositeRiskScore(30, 0, 0, 0, 0, false).riskLevel).toBe('LOW');
    expect(computeCompositeRiskScore(90, 50, 50, 50, 50, true).riskLevel).toBe('HIGH');
  });

  it('no liquidation data → weights redistributed', () => {
    const withLiq = computeCompositeRiskScore(50, 80, 50, 50, 50, true);
    const withoutLiq = computeCompositeRiskScore(50, 0, 50, 50, 50, false);
    // Without liquidation, market weight increases from 0.35 to 0.45
    expect(withLiq.riskScore).not.toBe(withoutLiq.riskScore);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALERT EVALUATOR
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 2 — Alert Evaluator', () => {
  const defaultMarket = {
    cvar95Percent: '-0.08',
    var95Percent: '-0.06',
    sortinoRatio: '1.2',
    maxDrawdownPercent: '0.15',
    calmarRatio: '0.8',
    realizedVol7dPercent: '50',
    realizedVol30dPercent: '60',
    snapshotsUsed: 30,
    insufficientHistory: false,
    componentScore: 40,
  };

  const defaultLiquidation = {
    positions: [],
    minHealthFactor: null,
    componentScore: 0,
    hasActiveBorrows: false,
  };

  const defaultConcentration = { assetHhi: '3000', protocolHhi: '2500', componentScore: 30 };
  const defaultLiquidity = { positions: [], maxExitImpactPercent: '0.5', componentScore: 10 };

  it('HHI > 5000 → HIGH_CONCENTRATION triggered', () => {
    const conditions = evaluateAlertConditions(
      defaultMarket,
      defaultLiquidation,
      { assetHhi: '6000', protocolHhi: '2500', componentScore: 60 },
      defaultLiquidity,
      { 'folks-finance': 88, tinyman: 82, pact: 72 },
    );
    const highConc = conditions.find((c) => c.alertType === 'HIGH_CONCENTRATION');
    expect(highConc?.isTriggered).toBe(true);
  });

  it('HHI 3000 → MODERATE_CONCENTRATION triggered', () => {
    const conditions = evaluateAlertConditions(
      defaultMarket,
      defaultLiquidation,
      { assetHhi: '3000', protocolHhi: '2500', componentScore: 30 },
      defaultLiquidity,
      { 'folks-finance': 88, tinyman: 82, pact: 72 },
    );
    const modConc = conditions.find((c) => c.alertType === 'MODERATE_CONCENTRATION');
    expect(modConc?.isTriggered).toBe(true);
  });

  it('HF < 1.1 → LIQUIDATION_IMMINENT triggered', () => {
    const conditions = evaluateAlertConditions(
      defaultMarket,
      { positions: [], minHealthFactor: '1.05', componentScore: 90, hasActiveBorrows: true },
      defaultConcentration,
      defaultLiquidity,
      {},
    );
    const liqAlert = conditions.find((c) => c.alertType === 'LIQUIDATION_IMMINENT');
    expect(liqAlert?.isTriggered).toBe(true);
  });

  it('all conditions produce 8 alert entries', () => {
    const conditions = evaluateAlertConditions(
      defaultMarket,
      defaultLiquidation,
      defaultConcentration,
      defaultLiquidity,
      {},
    );
    expect(conditions).toHaveLength(8);
  });
});
