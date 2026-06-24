# Plan 06 — Engine 4: Yield & Opportunity Engine

**Status:** Approved
**Priority:** P0
**Depends on:**
- Plan 02 (Financial Knowledge Layer — Folks Finance + Tinyman + Pact adapters, APY data)
- Plan 03 (Engine 1 — current portfolio + LP positions + true exposure)
- Plan 04 (Engine 2 — protocol risk scores + Engine 2 composite risk per protocol)
- Plan 05 (Engine 3 — user goal profile for opportunity filtering)

**Feeds into:** Engine 5 (Copilot — yield context for AI reasoning), Engine 6 (Execution — deploy capital to selected opportunity)

---

## Objective

Engine 4 is the yield and opportunity intelligence engine. It continuously discovers every available opportunity across Algorand DeFi protocols, scores each one using multi-dimensional risk-adjusted metrics, detects idle and underperforming capital in the user's portfolio, and surfaces ranked, actionable recommendations matched to the user's goal profile.

It answers:
- **"What opportunities exist right now?"** — ranked, not just listed
- **"Which of my assets are sitting idle or underperforming?"** — with opportunity cost in USD
- **"Should I move X to earn more?"** — with switching benefit projected

Engine 4 does **not** execute anything. It produces suggestions. Engine 6 executes.

---

## Scope: Supported Opportunities

| Protocol | Type | Data Source |
|---|---|---|
| Folks Finance | Lending (Supply) | `@folks-finance/algorand-sdk` — supply APY, utilization, TVL per market |
| Folks Finance | Lending (Borrow) | Same — borrow rates for leveraged strategies (P2) |
| Tinyman | AMM LP | `@tinymanorg/tinyman-js-sdk` — pool APY (fee APR), volume, TVL |
| Pact | AMM LP | `pactsdk` — pool APY (fee APR), volume, TVL |
| Native ALGO staking | Base yield | Algorand participation rewards (currently ~0%, flagged as zero-yield) |

---

## Architecture Decisions

### TOPSIS as the Primary Ranking Engine
TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution) is a Multi-Criteria Decision Making (MCDM) method that ranks N alternatives across M weighted criteria simultaneously.

**Why TOPSIS over simple weighted scores:**
- Handles conflicting criteria (maximize yield AND minimize risk AND maximize liquidity) without collapsing them into a single linear sum
- Produces a mathematically defensible rank order — not just a score
- User-adjustable via goal profile weights: CONSERVATIVE weights safety 3x over yield; AGGRESSIVE weights yield 2x over safety
- Each criterion can be independently normalized — solves the unit mismatch problem (APY % vs risk score 0-100 vs TVL USD)

**Criteria matrix (5 criteria, goal-profile-weighted):**

| Criterion | Direction | CONSERVATIVE weight | MODERATE weight | AGGRESSIVE weight |
|---|---|---|---|---|
| netAPY (%) | Maximize | 0.10 | 0.25 | 0.40 |
| Protocol Safety Score (0-100) | Maximize | 0.40 | 0.25 | 0.15 |
| Yield Consistency (1/CV) | Maximize | 0.25 | 0.20 | 0.15 |
| Liquidity Score | Maximize | 0.15 | 0.15 | 0.15 |
| IL Risk (0-100, LP only) | Minimize | 0.10 | 0.15 | 0.15 |

### APY Normalization — Input Quality First
Raw APY data from different adapters is not comparable:
- Folks Finance reports supply APY (already compound-adjusted)
- Tinyman/Pact report fee APR (not compounded)

Normalization pipeline runs before scoring:
1. Convert APR to APY: `APY = (1 + APR/365)^365 - 1`
2. Compute 30-day time-weighted average (TWAP) APY from historical snapshots when available
3. Split organic vs incentivized yield components
4. Compute excess yield over baseline (USDC Folks Finance lending = risk-free baseline)

### IL-Adjusted True Yield for LP Positions
For LP opportunities (Tinyman, Pact), raw fee APY is misleading. True yield accounts for expected impermanent loss:

```
trueYield = tradingFeeAPY + rewardAPY - estimatedIL_annualized
```

Where `estimatedIL_annualized` is projected from the pair's 30-day realized volatility using the standard formula:
```
IL = 2*sqrt(d)/(1+d) - 1   where d = P_new/P_old
```

If `trueYield < baselineAPY` → LP opportunity is losing vs simply lending. Flag as NEGATIVE_REAL_YIELD.

### Idle Capital Detection (Portfolio Scan)
Algorand transaction fees are ~0.001 ALGO (near-zero). Unlike Ethereum, the cost of switching protocols is negligible — Engine 4 can flag even small yield differentials as actionable.

Detection tiers:
- **IDLE:** Asset earning 0% (native wallet balance)
- **UNDERPERFORMING:** Asset earning less than baseline APY
- **SUBOPTIMAL:** Asset earning baseline APY but a better risk-adjusted alternative exists

Opportunity cost always expressed in USD/year: `opportunityCost = (bestAPY - currentAPY) * positionUSD`

### Sustainability Assessment
Yield opportunities are tagged with a sustainability rating:
- **ORGANIC:** Yield from protocol fees/lending spreads only. Sustainable indefinitely
- **MIXED:** Organic base + governance token emissions. Sustainable while token price holds
- **INCENTIVIZED:** Entirely token emission driven. Temporary — flag with TVL trend

TVL trend signal (7D slope):
- Rising +5%+ → GROWING confidence signal
- Flat ±5% → STABLE
- Falling -10%+ → DECLINING — flag warning
- Falling -25%+ → DISTRESS — exclude from top rankings unless explicitly requested

### Portfolio Fit Scoring
Every opportunity is scored for how well it complements the *existing* portfolio (not just standalone quality):

- **Correlation penalty:** If the opportunity adds exposure to an asset already >30% of portfolio → reduce portfolioFitScore
- **MCR contribution:** Lightweight Marginal Contribution to Risk check — does adding this position increase or decrease portfolio volatility?
- **Goal profile gate:** Hard filter — CONSERVATIVE users never see volatile LP opportunities in default view

---

## SOTA Methods — Full Justification

### Why TOPSIS
- Standard in multi-criteria DeFi ranking (published research, institutional frameworks)
- Handles 5 criteria simultaneously with no loss of information
- Produces Closeness Coefficient (0-1) — natural score for ranking
- Weights are goal-profile-driven — no manual tuning needed
- Computationally cheap: O(n*m) where n=opportunities, m=criteria

### Why NOT ML/AI-based APY forecasting
- DeFi APY is driven by utilization which is near-random at short horizons
- ML models achieve near-zero predictive accuracy for APY forecasting in live DeFi environments
- Adding ML complexity with no signal benefit would violate the "maximum signal per unit complexity" principle

### Why NOT AHP (Analytic Hierarchy Process) for weights
- AHP requires pairwise comparison interviews to derive weights
- Static goal-profile weights (CONSERVATIVE/MODERATE/AGGRESSIVE) are sufficient for MVP
- AHP weight determination via Engine 5 (User Intelligence) is a natural P2 feature

### Why Coefficient of Variation for yield consistency
- `CV = sigma(APY_30d) / mean(APY_30d)` — dimensionless, comparable across opportunities
- Superior to raw standard deviation (which penalizes high-APY opportunities unfairly)
- A low-CV, moderate-APY opportunity is often better than a high-CV, high-APY one for most users

### Why IL-adjusted yield for LP (not just fee APY)
- Headline fee APY on Tinyman/Pact pools routinely overstates actual LP returns
- IL erosion on volatile pairs (ALGO/goETH) can easily exceed annual fee income
- Users must see `trueYield` to make informed decisions — showing fee APY alone is misleading

### Why 30-Day TWAP APY (not spot)
- Spot APY on lending protocols can spike 10x during flash loan events or temporary liquidity crises
- 30D TWAP reflects what a user who deposited 30 days ago would have actually earned
- More accurate signal for forward-looking yield expectation

---

## Processing Pipeline (6 Steps)

```
PortfolioSnapshotCreated event  (Engine 1 trigger)
    |
    v
[Step 1] Discover all opportunities
    |-- Folks Finance: fetch all market APYs + utilization rates + TVL
    |-- Tinyman: fetch top pools by volume (TVL > $10,000 threshold)
    |-- Pact: fetch top pools by TVL
    +-- Native ALGO: tag as IDLE (0% yield)

    |
    v
[Step 2] Normalize APY inputs
    |-- APR -> APY conversion (Tinyman/Pact fee APR -> compounded APY)
    |-- Compute 30D TWAP APY where history exists; use spot APY for new pools
    |-- Tag yield type: ORGANIC / MIXED / INCENTIVIZED
    |-- Compute excess yield over baseline (USDC Folks lending rate)
    +-- For LP: compute trueYield = feeAPY + rewardAPY - estimatedIL_annualized

    |
    v
[Step 3] Score each opportunity (6 dimensions)
    |-- netAPY: true yield after IL for LP, compound APY for lending
    |-- protocolSafetyScore: from Engine 2 protocol risk score (100 - riskScore)
    |-- yieldConsistencyScore: 1/CV if 30D history; 50 (neutral) if new pool
    |-- liquidityScore: TVL-to-position-size ratio + utilization health
    |-- ilRiskScore: 0 for lending; 0-100 for LP based on pair volatility
    +-- sustainabilityScore: ORGANIC=100, MIXED=65, INCENTIVIZED=30 (qualitative tag -> score)

    |
    v
[Step 4] TOPSIS ranking (goal-profile-weighted)
    |-- Build N x 5 decision matrix (N opportunities, 5 criteria)
    |-- Normalize matrix (vector normalization per criterion)
    |-- Apply goal profile weights per criterion
    |-- Identify positive ideal solution (best value per criterion)
    |-- Identify negative ideal solution (worst value per criterion)
    |-- Compute Euclidean distance from each opportunity to both ideals
    +-- Closeness coefficient: Ci = dist_negative / (dist_positive + dist_negative)
         -> Rank by Ci descending (1.0 = ideal, 0.0 = worst)

    |
    v
[Step 5] Idle capital detection (portfolio cross-reference)
    |-- For each position in current PortfolioSnapshot:
    |   |-- Find matching opportunities for that asset
    |   |-- Compare current yield vs best available yield
    |   +-- Flag IDLE / UNDERPERFORMING / SUBOPTIMAL with opportunityCostUsd
    +-- Generate upgrade suggestions: "Move ALGO from wallet to Folks lending: +$84/year"

    |
    v
[Step 6] Apply portfolio fit scoring + goal filters
    |-- For each opportunity: compute portfolioFitScore
    |   |-- Correlation penalty: if asset already >30% of portfolio
    |   |-- MCR contribution: lightweight delta-vol estimate
    |   +-- Goal profile gate: hard-filter ineligible types
    |-- Merge TOPSIS rank + portfolioFitScore into finalScore
    |-- Write YieldOpportunitySnapshot (INSERT-only)
    +-- Emit YieldOpportunitiesUpdated event
```

---

## Scoring Implementations

### APY Normalization

**File:** `normalizers/apy.normalizer.ts`

```typescript
import Decimal from 'decimal.js';

/**
 * Convert APR to APY given compounding frequency.
 * Tinyman/Pact report fee APR (annual, not compounded).
 * Folks Finance reports supply APY (already compounded).
 */
export function aprToApy(apr: string, compoundingsPerYear: number = 365): string {
  const aprD = new Decimal(apr);
  // APY = (1 + APR/n)^n - 1
  const apy = aprD.div(compoundingsPerYear).plus(1).pow(compoundingsPerYear).minus(1);
  return apy.toFixed(8);
}

/**
 * Compute 30-day time-weighted average APY from historical data points.
 * Falls back to spot APY if fewer than 7 data points available.
 */
export function computeTwapApy(
  historicalApy: Array<{ apyPercent: string; recordedAt: Date }>,
  spotApy: string,
): string {
  if (historicalApy.length < 7) return spotApy; // insufficient history

  // Weight by time: more recent = higher weight (exponential decay)
  const lambda = 0.9; // decay factor
  let weightedSum = new Decimal(0);
  let totalWeight = new Decimal(0);

  const sorted = [...historicalApy].sort(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()
  );

  sorted.forEach((point, i) => {
    const weight = new Decimal(lambda).pow(i);
    weightedSum = weightedSum.plus(new Decimal(point.apyPercent).mul(weight));
    totalWeight = totalWeight.plus(weight);
  });

  return totalWeight.isZero()
    ? spotApy
    : weightedSum.div(totalWeight).toFixed(8);
}

/**
 * Coefficient of Variation of APY (sigma / mean).
 * Lower = more consistent yield.
 * Returns null if insufficient data.
 */
export function computeApyCv(apyHistory: string[]): string | null {
  if (apyHistory.length < 7) return null;

  const vals = apyHistory.map(v => new Decimal(v));
  const n = vals.length;
  const mean = vals.reduce((s, v) => s.plus(v), new Decimal(0)).div(n);

  if (mean.isZero()) return null;

  const variance = vals
    .reduce((s, v) => s.plus(v.minus(mean).pow(2)), new Decimal(0))
    .div(n);

  const sigma = variance.sqrt();
  return sigma.div(mean).toFixed(8);
}

/**
 * Excess yield over the risk-free baseline (USDC Folks lending APY).
 * Negative = opportunity pays LESS than risk-free.
 */
export function computeExcessYield(netApy: string, baselineApy: string): string {
  return new Decimal(netApy).minus(new Decimal(baselineApy)).toFixed(8);
}
```

---

### IL-Adjusted True Yield

**File:** `normalizers/il-adjusted-yield.ts`

```typescript
import Decimal from 'decimal.js';

/**
 * Standard constant-product AMM impermanent loss formula.
 * IL = 2*sqrt(d) / (1 + d) - 1
 * where d = ratio of current price to entry price for asset A vs asset B
 *
 * Returns negative percentage (loss).
 */
export function computeIL(priceRatioChange: string): string {
  const d = new Decimal(priceRatioChange);
  if (d.lte(0)) return '0';

  const sqrtD = d.sqrt();
  const il = sqrtD.mul(2).div(d.plus(1)).minus(1);
  return il.toFixed(8);
}

/**
 * Annualized IL estimate from 30-day realized volatility of asset pair.
 * Approximation: IL grows roughly as sigma^2 for small price divergences.
 * Uses: expected |d - 1| from log-normal price ratio distribution.
 */
export function estimateAnnualizedIL(
  asset1Vol30dPercent: string,   // annualized vol of asset 1
  asset2Vol30dPercent: string,   // annualized vol of asset 2
  correlation: string = '0.5',  // asset pair price correlation
): string {
  const sigma1 = new Decimal(asset1Vol30dPercent).div(100);
  const sigma2 = new Decimal(asset2Vol30dPercent).div(100);
  const rho = new Decimal(correlation);

  // Portfolio variance of log price ratio using Ito's lemma approximation
  // sigma_pair^2 = sigma1^2 + sigma2^2 - 2*rho*sigma1*sigma2
  const varPair = sigma1.pow(2)
    .plus(sigma2.pow(2))
    .minus(rho.mul(sigma1).mul(sigma2).mul(2));

  // Approximate expected IL from variance: IL_expected ~ -0.5 * sigma_pair^2
  const expectedIL = varPair.mul(-0.5);
  return expectedIL.toFixed(8);
}

/**
 * True LP yield after IL.
 * trueYield = tradingFeeAPY + rewardAPY + estimatedIL_annualized
 * (IL is already negative — addition subtracts it from yield)
 */
export function computeTrueYield(
  tradingFeeApy: string,
  rewardApy: string,
  estimatedAnnualIL: string,
): string {
  return new Decimal(tradingFeeApy)
    .plus(rewardApy)
    .plus(estimatedAnnualIL) // IL is negative
    .toFixed(8);
}

/**
 * IL risk tier classification for display and scoring.
 */
export function classifyILRisk(estimatedAnnualIL: string): 'NEGLIGIBLE' | 'LOW' | 'MODERATE' | 'HIGH' {
  const il = Math.abs(parseFloat(estimatedAnnualIL));
  if (il < 0.01) return 'NEGLIGIBLE'; // < 1% annualized IL
  if (il < 0.05) return 'LOW';        // 1-5%
  if (il < 0.15) return 'MODERATE';   // 5-15%
  return 'HIGH';                      // > 15%
}
```

---

### TOPSIS Ranker

**File:** `ranking/topsis.ranker.ts`

```typescript
import Decimal from 'decimal.js';

export interface TopsisInput {
  id: string;
  criteria: {
    netApy: number;           // benefit criterion (maximize)
    protocolSafetyScore: number; // benefit criterion (maximize)
    yieldConsistencyScore: number; // benefit (maximize) — derived from 1/CV, normalized 0-100
    liquidityScore: number;   // benefit criterion (maximize)
    ilRiskScore: number;      // cost criterion (minimize) — 0 for lending
  };
}

export interface TopsisResult {
  id: string;
  closenessCoefficient: string; // DECIMAL 0-1, higher = better
  rank: number;
}

// Goal profile weights: [netApy, protocolSafety, consistency, liquidity, ilRisk]
export const GOAL_WEIGHTS = {
  CONSERVATIVE: [0.10, 0.40, 0.25, 0.15, 0.10],
  MODERATE:     [0.25, 0.25, 0.20, 0.15, 0.15],
  AGGRESSIVE:   [0.40, 0.15, 0.15, 0.15, 0.15],
} as const;

/**
 * TOPSIS: Technique for Order of Preference by Similarity to Ideal Solution
 *
 * Reference: Hwang & Yoon (1981), "Multiple Attribute Decision Making"
 * Widely used in DeFi opportunity ranking and quantitative finance.
 *
 * Steps:
 *   1. Normalize decision matrix (vector normalization)
 *   2. Apply goal-profile weights
 *   3. Find positive ideal (best) and negative ideal (worst) solutions
 *   4. Compute Euclidean distance from each alternative to both ideals
 *   5. Compute closeness coefficient Ci = dist_neg / (dist_pos + dist_neg)
 *   6. Rank by Ci descending
 */
export function topsisRank(
  opportunities: TopsisInput[],
  goalProfile: keyof typeof GOAL_WEIGHTS,
): TopsisResult[] {
  if (opportunities.length === 0) return [];
  if (opportunities.length === 1) {
    return [{ id: opportunities[0].id, closenessCoefficient: '1.0', rank: 1 }];
  }

  const weights = GOAL_WEIGHTS[goalProfile];
  const n = opportunities.length;

  // Build decision matrix: rows = alternatives, cols = criteria
  const matrix = opportunities.map(o => [
    o.criteria.netApy,
    o.criteria.protocolSafetyScore,
    o.criteria.yieldConsistencyScore,
    o.criteria.liquidityScore,
    o.criteria.ilRiskScore,
  ]);

  const numCriteria = 5;

  // Step 1: Vector normalization per criterion
  // r_ij = x_ij / sqrt(sum(x_kj^2))
  const columnNorms = Array.from({ length: numCriteria }, (_, j) =>
    Math.sqrt(matrix.reduce((s, row) => s + row[j] * row[j], 0))
  );

  const normalized = matrix.map(row =>
    row.map((val, j) => columnNorms[j] > 0 ? val / columnNorms[j] : 0)
  );

  // Step 2: Apply weights
  const weighted = normalized.map(row =>
    row.map((val, j) => val * weights[j])
  );

  // Step 3: Positive ideal (max for benefit, min for cost) and negative ideal
  // Criteria 0-3: benefit (maximize). Criterion 4: cost (minimize ilRisk).
  const IS_COST = [false, false, false, false, true]; // ilRiskScore is cost

  const posIdeal = Array.from({ length: numCriteria }, (_, j) =>
    IS_COST[j]
      ? Math.min(...weighted.map(row => row[j])) // cost: lower is better
      : Math.max(...weighted.map(row => row[j])) // benefit: higher is better
  );

  const negIdeal = Array.from({ length: numCriteria }, (_, j) =>
    IS_COST[j]
      ? Math.max(...weighted.map(row => row[j]))
      : Math.min(...weighted.map(row => row[j]))
  );

  // Step 4: Euclidean distance from each alternative to pos/neg ideals
  const distPos = weighted.map(row =>
    Math.sqrt(row.reduce((s, val, j) => s + Math.pow(val - posIdeal[j], 2), 0))
  );

  const distNeg = weighted.map(row =>
    Math.sqrt(row.reduce((s, val, j) => s + Math.pow(val - negIdeal[j], 2), 0))
  );

  // Step 5: Closeness coefficient Ci = dist_neg / (dist_pos + dist_neg)
  const results: TopsisResult[] = opportunities.map((opp, i) => {
    const totalDist = distPos[i] + distNeg[i];
    const ci = totalDist > 0 ? distNeg[i] / totalDist : 0;
    return {
      id: opp.id,
      closenessCoefficient: ci.toFixed(8),
      rank: 0, // filled in step 6
    };
  });

  // Step 6: Rank by closeness coefficient descending
  results.sort((a, b) =>
    parseFloat(b.closenessCoefficient) - parseFloat(a.closenessCoefficient)
  );
  results.forEach((r, i) => { r.rank = i + 1; });

  return results;
}
```

---

### Idle Capital Detector

**File:** `detection/idle-capital.detector.ts`

```typescript
import Decimal from 'decimal.js';

export type IdleTier = 'IDLE' | 'UNDERPERFORMING' | 'SUBOPTIMAL' | 'OPTIMAL';

export interface IdleCapitalSignal {
  assetSymbol: string;
  currentProtocol: string;         // 'wallet' | 'folks-lending' | 'tinyman-lp' | etc.
  currentApyPercent: string;        // DECIMAL
  bestAvailableApyPercent: string;  // DECIMAL — from ranked opportunities for this asset
  bestAvailableOpportunityId: string;
  opportunityCostUsdPerYear: string; // DECIMAL — (bestAPY - currentAPY) * positionUSD
  tier: IdleTier;
  actionSuggestion: string;         // plain-English
  positionValueUsd: string;         // DECIMAL
}

const IDLE_THRESHOLD_APY = '0.001';       // below 0.1% = effectively zero
const UNDERPERFORM_THRESHOLD_APY = '0.01'; // below 1% with alternatives > 1% = underperforming

/**
 * Detects idle and underperforming capital by comparing current position yield
 * to the best available opportunity for each asset in the user's portfolio.
 *
 * Algorand tx fees are ~0.001 ALGO — near-zero switching cost.
 * Even small yield differentials are actionable.
 */
export function detectIdleCapital(
  positions: Array<{
    assetSymbol: string;
    protocol: string;
    currentApyPercent: string;
    valueUsd: string;
  }>,
  bestOpportunitiesByAsset: Record<string, {
    opportunityId: string;
    netApyPercent: string;
  }>,
  baselineApyPercent: string, // USDC Folks lending APY — our risk-free rate
): IdleCapitalSignal[] {
  const signals: IdleCapitalSignal[] = [];

  for (const pos of positions) {
    const best = bestOpportunitiesByAsset[pos.assetSymbol];
    if (!best) continue;

    const currentApy = new Decimal(pos.currentApyPercent);
    const bestApy = new Decimal(best.netApyPercent);
    const baselineApy = new Decimal(baselineApyPercent);
    const posValueUsd = new Decimal(pos.valueUsd);
    const opportunityCostUsd = bestApy.minus(currentApy).div(100).mul(posValueUsd);

    if (opportunityCostUsd.lte(0.5)) continue; // < $0.50/year benefit — not worth surfacing

    let tier: IdleTier;
    let actionSuggestion: string;

    if (currentApy.lt(IDLE_THRESHOLD_APY)) {
      tier = 'IDLE';
      actionSuggestion = `Your ${pos.assetSymbol} is earning nothing. ` +
        `Moving it to ${best.opportunityId} would earn ~$${opportunityCostUsd.toFixed(2)}/year.`;
    } else if (currentApy.lt(baselineApy) && bestApy.gt(baselineApy)) {
      tier = 'UNDERPERFORMING';
      actionSuggestion = `Your ${pos.assetSymbol} in ${pos.protocol} is earning ` +
        `${currentApy.toFixed(2)}% — below the ${baselineApy.toFixed(2)}% risk-free rate. ` +
        `A better option earns ${bestApy.toFixed(2)}% (+$${opportunityCostUsd.toFixed(2)}/year).`;
    } else if (bestApy.minus(currentApy).gt(2)) { // > 2% better alternative
      tier = 'SUBOPTIMAL';
      actionSuggestion = `${pos.assetSymbol} in ${pos.protocol} earns ${currentApy.toFixed(2)}%, ` +
        `but ${best.opportunityId} offers ${bestApy.toFixed(2)}%. ` +
        `Difference: ~$${opportunityCostUsd.toFixed(2)}/year.`;
    } else {
      tier = 'OPTIMAL';
      continue; // skip OPTIMAL positions — no suggestion needed
    }

    signals.push({
      assetSymbol: pos.assetSymbol,
      currentProtocol: pos.protocol,
      currentApyPercent: currentApy.toFixed(8),
      bestAvailableApyPercent: bestApy.toFixed(8),
      bestAvailableOpportunityId: best.opportunityId,
      opportunityCostUsdPerYear: opportunityCostUsd.toFixed(8),
      tier,
      actionSuggestion,
      positionValueUsd: posValueUsd.toFixed(8),
    });
  }

  // Sort: IDLE first, then UNDERPERFORMING, then SUBOPTIMAL; within tier by opportunityCost desc
  const tierOrder: Record<IdleTier, number> = { IDLE: 0, UNDERPERFORMING: 1, SUBOPTIMAL: 2, OPTIMAL: 3 };
  return signals.sort((a, b) =>
    tierOrder[a.tier] !== tierOrder[b.tier]
      ? tierOrder[a.tier] - tierOrder[b.tier]
      : parseFloat(b.opportunityCostUsdPerYear) - parseFloat(a.opportunityCostUsdPerYear)
  );
}
```

---

### Portfolio Fit Scorer

**File:** `scoring/portfolio-fit.scorer.ts`

```typescript
import Decimal from 'decimal.js';

/**
 * Portfolio fit scoring for a new opportunity.
 * Returns a fit score 0-100 (100 = perfectly complementary).
 *
 * Penalizes:
 * - Adding exposure to already-overweight assets (concentration penalty)
 * - LP opportunities for CONSERVATIVE goal profile
 * - Opportunities with assets highly correlated to existing holdings
 */
export function computePortfolioFitScore(params: {
  opportunityAsset: string;
  opportunityType: 'LENDING' | 'LP';
  currentPortfolioWeights: Record<string, string>; // asset -> weight fraction (sums to 1)
  goalProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  pairAssets?: string[];  // for LP: both assets in the pair
}): number {
  const { opportunityAsset, opportunityType, currentPortfolioWeights, goalProfile, pairAssets } = params;

  // Start with perfect fit
  let score = 100;

  // 1. Goal profile gate — hard reduction for LP in CONSERVATIVE
  if (goalProfile === 'CONSERVATIVE' && opportunityType === 'LP') {
    score -= 50; // LPs are volatile and have IL risk — heavily penalized for conservative users
  }

  // 2. Concentration penalty — asset already overweight in portfolio
  const primaryWeight = parseFloat(currentPortfolioWeights[opportunityAsset] ?? '0');
  if (primaryWeight > 0.50) score -= 30;       // >50% already in this asset
  else if (primaryWeight > 0.30) score -= 15;  // >30% already
  else if (primaryWeight > 0.20) score -= 7;   // >20% already

  // 3. For LP opportunities: check both assets
  if (opportunityType === 'LP' && pairAssets) {
    const totalLpExposure = pairAssets.reduce(
      (s, asset) => s + parseFloat(currentPortfolioWeights[asset] ?? '0'),
      0
    );
    if (totalLpExposure > 0.60) score -= 20; // LP pair already dominates portfolio
  }

  // 4. Bonus: opportunity reduces concentration (new asset not in portfolio)
  if (primaryWeight === 0 && opportunityType === 'LENDING') {
    score += 10; // genuinely new exposure — diversification benefit
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Merge TOPSIS closeness coefficient and portfolio fit into a final composite score.
 * topsisScore (0-1) weighted 70%, portfolioFitScore (0-100 normalized to 0-1) weighted 30%.
 */
export function computeFinalScore(topsisCloseness: string, portfolioFitScore: number): string {
  const topsis = new Decimal(topsisCloseness);
  const fit = new Decimal(portfolioFitScore).div(100);
  return topsis.mul(0.70).plus(fit.mul(0.30)).toFixed(8);
}
```

---

### Sustainability Tagger

**File:** `scoring/sustainability.tagger.ts`

```typescript
export type SustainabilityTier = 'ORGANIC' | 'MIXED' | 'INCENTIVIZED';
export type TvlTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'DISTRESS';

/**
 * Classify yield source sustainability.
 * Organic = fee-only (durable). Mixed = fee + emissions. Incentivized = emissions only.
 */
export function classifySustainability(
  organicApyPercent: string,
  incentivizedApyPercent: string,
): SustainabilityTier {
  const organic = parseFloat(organicApyPercent);
  const incentivized = parseFloat(incentivizedApyPercent);
  const total = organic + incentivized;

  if (total === 0) return 'ORGANIC'; // edge case
  const incentivizedFraction = incentivized / total;

  if (incentivizedFraction < 0.1) return 'ORGANIC';       // < 10% from emissions
  if (incentivizedFraction < 0.5) return 'MIXED';         // 10-50% from emissions
  return 'INCENTIVIZED';                                   // > 50% from emissions
}

/**
 * Classify TVL trend from 7-day change.
 */
export function classifyTvlTrend(tvlChange7dPercent: string): TvlTrend {
  const change = parseFloat(tvlChange7dPercent);
  if (change >= 5) return 'GROWING';
  if (change >= -10) return 'STABLE';
  if (change >= -25) return 'DECLINING';
  return 'DISTRESS';
}

/** Convert sustainability tier to numeric score for TOPSIS input */
export function sustainabilityToScore(tier: SustainabilityTier): number {
  return { ORGANIC: 100, MIXED: 65, INCENTIVIZED: 30 }[tier];
}

/** Convert TVL trend to liquidity confidence multiplier */
export function tvlTrendToMultiplier(trend: TvlTrend): number {
  return { GROWING: 1.0, STABLE: 0.9, DECLINING: 0.7, DISTRESS: 0.4 }[trend];
}
```

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions)

```prisma
model YieldOpportunitySnapshot {
  id                      String            @id @default(uuid()) @db.Uuid
  userId                  String            @db.Uuid
  portfolioSnapshotId     String            @db.Uuid  // trigger snapshot

  // Opportunity identity
  protocol                String            // 'folks-finance' | 'tinyman' | 'pact'
  opportunityType         OpportunityType   // LENDING | LP
  assetSymbol             String            // primary asset (ALGO, USDC, goETH...)
  pairSymbol              String?           // secondary asset for LP (null for lending)
  marketId                String?           // protocol-specific pool/market ID

  // APY data
  spotApyPercent          String            // DECIMAL — raw from adapter
  twapApy30dPercent       String?           // DECIMAL — null if < 7 data points
  organicApyPercent       String            // DECIMAL — fee/lending spread only
  incentivizedApyPercent  String            // DECIMAL — token reward portion
  netApyPercent           String            // DECIMAL — IL-adjusted for LP; raw for lending
  excessYieldPercent      String            // DECIMAL — net APY minus baseline APY

  // Yield quality
  apyCv                   String?           // DECIMAL — Coefficient of Variation; null if < 7 points
  yieldConsistencyScore   Int               // 0-100 (100/CV normalized, 50 if no history)
  sustainabilityTier      SustainabilityTier
  sustainabilityScore     Int               // 0-100

  // Protocol and liquidity
  tvlUsd                  String            // DECIMAL
  tvlChange7dPercent      String?           // DECIMAL — signed
  tvlTrend                TvlTrend
  utilizationRatePercent  String?           // DECIMAL — lending only
  protocolSafetyScore     Int               // 0-100 (from Engine 2 protocol risk)
  liquidityScore          Int               // 0-100

  // LP-specific
  ilRiskTier              ILRiskTier?       // null for lending
  ilRiskScore             Int               @default(0) // 0-100 (0 for lending)
  estimatedAnnualIlPercent String?          // DECIMAL — negative number

  // TOPSIS ranking
  goalProfile             GoalProfile
  topsisClosenessCoeff    String            // DECIMAL 0-1
  topsisRank              Int
  portfolioFitScore       Int               // 0-100
  finalScore              String            // DECIMAL — 0.7*topsis + 0.3*fit

  // Idle capital link
  idleCapitalSignalId     String?           // if this opportunity is the "best alternative" for idle capital

  // INSERT only
  createdAt               DateTime          @default(now())

  user                    User              @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, goalProfile, topsisRank])
  @@map("yield_opportunity_snapshots")
}

model IdleCapitalSignal {
  id                          String      @id @default(uuid()) @db.Uuid
  userId                      String      @db.Uuid
  portfolioSnapshotId         String      @db.Uuid

  assetSymbol                 String
  currentProtocol             String
  currentApyPercent           String      // DECIMAL
  bestAvailableApyPercent     String      // DECIMAL
  bestOpportunitySnapshotId   String      @db.Uuid
  opportunityCostUsdPerYear   String      // DECIMAL
  tier                        IdleTier
  actionSuggestion            String
  positionValueUsd            String      // DECIMAL

  resolved                    Boolean     @default(false)  // true when user acts
  createdAt                   DateTime    @default(now())

  user                        User        @relation(fields: [userId], references: [id])

  @@index([userId, resolved, tier])
  @@map("idle_capital_signals")
}

enum OpportunityType   { LENDING LP }
enum SustainabilityTier { ORGANIC MIXED INCENTIVIZED }
enum TvlTrend          { GROWING STABLE DECLINING DISTRESS }
enum ILRiskTier        { NEGLIGIBLE LOW MODERATE HIGH }
enum IdleTier          { IDLE UNDERPERFORMING SUBOPTIMAL }
```

**Immutability:**
```sql
REVOKE UPDATE, DELETE ON yield_opportunity_snapshots FROM crestflow_app;
-- idle_capital_signals: allow UPDATE for resolved flag only
REVOKE DELETE ON idle_capital_signals FROM crestflow_app;
```

---

## Module File Structure

```
apps/copilot-api/src/modules/yield/
|-- yield.controller.ts
|-- yield.routes.ts
|-- yield.service.ts                     <- 6-step pipeline orchestrator
|-- normalizers/
|   |-- apy.normalizer.ts               <- APR->APY, TWAP, CV, excess yield
|   +-- il-adjusted-yield.ts            <- IL formula, annualized IL, true yield
|-- ranking/
|   +-- topsis.ranker.ts                <- TOPSIS implementation + goal weights
|-- scoring/
|   |-- portfolio-fit.scorer.ts         <- MCR, concentration penalty, goal gate
|   |-- sustainability.tagger.ts        <- organic/mixed/incentivized + TVL trend
|   +-- liquidity.scorer.ts             <- TVL-to-position ratio + utilization health
|-- detection/
|   +-- idle-capital.detector.ts        <- idle/underperforming/suboptimal detection
|-- repositories/
|   |-- yield-opportunity.repository.ts <- INSERT only
|   +-- idle-capital.repository.ts      <- INSERT + resolved update
+-- events/
    +-- yield.events.ts                 <- YieldOpportunitiesUpdated payload
```

---

## API Endpoints (7)

All routes under `yield.routes.ts`. All require `authenticate` middleware (JWT).

---

### GET /api/v1/yield/opportunities

All ranked opportunities for this user under their current goal profile.

Query params: `type` (LENDING|LP), `asset`, `minApy`, `sustainabilityTier`, `limit` (default 20), `page`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "goalProfile": "MODERATE",
    "baselineApyPercent": "3.42",
    "opportunities": [
      {
        "id": "uuid",
        "protocol": "folks-finance",
        "opportunityType": "LENDING",
        "assetSymbol": "USDC",
        "netApyPercent": "5.81",
        "spotApyPercent": "6.12",
        "twapApy30dPercent": "5.81",
        "organicApyPercent": "5.81",
        "incentivizedApyPercent": "0.00",
        "excessYieldPercent": "2.39",
        "sustainabilityTier": "ORGANIC",
        "tvlUsd": "4200000",
        "tvlTrend": "STABLE",
        "utilizationRatePercent": "72.4",
        "protocolSafetyScore": 88,
        "liquidityScore": 82,
        "ilRiskTier": null,
        "yieldConsistencyScore": 74,
        "topsisRank": 1,
        "topsisClosenessCoeff": "0.87241823",
        "portfolioFitScore": 71,
        "finalScore": "0.82318421"
      }
    ],
    "total": 14,
    "page": 1
  }
}
```

---

### GET /api/v1/yield/rankings

Top N opportunities by a specific ranking mode.

Query params: `mode` (YIELD_EFFICIENCY|RAW_APY|PORTFOLIO_FIT|SUSTAINABILITY), `limit` (default 5)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "mode": "YIELD_EFFICIENCY",
    "goalProfile": "MODERATE",
    "rankings": [
      {
        "rank": 1,
        "protocol": "folks-finance",
        "assetSymbol": "USDC",
        "netApyPercent": "5.81",
        "finalScore": "0.82318421",
        "sustainabilityTier": "ORGANIC",
        "ilRiskTier": null,
        "summary": "Best risk-adjusted lending opportunity — organic yield, high protocol safety"
      }
    ]
  }
}
```

---

### GET /api/v1/yield/idle

Idle and underperforming capital detections with opportunity cost.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalOpportunityCostUsdPerYear": "284.50",
    "signals": [
      {
        "id": "uuid",
        "assetSymbol": "ALGO",
        "currentProtocol": "wallet",
        "currentApyPercent": "0.00",
        "bestAvailableApyPercent": "4.12",
        "opportunityCostUsdPerYear": "192.40",
        "tier": "IDLE",
        "positionValueUsd": "4670.00",
        "actionSuggestion": "Your ALGO is earning nothing. Moving it to Folks Finance ALGO lending would earn ~$192/year."
      },
      {
        "id": "uuid",
        "assetSymbol": "USDC",
        "currentProtocol": "tinyman-lp",
        "currentApyPercent": "2.10",
        "bestAvailableApyPercent": "5.81",
        "opportunityCostUsdPerYear": "92.10",
        "tier": "UNDERPERFORMING",
        "positionValueUsd": "2480.00",
        "actionSuggestion": "Your USDC in Tinyman LP earns 2.10% — below the 3.42% risk-free rate. Folks Finance USDC lending earns 5.81% (+$92/year)."
      }
    ]
  }
}
```

---

### GET /api/v1/yield/opportunity/:id

Full detail for a single opportunity including scoring breakdown.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "protocol": "tinyman",
    "opportunityType": "LP",
    "assetSymbol": "ALGO",
    "pairSymbol": "USDC",
    "netApyPercent": "3.84",
    "tradingFeeApyPercent": "6.10",
    "estimatedAnnualIlPercent": "-2.26",
    "ilRiskTier": "LOW",
    "sustainabilityTier": "ORGANIC",
    "tvlUsd": "1820000",
    "tvlChange7dPercent": "-4.2",
    "tvlTrend": "STABLE",
    "utilizationRatePercent": null,
    "yieldConsistencyScore": 62,
    "apyCv": "0.28",
    "protocolSafetyScore": 82,
    "liquidityScore": 71,
    "topsisRank": 3,
    "portfolioFitScore": 58,
    "finalScore": "0.71234521",
    "scoreBreakdown": {
      "netApyContribution": "This opportunity earns 3.84% after ~2.26% estimated annual impermanent loss.",
      "consistencyNote": "APY has been moderately volatile (CV: 0.28) over the past 30 days.",
      "safetyNote": "Tinyman is an audited protocol with 2+ years of operation (safety score: 82/100).",
      "ilNote": "LOW IL risk — ALGO/USDC pair has low historical price divergence."
    }
  }
}
```

---

### POST /api/v1/yield/simulate

Simulate deploying a specific amount into an opportunity.

**Request:**
```json
{
  "opportunityId": "uuid",
  "deployAmountUsd": "2000"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "opportunityId": "uuid",
    "deployAmountUsd": "2000",
    "projectedAnnualYieldUsd": "76.80",
    "projectedNetApyPercent": "3.84",
    "projectedIlUsd": "-45.20",
    "projectedFeeYieldUsd": "122.00",
    "breakEvenDays": 42,
    "riskNote": "LOW IL risk — ALGO/USDC price divergence has historically been < 10% over 30-day windows.",
    "sustainabilityNote": "Yield is 100% organic (trading fees). No token emission dependency."
  }
}
```

---

### GET /api/v1/yield/upgrades

Positions currently below baseline APY where a better alternative exists.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "upgrades": [
      {
        "currentPosition": {
          "assetSymbol": "USDC",
          "protocol": "tinyman-lp",
          "currentApyPercent": "2.10",
          "valueUsd": "2480.00"
        },
        "suggestedOpportunity": {
          "id": "uuid",
          "protocol": "folks-finance",
          "netApyPercent": "5.81",
          "sustainabilityTier": "ORGANIC"
        },
        "gainPerYear": "$92.10",
        "urgency": "HIGH"
      }
    ]
  }
}
```

---

### GET /api/v1/yield/history

Historical opportunity snapshots — how APYs and rankings changed.

Query params: `protocol`, `assetSymbol`, `days` (default 30), `limit`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "date": "2026-06-24",
        "protocol": "folks-finance",
        "assetSymbol": "USDC",
        "netApyPercent": "5.81",
        "topsisRank": 1,
        "tvlUsd": "4200000"
      }
    ]
  }
}
```

---

## Events

**File:** `events/yield.events.ts`

```typescript
export const YieldEvents = {
  YIELD_OPPORTUNITIES_UPDATED: 'YieldOpportunitiesUpdated',
  IDLE_CAPITAL_DETECTED:       'IdleCapitalDetected',
} as const;

export interface YieldOpportunitiesUpdatedPayload {
  userId:               string;
  portfolioSnapshotId:  string;
  opportunityCount:     number;
  topRankedId:          string;
  idleCapitalCount:     number;
  totalOpportunityCostUsdPerYear: string;
  goalProfile:          string;
  timestamp:            string;
}

// Subscribed by:
// - Engine 5 (User Intelligence / Copilot) — yield context for AI reasoning
// - Engine 6 (Execution) — opportunity list for autonomous execution in P1
```

---

## New Packages

No new packages required. All implementations use:
- `decimal.js` (already in project) — all financial arithmetic
- `@folks-finance/algorand-sdk` (Plan 02) — supply APY, utilization data
- `@tinymanorg/tinyman-js-sdk` (Plan 02) — pool APY, volume, TVL
- `pactsdk` (Plan 02) — pool APY, TVL

---

## Trigger Rules

| Trigger | Condition |
|---|---|
| `PortfolioSnapshotCreated` event | Primary trigger — runs after every Engine 1 scan |
| `POST /api/v1/yield/opportunities` refresh | On-demand, 202 Accepted pattern |
| Scheduled | Every 4 hours — captures APY changes even without portfolio activity |

---

## Graceful Degradation

| Condition | Behavior |
|---|---|
| Folks Finance adapter fails | Use last cached opportunity data. Mark `dataQuality: degraded` |
| Tinyman adapter fails | Exclude LP opportunities from ranking. Surface lending only |
| < 7 historical APY points | Use spot APY instead of TWAP. Set `yieldConsistencyScore = 50` (neutral) |
| Engine 2 protocol score unavailable | Use last known score. Flag `protocolScoreStale: true` |
| No opportunities discovered | Return empty array with explanation. Never error 500 |
| User has no portfolio snapshot | Skip idle capital detection. Return opportunities only |

---

## Logging Requirements

`module: "yield"`, JSON structured.

- `INFO` — discovery started (userId, protocols queried)
- `INFO` — discovery complete (opportunityCount, topRankedProtocol, idleSignalCount, durationMs)
- `INFO` — idle capital detected (userId, tier, assetSymbol, opportunityCostUsd)
- `WARN` — adapter degraded (protocol, fallback to cache)
- `WARN` — insufficient history for TWAP (protocol, asset, dataPointCount)
- `ERROR` — opportunity snapshot write failed
- `ERROR` — TOPSIS matrix invalid (n=0 or degenerate criteria)

---

## Testing Requirements

Coverage: 95%+ on all pure functions (normalizers, TOPSIS, IL, scoring).

### Unit Tests

**`apy.normalizer.test.ts`**
- `aprToApy`: APR 0% -> APY 0%, APR 100% -> APY ~171.5%, APR 10% -> APY ~10.52%
- `computeTwapApy`: < 7 points returns spot APY; weighted correctly with lambda=0.9
- `computeApyCv`: uniform APY history returns CV=0; highly volatile returns CV>1
- `computeExcessYield`: correctly signed (negative when below baseline)

**`il-adjusted-yield.test.ts`**
- `computeIL`: d=1 (no price change) -> IL=0; d=2 -> IL≈-5.72%; d=4 -> IL≈-20%
- `estimateAnnualizedIL`: zero vols -> IL~0; high vols -> more negative IL
- `computeTrueYield`: fee+reward+IL correctly computed (IL negative reduces total)
- `classifyILRisk`: boundaries correct — < 1% = NEGLIGIBLE, 5-15% = MODERATE

**`topsis.ranker.test.ts`**
- Single opportunity -> closeness = 1.0, rank = 1
- All identical criteria -> equal closeness coefficients
- CONSERVATIVE weights: top-ranked has highest safety score
- AGGRESSIVE weights: top-ranked has highest APY
- Output length = input length
- Ranks are 1-indexed, consecutive integers
- Cost criterion (IL risk): lower IL risk -> higher rank for same other criteria

**`idle-capital.detector.test.ts`**
- Zero-APY position -> IDLE tier
- Position below baseline APY -> UNDERPERFORMING tier
- Position 2%+ below best available -> SUBOPTIMAL tier
- Signals sorted: IDLE first, then by opportunityCostUsd desc
- < $0.50/year benefit -> not surfaced (filtered out)

**`portfolio-fit.scorer.test.ts`**
- CONSERVATIVE + LP opportunity -> score reduced by 50
- Asset > 50% of portfolio -> score reduced by 30
- New asset not in portfolio + LENDING -> score +10 bonus
- Score always clamped [0, 100]

**`sustainability.tagger.test.ts`**
- 100% organic yield -> ORGANIC tier
- 60% incentivized -> INCENTIVIZED tier
- TVL -30% 7D -> DISTRESS tier

### Integration Tests

**`yield.service.integration.test.ts`** (real Postgres, mocked adapter data)
- Full pipeline: PortfolioSnapshotCreated -> opportunities written -> YieldOpportunitiesUpdated emitted
- TOPSIS rank order stable for same input
- Idle capital signals written and linked to opportunity snapshots
- Immutability: attempt UPDATE on yield_opportunity_snapshots -> DB error
- Goal profile filter: CONSERVATIVE user sees no LP opportunities in default view

---

## Frontend Context Additions

**Additions to `project-context/frontend-context.md`:**

### Screens Required

1. **Yield Dashboard** — top 5 opportunities by YIELD_EFFICIENCY. Each card: protocol badge, asset, APY, sustainability tag, IL risk tag, TOPSIS score
2. **Opportunities List** — filterable/sortable full list. Filters: type (Lending/LP), asset, min APY, sustainability tier
3. **Ranking Mode Selector** — tab toggle: Best Risk-Adjusted / Highest APY / Best Portfolio Fit / Most Sustainable
4. **Idle Capital Banner** — amber banner at top of dashboard showing total annual opportunity cost: "You're leaving ~$284/year on the table"
5. **Idle Capital List** — ordered signals: IDLE (red) → UNDERPERFORMING (amber) → SUBOPTIMAL (yellow). Each with action button
6. **Opportunity Detail Drawer** — full scoring breakdown, score explanation, simulate panel
7. **Simulate Panel** — enter USD amount, get: projected annual yield, estimated IL, break-even days
8. **Upgrade Suggestions** — positions earning below baseline, sorted by annual gain. "Upgrade" button -> opens opportunity detail

### UX Rules
- Sustainability tags: ORGANIC = green leaf icon, MIXED = amber leaf, INCENTIVIZED = orange flame
- IL risk tags: NEGLIGIBLE = grey, LOW = green, MODERATE = amber, HIGH = red
- TVL trend: DISTRESS opportunities shown with amber border + warning icon
- `trueYield` always shown for LP (never just fee APY) — with tooltip explaining IL subtraction
- Opportunity cost in idle capital always shown in USD/year (not just %)
- NEGATIVE_REAL_YIELD opportunity (trueYield < 0%) shown with red badge, not hidden
- Simulate panel: break-even days calculation shown prominently
