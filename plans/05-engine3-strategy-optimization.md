# Plan 05 — Engine 3: Strategy & Optimization Engine

**Status:** Approved  
**Priority:** P0  
**Depends on:** Plan 04 (Engine 2 — `RiskAnalysisCompleted` event + `risk_snapshots` table)  
**Feeds into:** Engine 6 (Autonomous Execution — `StrategyPlanCreated` → execution plan)  
**Also feeds:** Engine 5 (User Intelligence — strategy context for AI reasoning)

---

## Objective

Engine 3 is the portfolio strategy and optimization engine. It answers the question **"what should your portfolio actually look like?"** by taking Engine 1's portfolio state and Engine 2's risk analysis as inputs and producing concrete, mathematically grounded target allocations and rebalancing action plans.

It:
1. Subscribes to `RiskAnalysisCompleted` events from Engine 2
2. Loads the portfolio snapshot, risk snapshot, and user goal profile
3. Selects the most sophisticated optimization model available given current data volume
4. Computes target allocation weights with Ledoit-Wolf shrinkage on covariance
5. Applies goal-based hard constraints and risk-level defensive overrides
6. Applies a lightweight momentum signal overlay
7. Generates an ordered rebalancing action plan
8. Writes an immutable `StrategySnapshot` record
9. Emits `StrategyPlanCreated` for Engine 6 (Execution) and Engine 5 (Copilot)

**Engine 3 produces the first output a user can act on:** "Move 12% from ALGO into USDC lending on Folks Finance."

---

## Architecture Decisions

### Progressive Model Selection — Core Design Principle
Engine 3 adapts its sophistication to available data. The model declares its own minimum data requirement and the engine selects the best model that can run.

```
snapshotCount < 14  →  Equal Weight + Goal Tilt
snapshotCount 14-29 →  Inverse Volatility (Naive Risk Parity)
snapshotCount 30-89 →  HRP + Mean-CVaR Ensemble (Ledoit-Wolf covariance)
snapshotCount 90+   →  HRP + Mean-CVaR + Black-Litterman Views (P2 stub)
```

This is an **adaptive portfolio system** — it gets smarter as the platform accumulates user data, without breaking or requiring fallback error handling.

### Ledoit-Wolf Shrinkage on All Covariance Estimates
The standard sample covariance matrix amplifies noise in small portfolios (5-15 assets). Ledoit-Wolf shrinkage blends the sample covariance with a structured target (scaled identity):

```
Sigma_shrunk = (1 - alpha) * Sigma_sample + alpha * Sigma_target
```

Where alpha is analytically computed — no cross-validation, no hyperparameters. Applied to every covariance estimate passed to HRP and Mean-CVaR.

### HRP + Mean-CVaR Ensemble
Two SOTA methods, complementary by design:
- **HRP:** Structural diversification via hierarchical clustering. Does not require matrix inversion. Robust to correlated assets.
- **Mean-CVaR:** Directly minimizes expected tail loss. Coherent risk measure. Links to Engine 2's CVaR metric.

50/50 blend: `final_weight = 0.5 * w_hrp + 0.5 * w_cvar`

### Goal Profile as Hard Constraints
User goal applies **binding bounds** to the optimizer output. If the optimizer produces weights violating goal constraints, they are clipped and renormalized.

### Risk-Level Defensive Override
If Engine 2's composite risk score breaches the user's profile cap, Engine 3 generates a **defensive rebalancing plan first** (shift toward stablecoins/lending) before running the normal optimization.

---

## SOTA Methods — Full Justification

### Why NOT Mean-Variance Optimization (MVO)
1. Assumes normally distributed returns — DeFi has fat tails and extreme kurtosis
2. Requires inverting the covariance matrix — numerically unstable when assets are correlated
3. Produces extreme concentrated weights — puts 80%+ in 1-2 assets
4. Strictly dominated by every method in our stack

### Why NOT Deep Reinforcement Learning (DRL)
1. Requires 10,000+ environment episodes to converge
2. No DeFi environment simulator exists for Algorand
3. Extreme backtest overfitting risk
4. Low signal-to-noise ratio in crypto
5. Community consensus: not worth complexity for portfolios under $1M

### Why NOT GARCH Volatility Models
Requires 200+ daily return observations for parameter estimation. Deferred P2.

### Why NOT Copula-Based Optimization
Requires custom convex LP solver (CVXPY binary). Overkill for 5-15 asset universe. Deferred P3.

### Why HRP (Lopez de Prado, 2016)
1. Does not require inverting the covariance matrix — avoids core numerical instability of MVO
2. Uses hierarchical clustering to identify natural diversification clusters
3. Proven to outperform MVO out-of-sample in crypto portfolios
4. Works well on small asset universes (5-15 assets)
5. Minimum 30 snapshots — achievable within weeks

### Why Mean-CVaR
1. CVaR is a coherent risk measure (sub-additive, unlike VaR)
2. Directly minimizes expected tail loss — the metric Engine 2 already computes
3. Formulated as a Linear Program — efficient, no quadratic solver needed
4. Non-parametric — no distribution assumptions
5. Downside-only — does not penalize upside volatility

### Why Ledoit-Wolf Shrinkage
1. Closed-form, analytical — no hyperparameters to tune
2. Proven to reduce estimation error in small portfolios
3. Improves out-of-sample Sharpe ratio and reduces portfolio turnover
4. Works identically at 5 assets or 50 assets

### Why Momentum Signal Overlay
1. Cross-sectional momentum (assets with positive 14D returns weighted slightly higher) is the most robust factor in crypto
2. Zero new infrastructure — computed from existing snapshot history
3. Conservative magnitude (±2%) — signal, not a decision

### Why NOT Factor Models (full)
Quality factor = already embedded via protocol safety scores (Plan 04).  
Low-vol factor = already embedded via inverse-volatility weighting.  
Value factor = no P/E equivalent in DeFi.  
Full factor model = overkill for 5-15 asset Algorand universe.

---

## 7-Step Processing Pipeline

```
RiskAnalysisCompleted { riskSnapshotId, userId, riskScore, riskLevel }
    |
    v
[Step 1] Load all inputs
    |-- Load latest PortfolioSnapshot (true exposure, positions, volatility)
    |-- Load latest RiskSnapshot (riskScore, CVaR, HHI, concentrationScore)
    |-- Load user goal profile (CONSERVATIVE / MODERATE / AGGRESSIVE)
    +-- Load last 90 portfolio snapshots -> extract return series
    |
    v
[Step 2] Check defensive override condition
    |-- IF riskScore > goal profile risk cap:
    |   +-- Generate defensive plan (shift X% to stablecoin/lending)
    |       SET defensiveMode = true
    +-- ELSE: continue to normal optimization
    |
    v
[Step 3] Select optimization model
    +-- snapshotCount -> model enum (EQUAL_WEIGHT | INVERSE_VOL | HRP_CVAR | BL_HRP_CVAR)
    |
    v
[Step 4] Compute Ledoit-Wolf covariance (if snapshotCount >= 30)
    |-- Build NxT returns matrix from snapshot history
    |-- Compute sample covariance Sigma_sample
    |-- Compute Ledoit-Wolf shrinkage coefficient alpha
    +-- Sigma_shrunk = (1-alpha)*Sigma_sample + alpha*Sigma_target
    |
    v
[Step 5] Run selected optimizer
    |-- EQUAL_WEIGHT: uniform weights
    |-- INVERSE_VOL: w_i = (1/sigma_i) / Sum(1/sigma_j)
    |-- HRP_CVAR:
    |   |-- Run HRP on Ledoit-Wolf covariance -> w_hrp
    |   |-- Run Mean-CVaR optimization -> w_cvar
    |   +-- Blend: w_final = 0.5 * w_hrp + 0.5 * w_cvar
    +-- Apply momentum signal overlay: +/-2% tilt per asset
    |
    v
[Step 6] Apply goal constraints + normalize
    |-- Clip volatile allocation to profile max
    |-- Clip stablecoin/lending to profile min
    |-- If defensive mode: shift additional 10% to stablecoin
    +-- Renormalize weights to sum = 1.0
    |
    v
[Step 7] Generate rebalancing actions + Write + Emit
    |-- diff_i = target_weight_i - current_weight_i per asset
    |-- Flag |diff_i| > threshold as rebalancing actions
    |-- Order by |diff_i| descending (largest drift first)
    |-- prisma.strategySnapshot.create(...)  <- INSERT only
    +-- emit StrategyPlanCreated { strategyId, userId, model, actionCount }
```

---

## Optimizer Implementations

### Ledoit-Wolf Shrinkage

**File:** `optimizers/covariance.ts`

```typescript
import Decimal from 'decimal.js';

/**
 * Computes the Ledoit-Wolf analytically shrunk covariance matrix.
 * Scaled identity target variant — closed-form, no tuning required.
 *
 * Reference: Ledoit & Wolf (2004), "A well-conditioned estimator for
 * large-dimensional covariance matrices"
 *
 * @param returns N x T matrix: N assets (rows), T time periods (cols)
 * @returns Shrunk N x N covariance matrix as number[][]
 */
export function ledoitWolfShrinkage(returns: number[][]): number[][] {
  const n = returns.length;    // number of assets
  const t = returns[0].length; // number of time periods

  // Compute sample means
  const means = returns.map(r => r.reduce((s, v) => s + v, 0) / t);

  // Center returns
  const centered = returns.map((r, i) => r.map(v => v - means[i]));

  // Sample covariance: Sigma = (1/T) * X * X^T
  const sigma: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      centered[i].reduce((s, _, k) => s + centered[i][k] * centered[j][k], 0) / t
    )
  );

  // Shrinkage target: scaled identity
  // mu = trace(Sigma) / n  (average variance)
  const mu = sigma.reduce((s, row, i) => s + row[i], 0) / n;
  const target: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? mu : 0))
  );

  // Analytical shrinkage coefficient alpha
  let frobDiff = 0;
  let frobSigma = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = sigma[i][j] - target[i][j];
      frobDiff += d * d;
      frobSigma += sigma[i][j] * sigma[i][j];
    }
  }
  const alpha = frobSigma > 0
    ? Math.min(1, ((n + 2) / t * frobDiff) / frobSigma)
    : 0;

  // Sigma_shrunk = (1-alpha) * Sigma_sample + alpha * Sigma_target
  return sigma.map((row, i) =>
    row.map((v, j) => (1 - alpha) * v + alpha * target[i][j])
  );
}

/** Convert covariance matrix to correlation matrix */
export function covToCorr(cov: number[][]): number[][] {
  const stds = cov.map((row, i) => Math.sqrt(Math.max(0, row[i])));
  return cov.map((row, i) =>
    row.map((v, j) =>
      stds[i] > 0 && stds[j] > 0 ? v / (stds[i] * stds[j]) : 0
    )
  );
}
```

---

### HRP Optimizer

**File:** `optimizers/hrp.optimizer.ts`

```typescript
/**
 * Hierarchical Risk Parity (HRP)
 * Reference: Lopez de Prado (2016), "Building Diversified Portfolios that
 * Outperform Out-of-Sample"
 *
 * 3 Steps:
 *   1. Hierarchical Clustering on correlation distance matrix
 *   2. Quasi-Diagonalization (reorder by cluster tree)
 *   3. Recursive Bisection with inverse-variance allocation
 */
export function hrpOptimize(cov: number[][], corr: number[][]): number[] {
  const n = cov.length;

  // Step 1: Distance matrix from correlation
  // d(i,j) = sqrt((1 - rho_ij) / 2)
  const dist: number[][] = corr.map(row =>
    row.map(rho => Math.sqrt(Math.max(0, (1 - rho) / 2)))
  );

  // Step 2: Single-linkage hierarchical clustering
  const sortedItems = hierarchicalCluster(dist, n);

  // Step 3: Recursive bisection
  const weights = new Array(n).fill(1.0);
  recursiveBisection(sortedItems, cov, weights);

  // Normalize
  const total = weights.reduce((s, w) => s + w, 0);
  return weights.map(w => w / total);
}

function hierarchicalCluster(dist: number[][], n: number): number[] {
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);

  while (clusters.length > 1) {
    let minDist = Infinity;
    let mergeI = 0, mergeJ = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Single-linkage: minimum distance between any members
        const d = Math.min(
          ...clusters[i].flatMap(a => clusters[j].map(b => dist[a][b]))
        );
        if (d < minDist) { minDist = d; mergeI = i; mergeJ = j; }
      }
    }

    const merged = [...clusters[mergeI], ...clusters[mergeJ]];
    clusters = clusters.filter((_, i) => i !== mergeI && i !== mergeJ);
    clusters.push(merged);
  }

  return clusters[0];
}

function recursiveBisection(
  items: number[],
  cov: number[][],
  weights: number[]
): void {
  if (items.length <= 1) return;

  const mid = Math.floor(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  const varLeft = clusterVariance(left, cov);
  const varRight = clusterVariance(right, cov);
  const total = varLeft + varRight;
  const alpha = total > 0 ? varRight / total : 0.5;

  left.forEach(i => { weights[i] *= alpha; });
  right.forEach(i => { weights[i] *= (1 - alpha); });

  recursiveBisection(left, cov, weights);
  recursiveBisection(right, cov, weights);
}

function clusterVariance(items: number[], cov: number[][]): number {
  const variances = items.map(i => Math.max(cov[i][i], 1e-10));
  const invVarSum = variances.reduce((s, v) => s + 1 / v, 0);
  const w = variances.map(v => (1 / v) / invVarSum);

  let pv = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = 0; b < items.length; b++) {
      pv += w[a] * w[b] * cov[items[a]][items[b]];
    }
  }
  return pv;
}
```

---

### Mean-CVaR Optimizer

**File:** `optimizers/mean-cvar.optimizer.ts`

```typescript
/**
 * Mean-CVaR Portfolio Optimization via Historical Simulation.
 * Minimizes CVaR at 95% confidence level using gradient descent
 * on the Rockafellar-Uryasev (2000) convex formulation.
 *
 * Appropriate for N <= 15 assets, T >= 30 periods.
 * No external LP solver required — iterative descent on simplex.
 *
 * Reference: Rockafellar & Uryasev (2000),
 * "Optimization of Conditional Value-at-Risk"
 */
export function meanCvarOptimize(
  returns: number[][],   // N x T
  alpha: number = 0.05   // tail probability (0.05 = 95% CVaR)
): number[] {
  const n = returns.length;
  const t = returns[0].length;

  // Initialize: equal allocation
  let weights = new Array(n).fill(1 / n);

  const lr = 0.005;
  const iterations = 500;

  for (let iter = 0; iter < iterations; iter++) {
    // Portfolio return per period
    const pReturns = Array.from({ length: t }, (_, k) =>
      weights.reduce((s, w, i) => s + w * returns[i][k], 0)
    );

    // VaR threshold (alpha-quantile of losses)
    const sorted = [...pReturns].sort((a, b) => a - b);
    const varIdx = Math.max(1, Math.floor(alpha * t));
    const varThreshold = sorted[varIdx];

    // Gradient: penalize assets contributing to tail losses
    const gradient = new Array(n).fill(0);
    let tailCount = 0;
    for (let k = 0; k < t; k++) {
      if (pReturns[k] <= varThreshold) {
        for (let i = 0; i < n; i++) {
          gradient[i] += returns[i][k];
        }
        tailCount++;
      }
    }

    if (tailCount > 0) {
      for (let i = 0; i < n; i++) {
        weights[i] -= lr * (gradient[i] / tailCount);
      }
    }

    // Project onto probability simplex (weights >= 0, sum = 1)
    weights = projectOntoSimplex(weights);
  }

  return weights;
}

function projectOntoSimplex(w: number[]): number[] {
  const n = w.length;
  const sorted = [...w].sort((a, b) => b - a);
  let cumSum = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cumSum += sorted[i];
    if (sorted[i] - (cumSum - 1) / (i + 1) > 0) rho = i;
  }
  const theta = (sorted.slice(0, rho + 1).reduce((s, v) => s + v, 0) - 1) / (rho + 1);
  return w.map(v => Math.max(0, v - theta));
}
```

---

### Inverse Volatility (Naive Risk Parity)

**File:** `optimizers/inverse-vol.optimizer.ts`

```typescript
import Decimal from 'decimal.js';

/**
 * Naive Risk Parity: weight assets by inverse of their realized volatility.
 * Uses Engine 2's realizedVol30dPercent per asset.
 * Requires 0 correlation data — works from Day 14.
 *
 * w_i = (1/sigma_i) / Sum_j(1/sigma_j)
 */
export function inverseVolOptimize(
  assetVols: Record<string, string>  // symbol -> annualized vol %
): Record<string, string> {
  const entries = Object.entries(assetVols);
  const invVols = entries.map(([sym, vol]) => {
    const v = new Decimal(vol);
    return [sym, v.lte(0) ? new Decimal(0) : new Decimal(1).div(v)] as const;
  });

  const total = invVols.reduce((s, [, inv]) => s.plus(inv), new Decimal(0));

  const weights: Record<string, string> = {};
  for (const [sym, inv] of invVols) {
    weights[sym] = total.isZero()
      ? new Decimal(1 / entries.length).toFixed(8)
      : inv.div(total).toFixed(8);
  }
  return weights;
}
```

---

### Momentum Signal Overlay

**File:** `optimizers/momentum.overlay.ts`

```typescript
import Decimal from 'decimal.js';

const MOMENTUM_TILT = new Decimal('0.02'); // +/-2% absolute weight adjustment
const ZERO = new Decimal(0);
const ONE = new Decimal(1);

/**
 * Lightweight cross-sectional momentum overlay.
 * Assets with positive 14-day return get +2% weight tilt.
 * Assets with negative 14-day return get -2% weight tilt.
 * Weights are re-normalized after tilt. Conservative — signal, not a decision.
 */
export function applyMomentumOverlay(
  weights: Record<string, string>,
  assetReturns14d: Record<string, string>
): Record<string, string> {
  const adjusted: Record<string, string> = {};

  for (const [sym, w] of Object.entries(weights)) {
    const weight = new Decimal(w);
    const momentum = new Decimal(assetReturns14d[sym] ?? '0');
    const tilt = momentum.isPositive() ? MOMENTUM_TILT : MOMENTUM_TILT.neg();
    const tilted = Decimal.max(ZERO, Decimal.min(ONE, weight.plus(tilt)));
    adjusted[sym] = tilted.toFixed(8);
  }

  // Re-normalize to sum = 1
  const total = Object.values(adjusted).reduce(
    (s, w) => s.plus(w), new Decimal(0)
  );
  if (total.isZero()) return weights;

  const normalized: Record<string, string> = {};
  for (const [sym, w] of Object.entries(adjusted)) {
    normalized[sym] = new Decimal(w).div(total).toFixed(8);
  }
  return normalized;
}
```

---

### Goal Constraint Enforcer

**File:** `constraints/goal-constraints.ts`

```typescript
import Decimal from 'decimal.js';

export const GOAL_PROFILES = {
  CONSERVATIVE: {
    maxVolatilePercent: new Decimal('0.25'),
    minStablePercent:   new Decimal('0.65'),
    maxRiskScore:       35,
  },
  MODERATE: {
    maxVolatilePercent: new Decimal('0.55'),
    minStablePercent:   new Decimal('0.25'),
    maxRiskScore:       60,
  },
  AGGRESSIVE: {
    maxVolatilePercent: new Decimal('0.85'),
    minStablePercent:   new Decimal('0.05'),
    maxRiskScore:       80,
  },
} as const;

// Asset category classification
export const VOLATILE_ASSETS = new Set(['ALGO', 'goETH', 'goBTC', 'TINY', 'PACT', 'GARD']);
export const STABLE_ASSETS   = new Set(['USDC', 'USDT', 'USDC_LENDING', 'ALGO_LENDING']);

/**
 * Enforces goal profile constraints on optimizer output.
 * Clips volatile allocation, ensures minimum stable, handles defensive mode.
 * Always renormalizes to sum = 1.0.
 */
export function enforceGoalConstraints(
  weights: Record<string, string>,
  goalProfile: keyof typeof GOAL_PROFILES,
  riskScore: number,
): { weights: Record<string, string>; defensiveMode: boolean } {
  const profile = GOAL_PROFILES[goalProfile];
  const defensiveMode = riskScore > profile.maxRiskScore;

  let result = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, new Decimal(v)])
  );

  // Compute volatile total
  const volatileTotal = Object.entries(result)
    .filter(([sym]) => VOLATILE_ASSETS.has(sym))
    .reduce((s, [, w]) => s.plus(w), new Decimal(0));

  // Clip volatile if over profile cap
  if (volatileTotal.gt(profile.maxVolatilePercent)) {
    const scaleFactor = profile.maxVolatilePercent.div(volatileTotal);
    for (const [sym] of Object.entries(result).filter(([s]) => VOLATILE_ASSETS.has(s))) {
      result[sym] = result[sym].mul(scaleFactor);
    }
  }

  // Defensive mode: shift additional 10% from volatile to stable
  if (defensiveMode) {
    const defensiveShift = new Decimal('0.10');
    const volAssets = Object.keys(result).filter(s => VOLATILE_ASSETS.has(s) && result[s].gt(0));
    const shiftPerAsset = volAssets.length > 0
      ? defensiveShift.div(volAssets.length)
      : new Decimal(0);

    for (const sym of volAssets) {
      result[sym] = Decimal.max(new Decimal(0), result[sym].minus(shiftPerAsset));
    }

    // Add to USDC lending (preferred) or USDC
    const stableTarget = result['USDC_LENDING'] !== undefined ? 'USDC_LENDING' : 'USDC';
    if (result[stableTarget] !== undefined) {
      result[stableTarget] = result[stableTarget].plus(defensiveShift);
    }
  }

  // Renormalize to sum = 1
  const total = Object.values(result).reduce((s, w) => s.plus(w), new Decimal(0));
  const normalized: Record<string, string> = {};
  for (const [sym, w] of Object.entries(result)) {
    normalized[sym] = total.isZero()
      ? new Decimal(1 / Object.keys(result).length).toFixed(8)
      : w.div(total).toFixed(8);
  }

  return { weights: normalized, defensiveMode };
}
```

---

### Rebalancing Action Generator

**File:** `rebalancing/action-generator.ts`

```typescript
import Decimal from 'decimal.js';

export interface RebalancingAction {
  assetSymbol: string;
  currentWeightPercent: string;  // DECIMAL e.g. "67.4200"
  targetWeightPercent: string;
  deltaPercent: string;           // signed — negative = reduce
  currentValueUsd: string;
  targetValueUsd: string;
  deltaUsd: string;               // signed
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  action: 'INCREASE' | 'DECREASE' | 'HOLD';
}

// Thresholds
const BASE_THRESHOLD_PCT = new Decimal('5.0');
const HIGH_VOL_THRESHOLD_PCT = new Decimal('8.0');
const HIGH_VOL_CUTOFF = 60.0; // annualized vol %

export function generateRebalancingActions(
  currentWeights: Record<string, string>,
  targetWeights: Record<string, string>,
  positionValues: Record<string, string>,
  portfolioTotalUsd: string,
  realizedVol30dPercent: string | null,
): RebalancingAction[] {
  const threshold = realizedVol30dPercent !== null
    && parseFloat(realizedVol30dPercent) > HIGH_VOL_CUTOFF
    ? HIGH_VOL_THRESHOLD_PCT
    : BASE_THRESHOLD_PCT;

  const totalUsd = new Decimal(portfolioTotalUsd);
  const actions: RebalancingAction[] = [];
  const allAssets = new Set([
    ...Object.keys(currentWeights),
    ...Object.keys(targetWeights),
  ]);

  for (const symbol of allAssets) {
    const current = new Decimal(currentWeights[symbol] ?? '0').mul(100);
    const target  = new Decimal(targetWeights[symbol] ?? '0').mul(100);
    const delta   = target.minus(current);

    if (delta.abs().lt(threshold)) continue;

    const currentUsd = new Decimal(positionValues[symbol] ?? '0');
    const targetUsd  = totalUsd.mul(target.div(100));
    const deltaUsd   = targetUsd.minus(currentUsd);

    const deltaAbs = delta.abs().toNumber();
    const urgency: RebalancingAction['urgency'] =
      deltaAbs >= 20 ? 'CRITICAL' :
      deltaAbs >= 10 ? 'HIGH' :
      deltaAbs >=  5 ? 'MEDIUM' : 'LOW';

    actions.push({
      assetSymbol: symbol,
      currentWeightPercent: current.toFixed(4),
      targetWeightPercent: target.toFixed(4),
      deltaPercent: delta.toFixed(4),
      currentValueUsd: currentUsd.toFixed(8),
      targetValueUsd: targetUsd.toFixed(8),
      deltaUsd: deltaUsd.toFixed(8),
      urgency,
      action: delta.isPositive() ? 'INCREASE' : delta.isNegative() ? 'DECREASE' : 'HOLD',
    });
  }

  // Sort by |delta| descending (largest rebalances first)
  return actions.sort((a, b) =>
    parseFloat(b.deltaPercent.replace('-', '')) - parseFloat(a.deltaPercent.replace('-', ''))
  );
}
```

---

### Strategy Explainer

**File:** `explain/strategy-explainer.ts`

```typescript
/**
 * Produces plain-English explanation of the current strategy recommendation.
 * Trust layer — users will not act on allocations they do not understand.
 */
export interface StrategyExplanation {
  modelUsed: string;
  dataPoints: number;
  goalProfile: string;
  defensiveMode: boolean;
  riskContext: string;
  reasons: string[];
  disclaimer: string;
}

export function explainStrategy(params: {
  model: string;
  goalProfile: string;
  riskScore: number;
  riskLevel: string;
  hhi: string;
  snapshotsUsed: number;
  defensiveMode: boolean;
  actions: Array<{ assetSymbol: string; deltaPercent: string; deltaUsd: string; action: string }>;
}): StrategyExplanation {
  const { model, goalProfile, riskScore, riskLevel, hhi, snapshotsUsed, defensiveMode, actions } = params;

  const modelDescriptions: Record<string, string> = {
    EQUAL_WEIGHT:  'Equal Weight — not enough history yet, building your risk profile',
    INVERSE_VOL:   'Inverse Volatility — lower-volatility assets receive higher weights',
    HRP_CVAR:      'Hierarchical Risk Parity + Tail Risk Optimization (HRP+CVaR)',
    BL_HRP_CVAR:   'Black-Litterman + HRP + Tail Risk Optimization (full institutional model)',
  };

  const reasons: string[] = [];

  if (defensiveMode) {
    reasons.push(
      `Your current risk score (${riskScore}/100) exceeds the ${goalProfile} profile limit. ` +
      `A defensive shift toward stablecoins has been applied automatically.`
    );
  }

  const hhiNum = parseFloat(hhi);
  if (hhiNum > 5000) {
    reasons.push(
      `Your portfolio is highly concentrated (HHI: ${Math.round(hhiNum)}/10,000). ` +
      `The optimizer is redistributing weight across assets to reduce single-asset dependency.`
    );
  } else if (hhiNum > 2500) {
    reasons.push(
      `Your concentration index is ${Math.round(hhiNum)}/10,000 (moderate). ` +
      `The optimizer is nudging allocation toward better diversification.`
    );
  }

  const largestAction = actions[0];
  if (largestAction) {
    const dir = largestAction.action === 'INCREASE' ? 'increase' : 'reduce';
    const usdAbs = Math.abs(parseFloat(largestAction.deltaUsd)).toFixed(2);
    reasons.push(
      `Largest change: ${dir} ${largestAction.assetSymbol} allocation by ` +
      `${Math.abs(parseFloat(largestAction.deltaPercent)).toFixed(2)}% (~$${usdAbs}).`
    );
  }

  if (snapshotsUsed < 14) {
    reasons.push(
      `Only ${snapshotsUsed} data points available — using Equal Weight as a starting point. ` +
      `More sophisticated optimization activates after 14 days.`
    );
  }

  return {
    modelUsed: modelDescriptions[model] ?? model,
    dataPoints: snapshotsUsed,
    goalProfile,
    defensiveMode,
    riskContext: `Current risk level: ${riskLevel} (score: ${riskScore}/100)`,
    reasons,
    disclaimer:
      'This is a recommendation only. CrestFlow does not execute any trades ' +
      'without your explicit approval through the Execution Engine.',
  };
}
```

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions)

```prisma
model StrategySnapshot {
  id                      String      @id @default(uuid()) @db.Uuid
  userId                  String      @db.Uuid
  portfolioSnapshotId     String      @db.Uuid
  riskSnapshotId          String      @db.Uuid

  // Model and context
  model                   ModelType
  snapshotsUsed           Int
  goalProfile             GoalProfile
  ledoitWolfAlpha         String?     // DECIMAL shrinkage coefficient
  defensiveMode           Boolean     @default(false)

  // Allocations (JSONB)
  targetAllocation        Json        // { ALGO: "0.45200000", USDC: "0.30100000", ... }
  currentAllocation       Json        // snapshot of weights at compute time

  // Rebalancing (JSONB)
  rebalancingActions      Json        // RebalancingAction[]
  rebalanceRequired       Boolean
  maxDeviationPercent     String      // DECIMAL

  // Explanation (JSONB)
  modelExplanation        Json        // StrategyExplanation

  // Momentum overlay
  momentumOverlayApplied  Boolean     @default(false)
  momentumSignals         Json?       // { ALGO: true, USDC: false, ... }

  // INSERT only
  createdAt               DateTime    @default(now())

  user                    User        @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("strategy_snapshots")
}

model UserGoalProfile {
  id           String      @id @default(uuid()) @db.Uuid
  userId       String      @db.Uuid @unique    // one per user
  goalProfile  GoalProfile @default(MODERATE)
  updatedAt    DateTime    @updatedAt
  createdAt    DateTime    @default(now())

  user         User        @relation(fields: [userId], references: [id])

  @@map("user_goal_profiles")
}

enum ModelType {
  EQUAL_WEIGHT
  INVERSE_VOL
  HRP_CVAR
  BL_HRP_CVAR   // P2 stub — not executed at MVP
}

enum GoalProfile {
  CONSERVATIVE
  MODERATE
  AGGRESSIVE
}
```

**Immutability enforcement:**
```sql
REVOKE UPDATE, DELETE ON strategy_snapshots FROM crestflow_app;
-- user_goal_profiles is mutable (user changes their goal)
```

---

## Module File Structure

```
apps/copilot-api/src/modules/strategy/
|-- strategy.controller.ts
|-- strategy.routes.ts
|-- strategy.service.ts                  <- 7-step pipeline orchestrator
|-- optimizers/
|   |-- covariance.ts                    <- Ledoit-Wolf shrinkage + covToCorr
|   |-- hrp.optimizer.ts                 <- HRP (3-step algorithm)
|   |-- mean-cvar.optimizer.ts           <- Mean-CVaR (gradient descent on simplex)
|   |-- inverse-vol.optimizer.ts         <- Naive Risk Parity fallback
|   |-- equal-weight.optimizer.ts        <- Seed model (Day 1)
|   +-- bl-hrp.optimizer.ts              <- Black-Litterman stub (P2)
|-- constraints/
|   +-- goal-constraints.ts             <- goal profile hard constraint enforcer
|-- rebalancing/
|   +-- action-generator.ts             <- diff -> ordered RebalancingAction[]
|-- momentum/
|   +-- momentum.overlay.ts             <- 14-day momentum tilt (+/-2%)
|-- explain/
|   +-- strategy-explainer.ts           <- plain-English rationale generator
|-- repositories/
|   |-- strategy-snapshot.repository.ts <- INSERT only
|   +-- goal-profile.repository.ts      <- upsert (mutable)
+-- events/
    +-- strategy.events.ts               <- StrategyPlanCreated payload
```

---

## API Endpoints (7)

All routes under `strategy.routes.ts`. All require `authenticate` middleware (JWT).

---

### GET /api/v1/strategy/allocation

Current target allocation, model used, data context, goal profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "model": "HRP_CVAR",
    "goalProfile": "MODERATE",
    "snapshotsUsed": 42,
    "defensiveMode": false,
    "targetAllocation": {
      "ALGO": "0.45200000",
      "USDC": "0.24100000",
      "goETH": "0.08400000",
      "USDC_LENDING": "0.22300000"
    },
    "currentAllocation": {
      "ALGO": "0.67420000",
      "USDC": "0.10200000",
      "goETH": "0.12100000",
      "USDC_LENDING": "0.10280000"
    },
    "rebalanceRequired": true,
    "computedAt": "2026-06-24T08:00:00Z"
  }
}
```

---

### GET /api/v1/strategy/rebalance

Ordered rebalancing actions with urgency tiers, USD amounts, vol-adjusted thresholds.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "rebalanceRequired": true,
    "thresholdApplied": 5.0,
    "highVolMode": false,
    "actions": [
      {
        "assetSymbol": "ALGO",
        "currentWeightPercent": "67.4200",
        "targetWeightPercent": "45.2000",
        "deltaPercent": "-22.2200",
        "currentValueUsd": "9842.10",
        "targetValueUsd": "6600.12",
        "deltaUsd": "-3241.98",
        "urgency": "CRITICAL",
        "action": "DECREASE"
      },
      {
        "assetSymbol": "USDC_LENDING",
        "currentWeightPercent": "10.2800",
        "targetWeightPercent": "22.3000",
        "deltaPercent": "12.0200",
        "currentValueUsd": "1500.40",
        "targetValueUsd": "3256.20",
        "deltaUsd": "1755.80",
        "urgency": "HIGH",
        "action": "INCREASE"
      }
    ]
  }
}
```

---

### POST /api/v1/strategy/simulate

Simulate target allocation under a different goal profile. Does not save.

**Request:**
```json
{ "goalProfile": "CONSERVATIVE" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "simulatedProfile": "CONSERVATIVE",
    "currentProfile": "MODERATE",
    "comparison": {
      "simulated": {
        "targetAllocation": { "ALGO": "0.20000000", "USDC_LENDING": "0.65000000" },
        "rebalanceActionCount": 4,
        "projectedRiskScore": 28,
        "defensiveMode": false
      },
      "current": {
        "targetAllocation": { "ALGO": "0.45200000", "USDC_LENDING": "0.22300000" },
        "rebalanceActionCount": 2,
        "projectedRiskScore": 52,
        "defensiveMode": false
      }
    }
  }
}
```

---

### PUT /api/v1/strategy/goal

Set or update user goal profile. Triggers immediate strategy recompute.

**Request:**
```json
{ "goalProfile": "AGGRESSIVE" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "goalProfile": "AGGRESSIVE",
    "previousGoalProfile": "MODERATE",
    "strategyRecomputed": true,
    "strategySnapshotId": "uuid"
  }
}
```

---

### POST /api/v1/strategy/refresh

Manually trigger strategy recompute.

**Response (202):**
```json
{
  "success": true,
  "data": {
    "message": "Strategy recompute queued",
    "estimatedMs": 800
  }
}
```

---

### GET /api/v1/strategy/explain

Plain-English rationale for the current strategy recommendation.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "modelUsed": "Hierarchical Risk Parity + Tail Risk Optimization (HRP+CVaR)",
    "dataPoints": 42,
    "goalProfile": "MODERATE",
    "defensiveMode": false,
    "riskContext": "Current risk level: MEDIUM (score: 52/100)",
    "reasons": [
      "Your portfolio is highly concentrated (HHI: 3,241/10,000). The optimizer is redistributing weight across assets.",
      "Largest change: reduce ALGO allocation by 22.22% (~$3,241.98)."
    ],
    "disclaimer": "This is a recommendation only. CrestFlow does not execute any trades without your explicit approval."
  }
}
```

---

### GET /api/v1/strategy/history

Paginated history of strategy snapshots for trend analysis.

Query params: `page`, `pageSize` (default 20), `goalProfile`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "snapshots": [
      {
        "id": "uuid",
        "model": "HRP_CVAR",
        "goalProfile": "MODERATE",
        "rebalanceRequired": true,
        "maxDeviationPercent": "22.2200",
        "defensiveMode": false,
        "computedAt": "2026-06-24T08:00:00Z"
      }
    ],
    "total": 14,
    "page": 1
  }
}
```

---

## Events

**File:** `events/strategy.events.ts`

```typescript
export const StrategyEvents = {
  STRATEGY_PLAN_CREATED: 'StrategyPlanCreated',
  STRATEGY_GOAL_UPDATED: 'StrategyGoalUpdated',
} as const;

export interface StrategyPlanCreatedPayload {
  strategySnapshotId: string;
  userId:             string;
  portfolioSnapshotId: string;
  riskSnapshotId:     string;
  model:              string;
  goalProfile:        string;
  rebalanceRequired:  boolean;
  actionCount:        number;
  defensiveMode:      boolean;
  timestamp:          string;  // ISO8601 UTC
}

// Subscribed by:
// - Engine 6 (Autonomous Execution) — builds execution plan from rebalancingActions
// - Engine 5 (User Intelligence / Copilot) — strategy context for AI reasoning
```

---

## New Package

```bash
pnpm add mathjs
pnpm add --save-dev @types/mathjs
```

Used for: matrix multiplication and transpose in HRP recursive bisection.  
The covariance and Ledoit-Wolf implementations use plain TypeScript loops (no mathjs dependency needed there).

---

## Rebalancing Trigger Rules

| Trigger | Condition | Min Interval |
|---|---|---|
| Asset drift | \|current - target\| > 5% (or 8% when 30D vol > 60%) | 24h |
| Risk tier breach | Engine 2 score crosses LOW/MEDIUM/HIGH/CRITICAL boundary | Immediate |
| Goal profile change | User updates via `PUT /strategy/goal` | Immediate |
| Time-based fallback | 7 days since last strategy recompute | N/A |

---

## Graceful Degradation

| Condition | Behavior |
|---|---|
| 0-13 snapshots | EQUAL_WEIGHT model. Noted in /explain output |
| 14-29 snapshots | INVERSE_VOL model. Uses Engine 2 vol data |
| Engine 2 snapshot missing | Skip optimization. Log ERROR. No write. |
| All asset vols are zero | Fall back to EQUAL_WEIGHT |
| Optimizer fails to converge | Fall back to previous model tier. Log WARN |
| No goal profile set | Default to MODERATE |

---

## Logging Requirements

`module: "strategy"`, JSON structured.

- `INFO` — strategy compute started (userId, snapshotCount, model selected)
- `INFO` — strategy complete (model, goalProfile, rebalanceRequired, defensiveMode, durationMs)
- `INFO` — goal profile updated (userId, previous, new)
- `WARN` — fell back to lower model tier (reason)
- `WARN` — defensive mode activated (userId, riskScore, profileCap)
- `ERROR` — strategy snapshot write failed
- `ERROR` — optimizer exception (model, error)

---

## Testing Requirements

Coverage: 95%+ on all optimizer and constraint functions (pure functions, deterministic).

### Unit Tests

**`covariance.test.ts`**
- Identity-like returns -> shrinkage coefficient near 1
- Alpha clamped to [0,1] always
- Output matrix is symmetric: Sigma[i][j] === Sigma[j][i]
- Diagonal elements are always >= 0
- With 1 asset: returns 1x1 matrix with that asset's variance

**`hrp.optimizer.test.ts`**
- Single asset -> weight = 1.0
- 2 assets, equal vol -> both get ~0.5
- 2 assets, 2:1 vol ratio -> weights inversely proportional to variance
- Weights always sum to 1.0 (tolerance 1e-10)
- Weights always >= 0
- n=10 assets: completes in < 100ms

**`mean-cvar.optimizer.test.ts`**
- All identical returns -> equal weights result
- Weights sum to 1.0 after each iteration
- Weights all >= 0 (simplex projection works correctly)
- Single asset -> weight = 1.0
- Converges (weights stop changing) within 500 iterations for n <= 15

**`inverse-vol.optimizer.test.ts`**
- Zero vol asset -> gets 0 weight
- Equal vol all assets -> equal weights
- Weights sum to 1.0

**`goal-constraints.test.ts`**
- CONSERVATIVE: volatile total <= 25% after enforcement
- MODERATE: volatile total <= 55% after enforcement
- Defensive mode: volatile total reduced by extra 10%
- Output always sums to 1.0
- No weights below 0

**`action-generator.test.ts`**
- Delta < 5% -> no action generated
- Delta > 5% -> action with correct urgency tier
- Delta >= 20% -> CRITICAL urgency
- Actions sorted by |delta| descending
- High-vol period -> 8% threshold applied (not 5%)
- Signed delta: DECREASE is negative, INCREASE is positive

**`momentum.overlay.test.ts`**
- Positive 14D return -> weight increases (bounded by tilt cap)
- Negative 14D return -> weight decreases (minimum 0)
- Output weights always sum to 1.0
- No weight falls below 0

### Integration Tests

**`strategy.service.integration.test.ts`** (real Postgres, mocked Engine 1+2 events)
- 10 snapshots -> EQUAL_WEIGHT model selected
- 20 snapshots -> INVERSE_VOL model selected
- 40 snapshots -> HRP_CVAR model selected
- Full pipeline: RiskAnalysisCompleted -> strategy snapshot written -> StrategyPlanCreated emitted
- Defensive mode triggered when riskScore > profile maxRiskScore
- Goal profile change -> immediate recompute
- Simulate does NOT write a strategy snapshot
- Immutability: attempt UPDATE on strategy_snapshots -> DB error (role restriction)

---

## P2 Stub — Black-Litterman

**File:** `optimizers/bl-hrp.optimizer.ts`

```typescript
/**
 * Black-Litterman + HRP Ensemble
 * STATUS: P2 stub — requires 90+ snapshots for meaningful view generation
 *
 * When implemented (P2):
 * - Prior Pi = equal-weight expected returns (max entropy, no market cap available)
 * - Views Q derived from Engine 2 signals:
 *     Low risk asset    -> positive view (+2% excess return), high confidence
 *     High HHI asset    -> negative view (mean reversion expected), medium confidence
 *     High Sortino      -> positive portfolio return view
 * - Uncertainty Omega = diagonal, scaled by Engine 2 risk confidence
 * - Posterior E(R) fed into HRP as expected return input
 * - tau = 0.05 (low confidence in prior vs views)
 *
 * TODO: implement when 90+ snapshot user cohort exists
 */
export function blHrpOptimize(): never {
  throw new Error(
    'Black-Litterman optimizer is a P2 feature (requires 90+ snapshots). ' +
    'Use HRP_CVAR instead.'
  );
}
```

---

## Frontend Context Additions

**Additions to `project-context/frontend-context.md`:**

### Screens Required
1. **Strategy Card** — donut chart: current vs target allocation side-by-side. Overlap view optional.
2. **Goal Selector** — 3-button toggle (CONSERVATIVE / MODERATE / AGGRESSIVE). Changing a goal shows simulation preview with risk score delta before saving.
3. **Rebalancing Action List** — ordered action cards: urgency badge (color), asset, current → target arrow, delta %, delta USD, "Learn Why" accordion
4. **Simulation Panel** — "What if I switched to [profile]?" comparison. Projected risk score delta displayed.
5. **Strategy Explainer Panel** — plain-English reason cards per recommendation (from `/explain` endpoint)
6. **Model Badge** — "Powered by HRP+CVaR" with tooltip. Grey badge + message when EQUAL_WEIGHT.
7. **Strategy History Chart** — how target allocation evolved over time (stacked area chart per asset)

### UX Rules
- Goal change: show simulation preview FIRST → "Confirm" saves and triggers recompute
- Defensive mode banner: amber "Risk score exceeds MODERATE profile — defensive allocation active"
- All deltas shown as both % and estimated USD
- CRITICAL urgency action → red card with pulsing border
- Model badge tooltip: plain English explanation of the model (no jargon)
- EQUAL_WEIGHT model → grey badge + "Building your profile (14+ days needed for advanced optimization)"
