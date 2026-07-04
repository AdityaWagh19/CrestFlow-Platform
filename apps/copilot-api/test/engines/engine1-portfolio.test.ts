/**
 * Engine 1 — Portfolio Intelligence Tests
 * Tests the actual financial computation logic with realistic data.
 * No mocks on math — only mocks on external APIs.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

// ── Import pipeline functions directly ─────────────────────────────────────
import { calculateImpermanentLoss } from '../../src/modules/portfolio/pipeline/02-lp-decomposer.js';
import { classifyAsset } from '../../src/modules/portfolio/pipeline/03-asset-classifier.js';
import { analyzeAllocation } from '../../src/modules/portfolio/pipeline/04-allocation-analyzer.js';
import { calculatePnl } from '../../src/modules/portfolio/pipeline/05-pnl-calculator.js';
import { calculateHealthScore } from '../../src/modules/portfolio/pipeline/06-health-scorer.js';
import type { AssetHolding, ProtocolPosition, PriceData } from '@crestflow/shared';

// ── Test Data Builders ─────────────────────────────────────────────────────

function buildHolding(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetId: 0,
    symbol: 'ALGO',
    name: 'Algorand',
    decimals: 6,
    amount: '5000000000',
    amountStandard: '5000.00000000',
    priceUsd: '0.30000000',
    valueUsd: '1500.00',
    category: 'volatile',
    source: 'native',
    ...overrides,
  };
}

function buildPosition(overrides: Partial<ProtocolPosition> = {}): ProtocolPosition {
  return {
    protocol: 'folks-finance',
    positionType: 'supply',
    assetSymbol: 'USDC',
    valueUsd: '1000.00',
    apyPercent: '5.42',
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// IMPERMANENT LOSS
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 1 — Impermanent Loss', () => {
  it('IL = 0% when price ratio unchanged (k=1)', () => {
    const il = calculateImpermanentLoss('1', '1');
    const ilNum = new Decimal(il).toNumber();
    expect(ilNum).toBeCloseTo(0, 6);
  });

  it('IL ≈ -5.72% when price doubles (k=2 relative to entry)', () => {
    // k = currentRatio / entryRatio = 2/1 = 2
    const il = calculateImpermanentLoss('2', '1');
    const ilNum = new Decimal(il).toNumber();
    // 2*sqrt(2)/(1+2) - 1 = 2*1.4142/3 - 1 = -0.0572
    expect(ilNum).toBeCloseTo(-0.05719, 4);
  });

  it('IL is symmetric: k=0.5 gives same IL as k=2', () => {
    const il2 = calculateImpermanentLoss('2', '1');
    const il05 = calculateImpermanentLoss('0.5', '1');
    expect(new Decimal(il2).toNumber()).toBeCloseTo(new Decimal(il05).toNumber(), 4);
  });

  it('IL ≈ -20% at extreme divergence (k=4)', () => {
    const il = calculateImpermanentLoss('4', '1');
    const ilNum = new Decimal(il).toNumber();
    // 2*sqrt(4)/(1+4) - 1 = 4/5 - 1 = -0.20
    expect(ilNum).toBeCloseTo(-0.2, 4);
  });

  it('IL = 0 when entry price ratio is zero (division guard)', () => {
    const il = calculateImpermanentLoss('2', '0');
    expect(il).toBe('0.00000000');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ASSET CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 1 — Asset Classification', () => {
  it('ALGO (0) classified as volatile', () => {
    expect(classifyAsset(0)).toBe('volatile');
  });

  it('USDC (31566704) classified as stablecoin', () => {
    expect(classifyAsset(31566704)).toBe('stablecoin');
  });

  it('USDt (312769) classified as stablecoin', () => {
    expect(classifyAsset(312769)).toBe('stablecoin');
  });

  it('goETH (386195940) classified as volatile', () => {
    expect(classifyAsset(386195940)).toBe('volatile');
  });

  it('Unknown ASA classified as volatile by default', () => {
    expect(classifyAsset(999999999)).toBe('volatile');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALLOCATION ANALYSIS
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 1 — Allocation Analysis', () => {
  it('single asset portfolio → 100% allocation', () => {
    const holdings = [buildHolding({ valueUsd: '1000.00' })];
    const result = analyzeAllocation(holdings, [], []);
    expect(result.totalValueUsd).toBe('1000.00');
    expect(result.trueExposure['ALGO']).toBeDefined();
    expect(new Decimal(result.trueExposure['ALGO']!.percent).toNumber()).toBeCloseTo(100, 0);
  });

  it('two equal holdings → ~50% each', () => {
    const holdings = [
      buildHolding({ assetId: 0, symbol: 'ALGO', valueUsd: '500.00' }),
      buildHolding({
        assetId: 31566704,
        symbol: 'USDC',
        valueUsd: '500.00',
        category: 'stablecoin',
      }),
    ];
    const result = analyzeAllocation(holdings, [], []);
    expect(result.totalValueUsd).toBe('1000.00');
    expect(new Decimal(result.trueExposure['ALGO']!.percent).toNumber()).toBeCloseTo(50, 0);
    expect(new Decimal(result.trueExposure['USDC']!.percent).toNumber()).toBeCloseTo(50, 0);
  });

  it('HHI = 10000 for single-asset portfolio (max concentration)', () => {
    const holdings = [buildHolding({ valueUsd: '5000.00' })];
    const result = analyzeAllocation(holdings, [], []);
    expect(new Decimal(result.hhi).toNumber()).toBeCloseTo(10000, 0);
  });

  it('HHI = 2500 for 4 equal-weight assets', () => {
    const holdings = [
      buildHolding({ assetId: 0, symbol: 'ALGO', valueUsd: '250.00' }),
      buildHolding({
        assetId: 31566704,
        symbol: 'USDC',
        valueUsd: '250.00',
        category: 'stablecoin',
      }),
      buildHolding({ assetId: 386195940, symbol: 'goETH', valueUsd: '250.00' }),
      buildHolding({ assetId: 386192725, symbol: 'goBTC', valueUsd: '250.00' }),
    ];
    const result = analyzeAllocation(holdings, [], []);
    expect(new Decimal(result.hhi).toNumber()).toBeCloseTo(2500, 0);
  });

  it('protocol allocation tracks Folks Finance supply correctly', () => {
    const holdings = [buildHolding({ valueUsd: '500.00' })];
    const positions: ProtocolPosition[] = [
      buildPosition({ protocol: 'folks-finance', valueUsd: '500.00' }),
    ];
    const result = analyzeAllocation(holdings, positions, []);
    expect(new Decimal(result.protocolAllocation.folks).toNumber()).toBeGreaterThan(0);
  });

  it('empty portfolio → totalValueUsd = 0', () => {
    const result = analyzeAllocation([], [], []);
    expect(result.totalValueUsd).toBe('0.00');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PnL CALCULATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 1 — PnL Calculation', () => {
  it('unrealized PnL = (currentPrice - avgCost) * quantity', () => {
    const holdings = [
      buildHolding({
        assetId: 0,
        symbol: 'ALGO',
        amountStandard: '1000.00000000',
        priceUsd: '0.35000000',
        valueUsd: '350.00',
      }),
    ];
    const costBases = [
      { assetId: 0, symbol: 'ALGO', avgCostUsd: '0.25000000', totalQuantity: '1000' },
    ];
    const prices: Record<number, PriceData> = {
      0: {
        assetId: 0,
        symbol: 'ALGO',
        priceUsd: '0.35',
        change24hPercent: '5',
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    const result = calculatePnl(holdings, costBases, [], [], prices);
    // (0.35 - 0.25) * 1000 = 100
    expect(new Decimal(result.unrealizedPnlUsd).toNumber()).toBeCloseTo(100, 0);
  });

  it('transaction fees calculated from tx history', () => {
    // Use larger fees to produce USD values above rounding threshold
    const transactions = [
      {
        txId: 'tx1',
        type: 'pay' as const,
        sender: 'A',
        assetId: 0,
        amount: '100',
        fee: '10',
        roundTime: 0,
        confirmedRound: 1,
      },
      {
        txId: 'tx2',
        type: 'pay' as const,
        sender: 'A',
        assetId: 0,
        amount: '200',
        fee: '10',
        roundTime: 0,
        confirmedRound: 2,
      },
    ];
    const prices: Record<number, PriceData> = {
      0: {
        assetId: 0,
        symbol: 'ALGO',
        priceUsd: '0.30',
        change24hPercent: '0',
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    const result = calculatePnl([], [], transactions, [], prices);
    // 2 txns * 10 ALGO * $0.30 = $6.00
    expect(new Decimal(result.feePaidUsd).toNumber()).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 1 — Health Score', () => {
  it('score is bounded 0-100', () => {
    const result = calculateHealthScore(
      '5000',
      {
        totalValueUsd: '10000.00',
        assetAllocation: { ALGO: { valueUsd: '10000', percent: '100' } },
        categoryAllocation: { volatile: '100', stablecoin: '0', lending: '0' },
        protocolAllocation: { native: '100', folks: '0', tinyman: '0', pact: '0' },
        directExposure: {},
        indirectExposure: {},
        trueExposure: { ALGO: { valueUsd: '10000', percent: '100' } },
        hhi: '10000',
      },
      [],
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('score is an integer', () => {
    const result = calculateHealthScore(
      '2500',
      {
        totalValueUsd: '5000.00',
        assetAllocation: {},
        categoryAllocation: { volatile: '50', stablecoin: '50', lending: '0' },
        protocolAllocation: { native: '50', folks: '50', tinyman: '0', pact: '0' },
        directExposure: {},
        indirectExposure: {},
        trueExposure: {},
        hhi: '2500',
      },
      [],
    );
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('high HHI (concentration) → low diversification component', () => {
    const highConcentration = calculateHealthScore(
      '9000',
      {
        totalValueUsd: '10000.00',
        assetAllocation: {},
        categoryAllocation: { volatile: '90', stablecoin: '10', lending: '0' },
        protocolAllocation: { native: '100', folks: '0', tinyman: '0', pact: '0' },
        directExposure: {},
        indirectExposure: {},
        trueExposure: {},
        hhi: '9000',
      },
      [],
    );
    expect(highConcentration.components.diversification).toBeLessThan(10);
  });

  it('generates strengths and weaknesses arrays', () => {
    const result = calculateHealthScore(
      '3000',
      {
        totalValueUsd: '10000.00',
        assetAllocation: { ALGO: { valueUsd: '5000', percent: '50' } },
        categoryAllocation: { volatile: '50', stablecoin: '30', lending: '20' },
        protocolAllocation: { native: '50', folks: '40', tinyman: '10', pact: '0' },
        directExposure: {},
        indirectExposure: {},
        trueExposure: {},
        hhi: '3000',
      },
      [],
    );
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(Array.isArray(result.weaknesses)).toBe(true);
  });
});
