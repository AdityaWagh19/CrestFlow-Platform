# Plan 04 — Engine 2: Risk Intelligence

**Status:** Approved  
**Priority:** P0  
**Depends on:** Plan 03 (Engine 1 — `PortfolioSnapshotCreated` event + `portfolio_snapshots` table)  
**Feeds into:** Engine 5 (User Intelligence / Copilot — risk context for AI reasoning)

---

## Objective

Engine 2 is the quantitative risk intelligence engine. It:

1. Subscribes to `PortfolioSnapshotCreated` events from Engine 1
2. Fetches the full snapshot + historical snapshot series from PostgreSQL
3. Runs 6 independent risk analyzers in parallel
4. Computes a composite risk score (0–100, higher = more risk)
5. Generates/resolves `RiskAlert` records
6. Writes an immutable `RiskSnapshot` to PostgreSQL
7. Emits `RiskAnalysisCompleted` for Engine 5

**No external API calls, no blockchain reads.** All data comes from Engine 1's snapshot (already cached/computed). Engine 2 is pure computation.

---

## SOTA Methods Rationale

### Why these specific methods, not others

**CVaR over VaR:**
VaR fails the sub-additivity test — the VaR of a combined portfolio can exceed the sum of its parts, making it misleading for diversification analysis. CVaR (Expected Shortfall) is a coherent risk measure, is the Basel III replacement for VaR (FRTB), and captures tail severity — the information VaR throws away. For DeFi's fat-tailed returns, historical simulation CVaR (non-parametric) is correct — no Gaussian assumption.

**Sortino over Sharpe:**
DeFi portfolios have asymmetric returns. Sharpe penalizes upside volatility as "risk", which is incorrect — a week of 10% daily gains should not lower your risk score. Sortino uses only downside deviation, which correctly measures the investor's actual risk experience.

**MDD + Calmar:**
Maximum Drawdown is the most psychologically real risk measure — it answers "what's the worst loss I've experienced from a peak?" Calmar ratio (return/MDD) is used by institutional investors to compare strategy efficiency. Both are computable from snapshot history with no additional data.

**Historical Simulation:**
No parametric distribution assumed. The portfolio's own returns are used directly. This is critical for DeFi where returns have fat tails and extreme kurtosis that Gaussian models systematically underestimate.

---

## Architecture Decisions

### Subscribes to Engine 1 — never calls adapters
Engine 2 reads exclusively from the `portfolio_snapshots` table and the current snapshot payload. It never calls Knowledge Layer adapters. If Engine 1 data is stale, Engine 2 works with what it has.

### Parallel analyzers with `Promise.allSettled`
All 6 risk analyzers run in parallel. If one fails (e.g., insufficient snapshot history for CVaR), the others continue. Risk score is computed from available components with appropriate weighting adjustments.

### Minimum data requirements enforced per analyzer
Each analyzer declares its minimum snapshot count. If below threshold, the metric returns `null` with `insufficientHistory: true`. The composite score is still computed from available analyzers.

### Alert lifecycle — persistent, not ephemeral
`RiskAlert` records have an `ACTIVE` / `RESOLVED` / `DISMISSED` lifecycle. On each risk run:
- New threshold breaches → create new ACTIVE alert (if not already active)
- Resolved breaches → mark existing alert RESOLVED (auto)
- User dismissals → DISMISSED state persists across runs

### `decimal.js` for all risk arithmetic
Same as Engine 1. All financial values as string inputs, `Decimal` objects in computation, string outputs.

---

## 6-Step Processing Pipeline

```
PortfolioSnapshotCreated { snapshotId, userId, totalValueUsd, healthScore }
    │
    ▼
[Step 1] Load current snapshot + historical series
    ├── Load full PortfolioSnapshot by snapshotId
    └── Load last 90 snapshots for userId (ordered by snapshotAt DESC)
    │
    ▼
[Step 2] Extract daily return series from snapshot history
    └── returns[] = [(v_n - v_(n-1)) / v_(n-1)] for each consecutive snapshot pair
    │
    ▼
[Step 3] Run 6 analyzers in parallel (Promise.allSettled)
    ├── MarketRiskAnalyzer    → CVaR, Sortino, MDD, Calmar, Volatility
    ├── LiquidationAnalyzer   → Folks HF per position, distance to liquidation
    ├── ConcentrationAnalyzer → HHI alerts, asset + protocol concentration
    ├── ProtocolRiskAnalyzer  → protocol scores, weighted portfolio protocol risk
    ├── LiquidityAnalyzer     → exit price impact per position
    └── VolatilityAnalyzer    → 7D, 30D realized volatility annualized
    │
    ▼
[Step 4] Composite risk score
    └── Weighted sum of 6 component scores → 0–100 integer (higher = more risk)
    │
    ▼
[Step 5] Alert generation
    ├── Evaluate 8 alert conditions against analyzer outputs
    ├── Create new ACTIVE alerts for new breaches
    └── Resolve existing ACTIVE alerts for cleared conditions
    │
    ▼
[Step 6] Write + Emit
    ├── prisma.riskSnapshot.create(...)       ← immutable INSERT
    ├── Alert upserts (create/resolve)
    └── emit RiskAnalysisCompleted { riskSnapshotId, userId, riskScore, alertCount }
```

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions)

```prisma
model RiskSnapshot {
  id                    String    @id @default(uuid()) @db.Uuid
  userId                String    @db.Uuid
  portfolioSnapshotId   String    @db.Uuid           // FK to portfolio_snapshots
  analyzedAt            DateTime                      // UTC timestamp of risk computation

  // ── Market Risk (CVaR-based) ─────────────────────────────────────────
  cvar95Percent         String?   // DECIMAL — CVaR at 95% confidence. null if insufficient history
  var95Percent          String?   // DECIMAL — VaR at 95% (reported for reference, not used in score)
  sortinoRatio          String?   // DECIMAL — null if insufficient history
  maxDrawdownPercent    String?   // DECIMAL — max peak-to-trough loss %
  calmarRatio           String?   // DECIMAL — annualized return / MDD
  realizedVol7dPercent  String?   // DECIMAL — annualized 7D volatility
  realizedVol30dPercent String?   // DECIMAL — annualized 30D volatility
  snapshotsUsed         Int       // how many historical snapshots were available
  insufficientHistory   Boolean   @default(false)

  // ── Liquidation Risk ─────────────────────────────────────────────────
  // JSONB: { positions: [{ marketId, healthFactor, distancePercent, status }] }
  liquidationPositions  Json?
  minHealthFactor       String?   // DECIMAL — lowest HF across all borrow positions
  liquidationRiskScore  Int?      // 0–100 component score (higher = more risk)

  // ── Concentration Risk ───────────────────────────────────────────────
  hhi                   String    // DECIMAL — from Engine 1 snapshot
  assetHhi              String    // DECIMAL — by asset (true exposure)
  protocolHhi           String    // DECIMAL — by protocol allocation
  concentrationScore    Int       // 0–100 component score

  // ── Protocol Risk ────────────────────────────────────────────────────
  // JSONB: { folks: 88, tinyman: 82, pact: 72, ... }
  protocolScores        Json
  weightedProtocolScore String    // DECIMAL — weighted avg by allocation
  protocolRiskScore     Int       // 0–100 component score (inverted — higher = more risk)

  // ── Liquidity/Exit Risk ──────────────────────────────────────────────
  // JSONB: [{ protocol, asset1, asset2, positionUsd, poolTvlUsd, impactPercent }]
  exitRiskPositions     Json
  maxExitImpactPercent  String    // DECIMAL — worst single position exit impact
  liquidityRiskScore    Int       // 0–100 component score

  // ── Composite Score ──────────────────────────────────────────────────
  riskScore             Int       // 0–100 (higher = more risk)
  riskLevel             RiskLevel // CRITICAL | HIGH | MEDIUM | LOW
  scoreComponents       Json      // { market, liquidation, concentration, protocol, liquidity }

  // ── Alerts ───────────────────────────────────────────────────────────
  activeAlertCount      Int       @default(0)
  criticalAlertCount    Int       @default(0)

  // Immutability: INSERT only
  createdAt             DateTime  @default(now())

  user                  User      @relation(fields: [userId], references: [id])

  @@index([userId, analyzedAt(sort: Desc)])
  @@map("risk_snapshots")
}

model RiskAlert {
  id                    String      @id @default(uuid()) @db.Uuid
  userId                String      @db.Uuid
  alertType             AlertType
  severity              AlertSeverity
  status                AlertStatus @default(ACTIVE)

  // Alert context
  title                 String      // human-readable
  message               String      // detailed description
  // JSONB: alert-type-specific data (e.g. { healthFactor: "1.08", position: "ALGO/USDC" })
  metadata              Json

  // Lifecycle
  triggeredAt           DateTime    // when first triggered
  resolvedAt            DateTime?   // when condition cleared (auto)
  dismissedAt           DateTime?   // when user dismissed
  lastSeenAt            DateTime    // updated each risk run if still active

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  user                  User        @relation(fields: [userId], references: [id])

  @@index([userId, status, severity])
  @@map("risk_alerts")
}

enum RiskLevel {
  CRITICAL   // 80–100
  HIGH       // 60–79
  MEDIUM     // 40–59
  LOW        // 0–39
}

enum AlertType {
  LIQUIDATION_IMMINENT
  LIQUIDATION_WARNING
  HIGH_CONCENTRATION
  MODERATE_CONCENTRATION
  HIGH_VOLATILITY
  SIGNIFICANT_DRAWDOWN
  LOW_LIQUIDITY
  LOW_PROTOCOL_SCORE
}

enum AlertSeverity {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum AlertStatus {
  ACTIVE
  RESOLVED
  DISMISSED
}
```

**Immutability enforcement (migration raw SQL):**
```sql
REVOKE UPDATE, DELETE ON risk_snapshots FROM crestflow_app;
-- risk_alerts IS mutable (lifecycle management required)
```

---

## Module File Structure

```
apps/copilot-api/src/modules/risk/
├── risk.controller.ts              ← thin HTTP handlers
├── risk.routes.ts                  ← /api/v1/risk/*
├── risk.service.ts                 ← orchestrates pipeline (Steps 1–6)
├── analyzers/
│   ├── market-risk.analyzer.ts     ← CVaR, Sortino, MDD, Calmar, Volatility
│   ├── liquidation.analyzer.ts     ← Folks HF, distance to liquidation
│   ├── concentration.analyzer.ts   ← HHI alerts, asset + protocol concentration
│   ├── protocol-risk.analyzer.ts   ← per-protocol scoring, weighted portfolio score
│   ├── liquidity.analyzer.ts       ← exit price impact per LP/supply position
│   └── volatility.analyzer.ts      ← 7D/30D realized volatility (sub-module of market)
├── scoring/
│   └── composite-scorer.ts         ← weighted combination → 0–100 risk score
├── alerts/
│   ├── alert-evaluator.ts          ← evaluate 8 conditions → alert list
│   └── alert-repository.ts         ← create, resolve, dismiss, query alerts
├── repositories/
│   └── risk-snapshot.repository.ts ← INSERT only: getLatest, getHistory
├── constants/
│   └── protocol-registry.ts        ← hardcoded protocol risk scores + metadata
└── events/
    └── risk.events.ts              ← RiskAnalysisCompleted, RiskAlertTriggered payloads
```

---

## Analyzer Implementations

### Step 2 — Return Series Extractor

```typescript
// Converts portfolio snapshot history → daily return series for quantitative analyzers
// Input: PortfolioSnapshot[] ordered by snapshotAt DESC
// Output: number[] of returns, oldest first

export function extractReturnSeries(snapshots: { totalValueUsd: string; snapshotAt: Date }[]): number[] {
  // Need at least 2 snapshots to compute 1 return
  if (snapshots.length < 2) return [];

  // Sort oldest → newest
  const sorted = [...snapshots].sort((a, b) =>
    a.snapshotAt.getTime() - b.snapshotAt.getTime()
  );

  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Decimal(sorted[i - 1].totalValueUsd);
    const curr = new Decimal(sorted[i].totalValueUsd);
    if (prev.isZero()) continue;
    returns.push(curr.minus(prev).div(prev).toNumber());
  }
  return returns;
}
```

---

### Analyzer 1 — Market Risk (CVaR + Sortino + MDD + Calmar)

**File:** `analyzers/market-risk.analyzer.ts`

```typescript
import Decimal from 'decimal.js';

export const MIN_SNAPSHOTS_FOR_CVaR = 20;      // ~7 days of scans
export const MIN_SNAPSHOTS_FOR_SORTINO = 14;
export const MIN_SNAPSHOTS_FOR_MDD = 7;

export interface MarketRiskResult {
  cvar95Percent: string | null;       // DECIMAL string, e.g. "-0.08421" = -8.42%
  var95Percent: string | null;
  sortinoRatio: string | null;
  maxDrawdownPercent: string | null;
  calmarRatio: string | null;
  realizedVol7dPercent: string | null;
  realizedVol30dPercent: string | null;
  snapshotsUsed: number;
  insufficientHistory: boolean;
  componentScore: number;             // 0–100, higher = more market risk
}

export function analyzeMarketRisk(
  returns: number[],
  snapshots: { totalValueUsd: string }[],
): MarketRiskResult {
  const n = returns.length;
  const insufficient = n < MIN_SNAPSHOTS_FOR_MDD;

  // ── CVaR (Historical Simulation, 95% confidence) ──────────────────────
  // Sort worst to best
  const sorted = [...returns].sort((a, b) => a - b);
  const alpha = 0.05; // 1 - confidence level
  const varIndex = Math.max(1, Math.floor(alpha * sorted.length));

  const var95 = n >= MIN_SNAPSHOTS_FOR_CVaR
    ? new Decimal(sorted[varIndex]).toFixed(8)
    : null;

  const tailLosses = sorted.slice(0, varIndex);
  const cvar95 = n >= MIN_SNAPSHOTS_FOR_CVaR && tailLosses.length > 0
    ? tailLosses.reduce((sum, r) => sum + r, 0) / tailLosses.length
    : null;

  // ── Sortino Ratio ────────────────────────────────────────────────────
  // Target return = 0 (capital preservation)
  let sortino: string | null = null;
  if (n >= MIN_SNAPSHOTS_FOR_SORTINO) {
    const target = 0;
    const avgReturn = returns.reduce((s, r) => s + r, 0) / n;
    const downsideReturns = returns.filter(r => r < target);
    if (downsideReturns.length > 0) {
      const downsideDev = Math.sqrt(
        downsideReturns.reduce((s, r) => s + Math.pow(r - target, 2), 0) / n
      );
      sortino = downsideDev > 0
        ? new Decimal(avgReturn).div(downsideDev).toFixed(8)
        : null;
    }
  }

  // ── Maximum Drawdown ─────────────────────────────────────────────────
  let mdd: string | null = null;
  let calmar: string | null = null;
  if (n >= MIN_SNAPSHOTS_FOR_MDD) {
    const values = snapshots.map(s => parseFloat(s.totalValueUsd));
    let peak = values[0];
    let maxDrawdown = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    mdd = new Decimal(maxDrawdown).toFixed(8);

    // Calmar: annualized return / MDD
    if (maxDrawdown > 0 && values.length > 1) {
      const first = values[0];
      const last = values[values.length - 1];
      const yearsElapsed = Math.max(1 / 365, n / 365);
      const cagr = Math.pow(last / first, 1 / yearsElapsed) - 1;
      calmar = new Decimal(cagr).div(maxDrawdown).toFixed(8);
    }
  }

  // ── Realized Volatility (annualized) ─────────────────────────────────
  const vol7d = computeAnnualizedVol(returns.slice(-7));
  const vol30d = computeAnnualizedVol(returns.slice(-30));

  // ── Component Score (0–100, higher = more market risk) ───────────────
  let score = 0;
  // CVaR contribution: CVaR of -10% daily → max risk (30 pts)
  if (cvar95 !== null) {
    const cvarNum = Math.abs(parseFloat(cvar95));
    score += Math.min(30, Math.round(cvarNum / 0.10 * 30));
  } else {
    score += 15; // assume medium risk if insufficient data
  }
  // MDD contribution: MDD > 50% → max risk (40 pts)
  if (mdd !== null) {
    const mddNum = parseFloat(mdd);
    score += Math.min(40, Math.round(mddNum / 0.50 * 40));
  }
  // Volatility contribution: vol > 100% annualized → max risk (30 pts)
  if (vol30d !== null) {
    const volNum = parseFloat(vol30d) / 100;
    score += Math.min(30, Math.round(volNum / 1.0 * 30));
  }

  return {
    cvar95Percent: cvar95 !== null ? new Decimal(cvar95).toFixed(8) : null,
    var95Percent: var95,
    sortinoRatio: sortino,
    maxDrawdownPercent: mdd,
    calmarRatio: calmar,
    realizedVol7dPercent: vol7d,
    realizedVol30dPercent: vol30d,
    snapshotsUsed: n,
    insufficientHistory: insufficient,
    componentScore: Math.min(100, score),
  };
}

function computeAnnualizedVol(returns: number[]): string | null {
  if (returns.length < 3) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  return new Decimal(dailyVol).mul(Math.sqrt(365)).mul(100).toFixed(4); // annualized %
}
```

---

### Analyzer 2 — Liquidation Risk (Folks Finance Health Factor)

**File:** `analyzers/liquidation.analyzer.ts`

```typescript
import Decimal from 'decimal.js';

// Health Factor thresholds (industry standard DeFi lending)
export const HF_THRESHOLDS = {
  CRITICAL: 1.1,   // LIQUIDATION_IMMINENT alert
  WARNING:  1.3,   // LIQUIDATION_WARNING alert
  MODERATE: 2.0,
  SAFE:     3.0,
} as const;

export interface LiquidationPosition {
  marketId: string;
  assetSymbol: string;
  healthFactor: string;              // DECIMAL
  distanceToLiquidationPercent: string; // DECIMAL — (HF - 1.0) / HF × 100
  status: 'SAFE' | 'MODERATE' | 'WARNING' | 'CRITICAL';
}

export interface LiquidationRiskResult {
  positions: LiquidationPosition[];
  minHealthFactor: string | null;    // DECIMAL — worst HF across all positions
  componentScore: number;            // 0–100, higher = more liquidation risk
  hasActiveBorrows: boolean;
}

export function analyzeLiquidationRisk(
  protocolPositions: ProtocolPosition[]
): LiquidationRiskResult {
  const borrowPositions = protocolPositions.filter(
    p => p.protocol === 'folks-finance' && p.positionType === 'borrow'
  );

  if (!borrowPositions.length) {
    return { positions: [], minHealthFactor: null, componentScore: 0, hasActiveBorrows: false };
  }

  const positions: LiquidationPosition[] = borrowPositions.map(p => {
    const hf = new Decimal(p.healthFactor ?? '999');
    const hfNum = hf.toNumber();

    // Distance to liquidation: (HF - 1.0) / HF × 100
    const distance = hf.minus(1).div(hf).mul(100);

    let status: LiquidationPosition['status'] = 'SAFE';
    if (hfNum < HF_THRESHOLDS.CRITICAL) status = 'CRITICAL';
    else if (hfNum < HF_THRESHOLDS.WARNING) status = 'WARNING';
    else if (hfNum < HF_THRESHOLDS.MODERATE) status = 'MODERATE';

    return {
      marketId: String(p.assetId),
      assetSymbol: p.unitName,
      healthFactor: hf.toFixed(8),
      distanceToLiquidationPercent: distance.toFixed(4),
      status,
    };
  });

  // Worst (minimum) health factor
  const minHf = positions.reduce(
    (min, p) => Math.min(min, parseFloat(p.healthFactor)),
    Infinity
  );
  const minHealthFactor = minHf < Infinity ? new Decimal(minHf).toFixed(8) : null;

  // Component score:
  // HF < 1.0 → 100pts (liquidatable now)
  // HF 1.0–1.1 → 90pts
  // HF 1.1–1.3 → 70pts
  // HF 1.3–2.0 → 40pts
  // HF > 2.0 → 10pts
  // No borrows → 0pts
  let score = 0;
  if (minHf < 1.0)                          score = 100;
  else if (minHf < HF_THRESHOLDS.CRITICAL)  score = 90;
  else if (minHf < HF_THRESHOLDS.WARNING)   score = 70;
  else if (minHf < HF_THRESHOLDS.MODERATE)  score = 40;
  else                                       score = 10;

  return {
    positions,
    minHealthFactor,
    componentScore: score,
    hasActiveBorrows: true,
  };
}
```

---

### Analyzer 3 — Concentration Risk

**File:** `analyzers/concentration.analyzer.ts`

```typescript
import Decimal from 'decimal.js';

export interface ConcentrationRiskResult {
  assetHhi: string;        // DECIMAL — HHI on true asset exposure
  protocolHhi: string;     // DECIMAL — HHI on protocol allocation
  componentScore: number;  // 0–100
}

export function analyzeConcentrationRisk(
  trueExposure: Record<string, { percent: string }>,
  protocolAllocation: Record<string, string>,
): ConcentrationRiskResult {
  // Asset HHI (on true exposure percentages)
  const assetHhi = Object.values(trueExposure).reduce(
    (sum, e) => sum.plus(new Decimal(e.percent).pow(2)),
    new Decimal(0)
  );

  // Protocol HHI
  const protocolHhi = Object.values(protocolAllocation).reduce(
    (sum, pct) => sum.plus(new Decimal(pct).pow(2)),
    new Decimal(0)
  );

  // Component score: HHI 0 → 0 risk, HHI 10000 → 100 risk
  const assetScore = Math.min(100, Math.round(assetHhi.div(10000).mul(100).toNumber()));
  const protocolScore = Math.min(100, Math.round(protocolHhi.div(10000).mul(100).toNumber()));
  // Weight: asset concentration is 70% of concentration risk, protocol 30%
  const componentScore = Math.round(assetScore * 0.7 + protocolScore * 0.3);

  return {
    assetHhi: assetHhi.toFixed(4),
    protocolHhi: protocolHhi.toFixed(4),
    componentScore,
  };
}
```

---

### Analyzer 4 — Protocol Risk

**File:** `analyzers/protocol-risk.analyzer.ts`

```typescript
import Decimal from 'decimal.js';
import { PROTOCOL_REGISTRY } from '../constants/protocol-registry';

export interface ProtocolRiskResult {
  protocolScores: Record<string, number>;   // { 'folks-finance': 88, ... }
  weightedProtocolScore: string;            // DECIMAL — allocation-weighted average
  componentScore: number;                   // 0–100 (higher = more risk)
}

export function analyzeProtocolRisk(
  protocolAllocation: { folks: string; tinyman: string; pact: string; native: string }
): ProtocolRiskResult {
  const scores = { ...PROTOCOL_REGISTRY };

  // Weighted average protocol safety score (higher safety = lower risk)
  const totalProtocol = new Decimal(protocolAllocation.folks)
    .plus(protocolAllocation.tinyman)
    .plus(protocolAllocation.pact);

  let weightedSafetyScore = new Decimal(0);
  if (totalProtocol.gt(0)) {
    const folksWeight = new Decimal(protocolAllocation.folks).div(totalProtocol);
    const tinymanWeight = new Decimal(protocolAllocation.tinyman).div(totalProtocol);
    const pactWeight = new Decimal(protocolAllocation.pact).div(totalProtocol);

    weightedSafetyScore = new Decimal(scores['folks-finance']).mul(folksWeight)
      .plus(new Decimal(scores['tinyman']).mul(tinymanWeight))
      .plus(new Decimal(scores['pact']).mul(pactWeight));
  } else {
    weightedSafetyScore = new Decimal(100); // no protocol exposure = no protocol risk
  }

  // Invert: safety score 100 → risk score 0, safety score 0 → risk score 100
  const componentScore = Math.round(100 - weightedSafetyScore.toNumber());

  return {
    protocolScores: scores,
    weightedProtocolScore: weightedSafetyScore.toFixed(4),
    componentScore: Math.max(0, Math.min(100, componentScore)),
  };
}
```

---

### Analyzer 5 — Liquidity / Exit Risk

**File:** `analyzers/liquidity.analyzer.ts`

```typescript
import Decimal from 'decimal.js';

export interface ExitRiskPosition {
  protocol: string;
  label: string;              // e.g. "ALGO/USDC (Tinyman)"
  positionUsd: string;        // DECIMAL
  poolTvlUsd: string;         // DECIMAL
  impactPercent: string;      // DECIMAL — estimated price impact to exit
  riskTier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export interface LiquidityRiskResult {
  positions: ExitRiskPosition[];
  maxExitImpactPercent: string;   // DECIMAL — worst single position
  componentScore: number;         // 0–100
}

// Simplified constant-product AMM price impact approximation
// impact ≈ position_size / pool_tvl
// This is conservative (actual impact is higher due to slippage curve)
export function analyzeLiquidityRisk(
  protocolPositions: ProtocolPosition[],
  poolTvlData: Record<string, string>,   // pool_address → tvl_usd
): LiquidityRiskResult {
  const positions: ExitRiskPosition[] = [];

  for (const pos of protocolPositions.filter(p => p.positionType === 'lp' || p.positionType === 'supply')) {
    const posUsd = new Decimal(pos.valueUsd);
    const tvlUsd = new Decimal(poolTvlData[pos.poolAddress ?? ''] ?? '1000000');

    // Price impact approximation: position / tvl
    const impact = posUsd.div(tvlUsd).mul(100);
    const impactNum = impact.toNumber();

    let riskTier: ExitRiskPosition['riskTier'] = 'LOW';
    if (impactNum > 5) riskTier = 'CRITICAL';
    else if (impactNum > 2) riskTier = 'HIGH';
    else if (impactNum > 0.5) riskTier = 'MODERATE';

    positions.push({
      protocol: pos.protocol,
      label: pos.poolAddress ?? `${pos.unitName} position`,
      positionUsd: posUsd.toFixed(8),
      poolTvlUsd: tvlUsd.toFixed(8),
      impactPercent: impact.toFixed(4),
      riskTier,
    });
  }

  const maxImpact = positions.reduce(
    (max, p) => Math.max(max, parseFloat(p.impactPercent)), 0
  );

  // Score: impact > 5% → 100pts, 2% → 60pts, 0.5% → 20pts
  const componentScore = Math.min(100, Math.round(maxImpact / 5 * 100));

  return {
    positions,
    maxExitImpactPercent: new Decimal(maxImpact).toFixed(4),
    componentScore,
  };
}
```

---

### Protocol Registry (Hardcoded for MVP)

**File:** `constants/protocol-registry.ts`

```typescript
// Protocol safety scores (0–100, higher = safer)
// Based on: TVL, audit status, contract age, incident history
// Last updated: 2026-06-24 — review quarterly

export const PROTOCOL_REGISTRY: Record<string, number> = {
  'folks-finance': 88,
  // TVL: $70M+, Auditor: Runtime Verification (gold standard for Algorand)
  // Age: 3+ years, Incidents: None post-V2

  'tinyman': 82,
  // TVL: $25M+, Auditor: Certora + internal
  // Age: 3+ years, Incidents: V1 exploit fixed, V2 clean

  'pact': 72,
  // TVL: $8M, Audited: Yes (less rigorous)
  // Age: 2 years, Incidents: None major
};

export const PROTOCOL_RISK_THRESHOLDS = {
  LOW_PROTOCOL_SCORE_ALERT: 60,    // alert if any used protocol scores below this
} as const;
```

---

## Composite Risk Scorer

**File:** `scoring/composite-scorer.ts`

```typescript
import Decimal from 'decimal.js';

// Component weights — must sum to 1.0
const WEIGHTS = {
  market:       0.35,   // CVaR, MDD, Sortino
  liquidation:  0.25,   // Folks HF distance
  concentration: 0.20,  // HHI-based
  protocol:     0.10,   // Protocol safety scores
  liquidity:    0.10,   // Exit price impact
} as const;

export interface CompositeScoreResult {
  riskScore: number;    // 0–100 integer, higher = more risk
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  components: {
    market: number;
    liquidation: number;
    concentration: number;
    protocol: number;
    liquidity: number;
  };
}

export function computeCompositeRiskScore(
  marketScore: number,
  liquidationScore: number,
  concentrationScore: number,
  protocolScore: number,
  liquidityScore: number,
  hasLiquidationData: boolean,
): CompositeScoreResult {

  // If no borrow positions: redistribute liquidation weight to market and concentration
  const weights = hasLiquidationData ? WEIGHTS : {
    market:       0.45,
    liquidation:  0.00,
    concentration: 0.30,
    protocol:     0.10,
    liquidity:    0.15,
  };

  const weighted =
    marketScore * weights.market +
    liquidationScore * weights.liquidation +
    concentrationScore * weights.concentration +
    protocolScore * weights.protocol +
    liquidityScore * weights.liquidity;

  const riskScore = Math.min(100, Math.max(0, Math.round(weighted)));

  const riskLevel =
    riskScore >= 80 ? 'CRITICAL' :
    riskScore >= 60 ? 'HIGH' :
    riskScore >= 40 ? 'MEDIUM' : 'LOW';

  return {
    riskScore,
    riskLevel,
    components: {
      market: marketScore,
      liquidation: liquidationScore,
      concentration: concentrationScore,
      protocol: protocolScore,
      liquidity: liquidityScore,
    },
  };
}
```

---

## Alert Evaluator

**File:** `alerts/alert-evaluator.ts`

```typescript
import { HF_THRESHOLDS } from '../analyzers/liquidation.analyzer';

export interface AlertCondition {
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  isTriggered: boolean;
}

export function evaluateAlertConditions(
  market: MarketRiskResult,
  liquidation: LiquidationRiskResult,
  concentration: ConcentrationRiskResult,
  liquidity: LiquidityRiskResult,
  protocolScores: Record<string, number>,
): AlertCondition[] {
  const conditions: AlertCondition[] = [];

  // 1. LIQUIDATION_IMMINENT — HF < 1.1
  const minHf = liquidation.minHealthFactor ? parseFloat(liquidation.minHealthFactor) : null;
  conditions.push({
    alertType: 'LIQUIDATION_IMMINENT',
    severity: 'CRITICAL',
    title: 'Liquidation Risk: Critical',
    message: `Your Folks Finance position has a health factor of ${minHf?.toFixed(3)} — dangerously close to liquidation (threshold: 1.0). Add collateral or repay debt immediately.`,
    metadata: { healthFactor: liquidation.minHealthFactor, positions: liquidation.positions },
    isTriggered: minHf !== null && minHf < HF_THRESHOLDS.CRITICAL,
  });

  // 2. LIQUIDATION_WARNING — HF < 1.3
  conditions.push({
    alertType: 'LIQUIDATION_WARNING',
    severity: 'HIGH',
    title: 'Liquidation Risk: Warning',
    message: `Health factor of ${minHf?.toFixed(3)} is approaching the liquidation zone. Consider reducing exposure.`,
    metadata: { healthFactor: liquidation.minHealthFactor },
    isTriggered: minHf !== null && minHf >= HF_THRESHOLDS.CRITICAL && minHf < HF_THRESHOLDS.WARNING,
  });

  // 3. HIGH_CONCENTRATION — HHI > 5000
  conditions.push({
    alertType: 'HIGH_CONCENTRATION',
    severity: 'HIGH',
    title: 'High Portfolio Concentration',
    message: `Your concentration index is ${parseFloat(concentration.assetHhi).toFixed(0)}/10,000 — indicating severe single-asset dependency. Consider diversifying.`,
    metadata: { hhi: concentration.assetHhi, threshold: 5000 },
    isTriggered: parseFloat(concentration.assetHhi) > 5000,
  });

  // 4. MODERATE_CONCENTRATION — HHI 2500–5000
  conditions.push({
    alertType: 'MODERATE_CONCENTRATION',
    severity: 'MEDIUM',
    title: 'Moderate Portfolio Concentration',
    message: `Concentration index of ${parseFloat(concentration.assetHhi).toFixed(0)}/10,000 indicates moderate concentration risk.`,
    metadata: { hhi: concentration.assetHhi },
    isTriggered: parseFloat(concentration.assetHhi) > 2500 && parseFloat(concentration.assetHhi) <= 5000,
  });

  // 5. HIGH_VOLATILITY — 30D annualized vol > 80%
  const vol30d = market.realizedVol30dPercent ? parseFloat(market.realizedVol30dPercent) : null;
  conditions.push({
    alertType: 'HIGH_VOLATILITY',
    severity: 'MEDIUM',
    title: 'High Portfolio Volatility',
    message: `30-day annualized portfolio volatility is ${vol30d?.toFixed(1)}% — significantly above typical DeFi benchmarks.`,
    metadata: { vol30dPercent: market.realizedVol30dPercent },
    isTriggered: vol30d !== null && vol30d > 80,
  });

  // 6. SIGNIFICANT_DRAWDOWN — MDD > 30%
  const mdd = market.maxDrawdownPercent ? parseFloat(market.maxDrawdownPercent) * 100 : null;
  conditions.push({
    alertType: 'SIGNIFICANT_DRAWDOWN',
    severity: 'HIGH',
    title: 'Significant Portfolio Drawdown',
    message: `Maximum drawdown of ${mdd?.toFixed(1)}% from your portfolio peak. Review your allocation strategy.`,
    metadata: { maxDrawdownPercent: market.maxDrawdownPercent },
    isTriggered: mdd !== null && mdd > 30,
  });

  // 7. LOW_LIQUIDITY — any position exit impact > 2%
  const maxImpact = parseFloat(liquidity.maxExitImpactPercent);
  conditions.push({
    alertType: 'LOW_LIQUIDITY',
    severity: 'MEDIUM',
    title: 'Low Exit Liquidity',
    message: `Exiting your largest position would cause an estimated ${maxImpact.toFixed(2)}% price impact — above the recommended 2% threshold.`,
    metadata: { maxImpactPercent: liquidity.maxExitImpactPercent, positions: liquidity.positions.filter(p => parseFloat(p.impactPercent) > 2) },
    isTriggered: maxImpact > 2,
  });

  // 8. LOW_PROTOCOL_SCORE — any used protocol < 60
  const lowProtocols = Object.entries(protocolScores).filter(([, score]) => score < 60);
  conditions.push({
    alertType: 'LOW_PROTOCOL_SCORE',
    severity: 'MEDIUM',
    title: 'Protocol Risk Detected',
    message: `One or more protocols in your portfolio have below-threshold safety scores: ${lowProtocols.map(([p]) => p).join(', ')}.`,
    metadata: { lowProtocols: lowProtocols.map(([p, s]) => ({ protocol: p, score: s })) },
    isTriggered: lowProtocols.length > 0,
  });

  return conditions;
}
```

---

## API Endpoints

All routes under `risk.routes.ts`. All require `authenticate` middleware.

---

### GET /api/v1/risk/score

**Purpose:** Composite risk score + component breakdown — the primary risk summary.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "riskScore": 58,
    "riskLevel": "MEDIUM",
    "components": {
      "market": 52,
      "liquidation": 70,
      "concentration": 55,
      "protocol": 18,
      "liquidity": 22
    },
    "activeAlerts": 2,
    "criticalAlerts": 0,
    "analyzedAt": "2026-06-24T08:00:00Z",
    "insufficientHistory": false
  }
}
```

---

### GET /api/v1/risk/market

**Purpose:** Full quantitative risk metrics — CVaR, Sortino, MDD, Calmar, Volatility.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "cvar95Percent": "-0.08421",
    "var95Percent": "-0.06200",
    "sortinoRatio": "1.24",
    "maxDrawdownPercent": "0.22400",
    "calmarRatio": "0.89",
    "realizedVol7dPercent": "67.42",
    "realizedVol30dPercent": "72.18",
    "snapshotsUsed": 42,
    "insufficientHistory": false,
    "interpretation": {
      "cvar": "In the worst 5% of days, your portfolio loses 8.42% on average",
      "sortino": "Positive Sortino ratio indicates risk-adjusted returns above capital preservation target",
      "mdd": "Maximum decline from peak is 22.4% of portfolio value",
      "volatility": "30D annualized volatility of 72.18% is elevated but within DeFi norms"
    }
  }
}
```

---

### GET /api/v1/risk/liquidation

**Response (200):**
```json
{
  "success": true,
  "data": {
    "hasActiveBorrows": true,
    "minHealthFactor": "1.42",
    "positions": [
      {
        "assetSymbol": "ALGO",
        "healthFactor": "1.42",
        "distanceToLiquidationPercent": "29.58",
        "status": "WARNING"
      }
    ]
  }
}
```

---

### GET /api/v1/risk/concentration

**Response (200):**
```json
{
  "success": true,
  "data": {
    "assetHhi": "3241.2200",
    "protocolHhi": "5120.4400",
    "hhiInterpretation": "Moderate concentration — HHI above 2500",
    "topExposures": [
      { "symbol": "ALGO", "truePercent": "67.42" },
      { "symbol": "USDC", "truePercent": "24.10" }
    ]
  }
}
```

---

### GET /api/v1/risk/alerts

Query params: `status` (ACTIVE|RESOLVED|DISMISSED), `severity` (CRITICAL|HIGH|MEDIUM|LOW), `page`, `pageSize`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "uuid",
        "alertType": "LIQUIDATION_WARNING",
        "severity": "HIGH",
        "status": "ACTIVE",
        "title": "Liquidation Risk: Warning",
        "message": "Health factor of 1.420 is approaching the liquidation zone...",
        "metadata": { "healthFactor": "1.42000000" },
        "triggeredAt": "2026-06-24T07:00:00Z"
      }
    ],
    "total": 2,
    "page": 1
  }
}
```

---

### PATCH /api/v1/risk/alerts/:id/dismiss

Marks an alert as DISMISSED. It will not be re-created unless the condition clears and retrieves.

**Response (200):**
```json
{
  "success": true,
  "data": { "alertId": "uuid", "status": "DISMISSED" }
}
```

---

## Events

**File:** `events/risk.events.ts`

```typescript
export const RiskEvents = {
  RISK_ANALYSIS_COMPLETED: 'RiskAnalysisCompleted',
  RISK_ALERT_TRIGGERED:    'RiskAlertTriggered',
} as const;

export interface RiskAnalysisCompletedPayload {
  riskSnapshotId:    string;
  userId:            string;
  portfolioSnapshotId: string;
  riskScore:         number;
  riskLevel:         'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  activeAlertCount:  number;
  criticalAlertCount: number;
  timestamp:         string;   // ISO8601 UTC
}

// Subscribed by:
// - Engine 5 (User Intelligence / Copilot) — uses riskScore + alerts for AI context
```

---

## Packages Required

No new packages. `decimal.js` is already installed from Plan 03.

---

## Graceful Degradation Summary

| Condition | Behavior |
|---|---|
| < 7 snapshots | MDD = null. Market component score uses default 15/100 |
| < 14 snapshots | Sortino = null |
| < 20 snapshots | CVaR = null. `insufficientHistory: true` in response |
| No Folks borrows | Liquidation component = null, weight redistributed |
| No LP positions | Liquidity component = 0 (no risk from LP exit) |
| Engine 1 snapshot missing | Abort analysis, log error, do NOT write risk snapshot |

---

## Logging Requirements

`module: "risk"`, JSON structured.

- `INFO` — risk analysis started (userId, portfolioSnapshotId, snapshotCount)
- `INFO` — analysis complete (riskScore, riskLevel, durationMs, alertsCreated, alertsResolved)
- `WARN` — insufficient history for CVaR/Sortino (snapshotsUsed, minimum required)
- `WARN` — partial analysis (which analyzers failed)
- `ERROR` — risk snapshot write failed
- `ERROR` — alert upsert failed (non-fatal, log and continue)

---

## Testing Requirements

Coverage: 95%+ on all analyzer functions (pure functions with known inputs/outputs).

### Unit Tests

**`market-risk.analyzer.test.ts`**
- Empty returns → all nulls, `insufficientHistory: true`
- 20+ returns with known values → CVaR correct at 5th percentile
- All positive returns → MDD = 0, Calmar = Infinity (handled gracefully)
- Sortino with no downside returns → null (no downside deviation)
- CVaR is always ≤ VaR (tail average ≤ threshold)
- Annualized volatility: constant 1% daily returns → √365 annualized

**`liquidation.analyzer.test.ts`**
- No borrow positions → hasActiveBorrows = false, componentScore = 0
- HF = 1.05 → CRITICAL status, score = 90
- HF = 1.25 → WARNING status, score = 70
- HF = 4.0 → SAFE status, score = 10
- Distance formula: HF=1.5 → (0.5/1.5)×100 = 33.33% distance

**`concentration.analyzer.test.ts`**
- Single asset (100%) → HHI = 10000, score = 100
- 4 equal assets (25% each) → HHI = 2500, score = 25
- Asset + protocol HHI weighted correctly (70/30)

**`composite-scorer.test.ts`**
- All components at 0 → riskScore = 0, riskLevel = LOW
- All components at 100 → riskScore = 100, riskLevel = CRITICAL
- Weights sum to 1.0 (assert in test)
- No liquidation data → weights correctly redistributed, score still 0–100

**`alert-evaluator.test.ts`**
- HF 1.05 → LIQUIDATION_IMMINENT triggered, LIQUIDATION_WARNING not triggered
- HF 1.25 → LIQUIDATION_WARNING triggered, LIQUIDATION_IMMINENT not triggered
- HHI 6000 → HIGH_CONCENTRATION triggered, MODERATE not triggered
- HHI 3000 → MODERATE_CONCENTRATION triggered, HIGH not triggered

### Integration Tests

**`risk.service.integration.test.ts`** (real Postgres, mocked Engine 1 data)
- Full pipeline: event received → risk snapshot written → event emitted
- Alert created when condition first triggered
- Alert auto-resolved when condition clears on next run
- DISMISSED alert not recreated even when condition re-triggers
- Immutability: attempt to UPDATE risk_snapshot → DB error (role restriction)

---

## Frontend Context

**Additions to `project-context/frontend-context.md`** under `Module: Engine 2 — Risk Intelligence`:

### Screens Required
1. **Risk Score Card** — 0–100 dial (red if HIGH/CRITICAL), risk level badge, last analyzed timestamp
2. **Risk Breakdown** — 5 component bars with scores and labels
3. **Market Risk Section** — CVaR ("In the worst 5% of days, you lose X%"), Sortino, MDD, Volatility chart
4. **Liquidation Monitor** — HF per position, color-coded (green/amber/red), distance %
5. **Alerts Panel** — active alerts list, severity badges, dismiss button
6. **Concentration Heatmap** — asset concentration vs protocol concentration side-by-side

### UX Rules
- Risk score 0–39 = green, 40–59 = amber, 60–79 = red, 80–100 = flashing red
- `insufficientHistory: true` → show "Building risk profile (X more days of data needed)" instead of metric
- CVaR explained in plain English, not as a raw number
- Alerts persist in panel until resolved OR dismissed — not ephemeral

---

## Open Items (Deferred)

| Item | Deferred To |
|---|---|
| Monte Carlo simulation | P2 — needs 250+ snapshots |
| Full correlation matrix | P2 — needs 90+ days of price history |
| Stress testing scenarios | Not planned |
| Beta vs ALGO benchmark | P2 |
| GARCH volatility modeling | Not planned (over-engineered for MVP) |
| Multi-wallet risk aggregation | P2 |
