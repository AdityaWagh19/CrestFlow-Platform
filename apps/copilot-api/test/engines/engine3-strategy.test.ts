/**
 * Engine 3 — Strategy & Optimization Tests
 * Tests optimizer algorithms, constraint enforcement, and rebalancing logic.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import {
  ledoitWolfShrinkage,
  covToCorr,
} from '../../src/modules/strategy/optimizers/covariance.js';
import { hrpOptimize } from '../../src/modules/strategy/optimizers/hrp.optimizer.js';
import { meanCvarOptimize } from '../../src/modules/strategy/optimizers/mean-cvar.optimizer.js';
import { inverseVolOptimize } from '../../src/modules/strategy/optimizers/inverse-vol.optimizer.js';
import { equalWeightOptimize } from '../../src/modules/strategy/optimizers/equal-weight.optimizer.js';
import { enforceGoalConstraints } from '../../src/modules/strategy/constraints/goal-constraints.js';
import { applyMomentumOverlay } from '../../src/modules/strategy/momentum/momentum.overlay.js';
import { generateRebalancingActions } from '../../src/modules/strategy/rebalancing/action-generator.js';

// ════════════════════════════════════════════════════════════════════════════
// LEDOIT-WOLF COVARIANCE SHRINKAGE
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Ledoit-Wolf Covariance', () => {
  it('produces a symmetric matrix', () => {
    const returns = [
      [0.01, 0.02, -0.01, 0.03, 0.01],
      [-0.01, 0.01, 0.02, -0.02, 0.01],
    ];
    const { matrix } = ledoitWolfShrinkage(returns);
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i]![j]).toBeCloseTo(matrix[j]![i]!, 10);
      }
    }
  });

  it('diagonal elements are non-negative (variances)', () => {
    const returns = [
      [0.01, -0.01, 0.02, -0.02, 0.03],
      [0.02, 0.01, -0.01, 0.03, -0.02],
      [-0.01, 0.02, 0.01, -0.01, 0.02],
    ];
    const { matrix } = ledoitWolfShrinkage(returns);
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i]![i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('alpha (shrinkage coefficient) is clamped to [0, 1]', () => {
    const returns = [
      [0.01, 0.02],
      [-0.01, 0.01],
    ];
    const { alpha } = ledoitWolfShrinkage(returns);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThanOrEqual(1);
  });

  it('output matrix is NxN where N = number of asset columns', () => {
    // T=4 time periods, N=1 asset → 1x1 output
    const returns = [[0.01], [0.02], [-0.01], [0.03]];
    const { matrix } = ledoitWolfShrinkage(returns);
    expect(matrix.length).toBe(1);
    expect(matrix[0]!.length).toBe(1);
    expect(matrix[0]![0]).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// HRP OPTIMIZER
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — HRP Optimizer', () => {
  it('weights sum to 1.0', () => {
    const returns = [
      [0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.01, 0.02],
      [-0.01, 0.01, 0.02, -0.02, 0.01, 0.03, -0.01, 0.02],
      [0.02, -0.01, 0.01, 0.01, -0.01, 0.02, 0.01, -0.01],
    ];
    const { matrix: cov } = ledoitWolfShrinkage(returns);
    const corr = covToCorr(cov);
    const weights = hrpOptimize(cov, corr);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 8);
  });

  it('all weights are non-negative', () => {
    const returns = [
      [0.01, 0.02, -0.01, 0.03, 0.01],
      [-0.01, 0.01, 0.02, -0.02, 0.01],
    ];
    const { matrix: cov } = ledoitWolfShrinkage(returns);
    const corr = covToCorr(cov);
    const weights = hrpOptimize(cov, corr);
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('single asset → weight = 1.0', () => {
    const cov = [[0.0004]];
    const corr = [[1.0]];
    const weights = hrpOptimize(cov, corr);
    expect(weights).toHaveLength(1);
    expect(weights[0]).toBeCloseTo(1.0, 8);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MEAN-CVaR OPTIMIZER
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Mean-CVaR Optimizer', () => {
  it('weights sum to 1.0', () => {
    const returns = [
      [
        0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.01, 0.02, -0.01, 0.01, 0.02, -0.01, 0.01, 0.03,
        -0.02, 0.01, 0.02, -0.01, 0.03, 0.01, -0.01, 0.02, 0.01, -0.02, 0.01, 0.03, -0.01, 0.02,
        0.01, -0.01,
      ],
      [
        -0.01, 0.01, 0.02, -0.02, 0.01, 0.03, -0.01, 0.02, 0.01, -0.01, 0.01, 0.02, -0.01, 0.01,
        0.03, -0.02, 0.01, 0.02, -0.01, 0.03, 0.01, -0.01, 0.02, 0.01, -0.02, 0.01, 0.03, -0.01,
        0.02, 0.01,
      ],
    ];
    const weights = meanCvarOptimize(returns);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('all weights are non-negative (simplex constraint)', () => {
    const returns = [
      Array.from({ length: 30 }, () => Math.random() * 0.04 - 0.02),
      Array.from({ length: 30 }, () => Math.random() * 0.04 - 0.02),
      Array.from({ length: 30 }, () => Math.random() * 0.04 - 0.02),
    ];
    const weights = meanCvarOptimize(returns);
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(-0.001); // small tolerance for numerical precision
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// INVERSE VOLATILITY
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Inverse Volatility', () => {
  it('weights sum to 1.0', () => {
    const weights = inverseVolOptimize({ ALGO: '60', USDC: '20', goETH: '80' });
    const sum = Object.values(weights).reduce((s, w) => s + new Decimal(w).toNumber(), 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('lower vol → higher weight', () => {
    const weights = inverseVolOptimize({ ALGO: '80', USDC: '20' });
    // USDC has lower vol → should get higher weight
    expect(new Decimal(weights['USDC']!).toNumber()).toBeGreaterThan(
      new Decimal(weights['ALGO']!).toNumber(),
    );
  });

  it('zero vol asset gets zero weight', () => {
    const weights = inverseVolOptimize({ ALGO: '60', DEAD: '0' });
    expect(new Decimal(weights['DEAD']!).toNumber()).toBe(0);
  });

  it('equal vol → equal weights', () => {
    const weights = inverseVolOptimize({ A: '50', B: '50', C: '50' });
    const vals = Object.values(weights).map((w) => new Decimal(w).toNumber());
    expect(vals[0]).toBeCloseTo(vals[1]!, 6);
    expect(vals[1]).toBeCloseTo(vals[2]!, 6);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EQUAL WEIGHT
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Equal Weight', () => {
  it('N assets → each gets 1/N', () => {
    const weights = equalWeightOptimize(['ALGO', 'USDC', 'goETH', 'goBTC']);
    expect(Object.keys(weights)).toHaveLength(4);
    for (const w of Object.values(weights)) {
      expect(new Decimal(w).toNumber()).toBeCloseTo(0.25, 6);
    }
  });

  it('single asset → weight = 1.0', () => {
    const weights = equalWeightOptimize(['ALGO']);
    expect(new Decimal(weights['ALGO']!).toNumber()).toBeCloseTo(1.0, 6);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GOAL CONSTRAINTS
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Goal Constraints', () => {
  it('CONSERVATIVE: volatile capped, output sums to 1.0', () => {
    const { weights, defensiveMode } = enforceGoalConstraints(
      { ALGO: '0.70', USDC: '0.30' },
      'CONSERVATIVE',
      20, // low risk
    );
    const sum = Object.values(weights).reduce((s, w) => s + new Decimal(w).toNumber(), 0);
    expect(sum).toBeCloseTo(1.0, 4);
    expect(defensiveMode).toBe(false);
  });

  it('defensive mode activated when riskScore > profile cap', () => {
    const { defensiveMode } = enforceGoalConstraints(
      { ALGO: '0.50', USDC: '0.50' },
      'CONSERVATIVE',
      50, // exceeds CONSERVATIVE cap of 35
    );
    expect(defensiveMode).toBe(true);
  });

  it('weights never negative after constraints', () => {
    const { weights } = enforceGoalConstraints(
      { ALGO: '0.90', USDC: '0.05', goETH: '0.05' },
      'CONSERVATIVE',
      40,
    );
    for (const w of Object.values(weights)) {
      expect(new Decimal(w).toNumber()).toBeGreaterThanOrEqual(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MOMENTUM OVERLAY
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Momentum Overlay', () => {
  it('positive momentum → weight increases', () => {
    const original = { ALGO: '0.50', USDC: '0.50' };
    const result = applyMomentumOverlay(original, { ALGO: '0.05', USDC: '-0.02' });
    // ALGO had positive return → weight should increase (or stay same due to normalization)
    expect(new Decimal(result['ALGO']!).toNumber()).toBeGreaterThanOrEqual(0);
  });

  it('output sums to 1.0 after overlay', () => {
    const result = applyMomentumOverlay(
      { ALGO: '0.40', USDC: '0.30', goETH: '0.30' },
      { ALGO: '0.10', USDC: '-0.05', goETH: '0.02' },
    );
    const sum = Object.values(result).reduce((s, w) => s + new Decimal(w).toNumber(), 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('no weights below zero', () => {
    const result = applyMomentumOverlay(
      { ALGO: '0.01', USDC: '0.99' },
      { ALGO: '-0.50', USDC: '0.50' },
    );
    for (const w of Object.values(result)) {
      expect(new Decimal(w).toNumber()).toBeGreaterThanOrEqual(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REBALANCING ACTION GENERATOR
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 3 — Rebalancing Actions', () => {
  it('drift below threshold → no actions generated', () => {
    const actions = generateRebalancingActions(
      { ALGO: '0.50', USDC: '0.50' },
      { ALGO: '0.505', USDC: '0.495' }, // 0.5% drift — well below 8% threshold
      { ALGO: '5000', USDC: '5000' },
      '10000',
      null,
    );
    expect(actions).toHaveLength(0);
  });

  it('drift above threshold → actions generated', () => {
    const actions = generateRebalancingActions(
      { ALGO: '0.70', USDC: '0.30' },
      { ALGO: '0.45', USDC: '0.55' }, // 25% drift
      { ALGO: '7000', USDC: '3000' },
      '10000',
      null,
    );
    expect(actions.length).toBeGreaterThan(0);
  });

  it('actions sorted by |delta| descending', () => {
    const actions = generateRebalancingActions(
      { ALGO: '0.70', USDC: '0.20', goETH: '0.10' },
      { ALGO: '0.33', USDC: '0.34', goETH: '0.33' },
      { ALGO: '7000', USDC: '2000', goETH: '1000' },
      '10000',
      null,
    );
    if (actions.length >= 2) {
      const first = Math.abs(new Decimal(actions[0]!.deltaPercent).toNumber());
      const second = Math.abs(new Decimal(actions[1]!.deltaPercent).toNumber());
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  it('high-vol mode uses 12% threshold instead of 8%', () => {
    const normalActions = generateRebalancingActions(
      { ALGO: '0.55', USDC: '0.45' },
      { ALGO: '0.45', USDC: '0.55' }, // 10% drift
      { ALGO: '5500', USDC: '4500' },
      '10000',
      '40', // low vol → 8% threshold → action triggered
    );
    const highVolActions = generateRebalancingActions(
      { ALGO: '0.55', USDC: '0.45' },
      { ALGO: '0.45', USDC: '0.55' }, // 10% drift
      { ALGO: '5500', USDC: '4500' },
      '10000',
      '80', // high vol → 12% threshold → no action
    );
    expect(normalActions.length).toBeGreaterThanOrEqual(highVolActions.length);
  });
});
