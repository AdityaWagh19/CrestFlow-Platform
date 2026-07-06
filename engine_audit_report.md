# CrestFlow — AI Engine Architecture Audit

**Date:** 2026-07-06
**Auditor:** Deep code review — all service files, analyzers, optimizers, builders, and event wiring.
**Directive:** Verify code, not comments. Be brutally honest. Surface all gaps.

---

## Table of Contents

1. [Engine 1 — Portfolio Intelligence](#engine-1--portfolio-intelligence)
2. [Engine 2 — Risk Intelligence](#engine-2--risk-intelligence)
3. [Engine 3 — Strategy & Optimization](#engine-3--strategy--optimization)
4. [Engine 4 — Yield & Opportunity](#engine-4--yield--opportunity)
5. [Engine 5 — User Intelligence](#engine-5--user-intelligence)
6. [Engine 6 — Autonomous Execution + Copilot](#engine-6--autonomous-execution--copilot)
7. [Cross-Engine Analysis](#cross-engine-analysis)
8. [Final Matrix](#final-matrix)
9. [Final Verdict](#final-verdict)

---

## Engine 1 — Portfolio Intelligence

### 1. Purpose

**Problem solved:** Convert raw on-chain positions into a normalized, canonical portfolio state that all other engines consume.

**Inputs:**
- Algorand address (Turnkey embedded wallet)
- Algorand Indexer (account balances, ASA holdings, transaction history)
- Folks Finance API (lending supply/borrow positions)
- Tinyman API (LP positions)
- Pact API (LP positions)
- CoinGecko / Gora Oracle (asset prices)

**Outputs:**
- `PortfolioSnapshot` record — canonical state consumed by all engines
- Total value (USD), allocation breakdown (asset/category/protocol)
- Direct, indirect, and "true" exposure (LP decomposition)
- PnL (realized, unrealized, yield earned, fees paid)
- Performance metrics (7D, 30D, 90D, all-time)
- Health Score (0–100)
- Emits `PortfolioSnapshotCreated` event to trigger Engines 2 and 4

**Position in architecture:** Entry point. All engines are downstream of Engine 1.

---

### 2. How It Works

**Step-by-step execution:**

1. `PortfolioService.runScan()` is called (via API or scheduled trigger)
2. `01-data-fetcher.ts`: Parallel fetch from Algorand Indexer, Folks, Tinyman, Pact APIs
3. Asset ID collection across all positions for unified price fetch
4. `PriceService.getPricesForAssets()`: Batch price fetch from CoinGecko
5. Normalization: raw API responses → canonical `AssetHolding` and `ProtocolPosition` types
6. `02-lp-decomposer.ts`: Decomposes LP tokens into underlying asset values to calculate true exposure (e.g., "ALGO-USDC LP" → 50% ALGO + 50% USDC)
7. `04-allocation-analyzer.ts`: Computes HHI (Herfindahl-Hirschman Index), category allocations, protocol allocations
8. `05-pnl-calculator.ts`: Realized PnL from transaction history, unrealized from current prices vs. cost basis
9. Historical performance comparison via `SnapshotRepository`
10. `06-health-scorer.ts`: Weighted composite health score from 5 components
11. `07-snapshot-writer.ts`: Writes `PortfolioSnapshot` to PostgreSQL, emits event

**Health Score components (verified in code):**

| Component | Max | Algorithm |
|-----------|-----|-----------|
| Diversification | 30 | `30 × (1 - HHI/10000)` |
| Liquidity | 20 | Linear scale: (stablecoin% + native%) / 40 × 20 |
| Yield Quality | 20 | Weighted avg APY across supply/LP positions, capped at 20% APY = full score |
| Sustainability | 15 | `folks_allocation% / 100 × 15` — Folks Finance proxy only |
| Protocol Health | 15 | % in known protocols (Folks+Tinyman+Pact+native) / 100 × 15 |

---

### 3. Implementation Audit

**API completeness:** Routes verified: `GET /portfolio/overview`, `/allocation`, `/exposure`, `/performance`, `/health`, `/snapshots`. All routes exist and are connected to real service logic.

**Data pipeline:** 10-step pipeline is fully implemented. No stubs detected in the core analysis path.

**PnL calculation:** Implemented. Cost basis tracking exists via `CostBasisRepository`. Impermanent loss calculation is present in LP decomposition.

**Edge cases:**
- Partial scan handling: If Indexer fails but protocol APIs succeed, `isPartial = true` flag is set — correct behavior.
- If ALL adapters fail, scan aborts rather than writing an empty snapshot — correct.
- Zero-value portfolios handled gracefully.

**Critical gaps found:**
- `06-health-scorer.ts` line 76: Sustainability score is 100% proxied to Folks Finance allocation. A user with 100% Pact or Tinyman positions gets 0 sustainability score even if those are audited protocols. This is architecturally incorrect.
- `05-pnl-calculator.ts`: Realized PnL calculation depends on `rawData.transactions` from the Indexer. At MVP scale, the Indexer returns a limited transaction window — historical cost basis for transactions older than the fetch window will be incorrect/missing.
- Performance comparison (`return7dPercent` etc.) compares current snapshot to historical snapshots but does NOT anchor to a fixed start-of-period value — it uses the most recent historical snapshot as the reference point, making 7D returns unreliable if scans are infrequent.
- No tests exist (confirmed in audit_report.md).

**Security:** API routes require JWT authentication. Portfolio data is scoped to `userId` in all queries — no cross-user data leakage risk visible in code.

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 8/10 | Clean event-driven pipeline, canonical state pattern is correct |
| Code Quality | 7/10 | Well-structured, Decimal precision throughout, but Sustainability component is logically flawed |
| Reliability | 6/10 | Partial scan protection good; PnL and performance metrics degrade without dense historical data |
| Scalability | 6/10 | Single-user scan is efficient; no batch/parallel user scanning capability |
| Maintainability | 8/10 | Clean module separation, step-numbered pipeline files, good logging |

---

### 4. Effectiveness Analysis

**Will it work?** Yes, for a new user's first scan. For ongoing use it depends on scan frequency — performance metrics require at minimum weekly scans.

**Financially sound?** The HHI-based diversification score is academically valid. LP decomposition correctly surfaces hidden ALGO exposure. Health score weighting is reasonable but opinionated (30 pts on diversification vs 15 on yield quality).

**Flaws:**
- Sustainability = "% in Folks Finance" is a proxy masquerading as analysis. It penalizes users who legitimately prefer Tinyman or Pact, which are also audited.
- Yield Quality gives full score at 20% APY — in Algorand DeFi in a bear market, even 6–8% is exceptional. The benchmark is miscalibrated.
- PnL is computed only from on-chain transactions visible to the Indexer. Yield earned from Folks Finance rewards is estimated, not precisely tracked.

**Strengths:**
- LP decomposition showing "true" vs. "direct" vs. "indirect" exposure is genuinely valuable and uncommon in portfolio tools.
- Event-driven architecture means downstream engines trigger automatically with no coupling.
- HHI-based concentration scoring is a legitimate financial metric, not just a heuristic.

**Weaknesses:**
- No Monte Carlo portfolio simulation in Engine 1 (deferred to Engine 2).
- No real-time price alerts — all analysis is point-in-time.
- Scan must be manually triggered or scheduled — there is no websocket-based live update.

---

### 5. State-of-the-Art Analysis

**Classification: Good**

Rationale: LP decomposition and HHI-based analysis are genuinely more sophisticated than most DeFi portfolio trackers (DeBank, Zapper, etc.). However, the health score is a static weighted composite, not a learned model. True SOTA systems (e.g., Gauntlet, Risk Harbor) use dynamic simulation-based risk scoring. The lack of real-time updates and position-level PnL precision keeps this in "Good" rather than "Advanced" territory.

---

### 6. Improvements

**Quick Wins:**
- Fix Sustainability component: weight across ALL audited protocols, not just Folks (30-min fix, eliminates scoring bias)
- Calibrate Yield Quality benchmark: 10% APY = full score for Algorand context (15-min fix)

**Medium Improvements:**
- Add position-level PnL tracking (not just portfolio total) — requires cost basis per ASA per position
- Add WebSocket or SSE endpoint for live portfolio updates when Algorand events arrive

**Major Upgrades:**
- Historical performance with TWRR (Time-Weighted Rate of Return) rather than simple snapshot comparison
- Real-time Algorand Indexer streaming to trigger incremental portfolio updates

---

## Engine 2 — Risk Intelligence

### 1. Purpose

**Problem solved:** Measure, classify, and alert on all material portfolio risks.

**Inputs:** `PortfolioSnapshot` (from Engine 1 event), historical snapshots (up to 90)

**Outputs:**
- Composite risk score (0–100) + risk level (LOW/MEDIUM/HIGH/CRITICAL)
- 5 component scores: market, liquidation, concentration, protocol, liquidity
- VaR, CVaR, Sortino ratio, max drawdown, Calmar ratio, realized volatility
- Liquidation proximity alerts for Folks Finance positions
- Active alert records in DB

**Position in architecture:** Triggered by `PortfolioSnapshotCreated`. Emits `RiskAnalysisCompleted` which triggers Engine 3.

---

### 2. How It Works

**Step-by-step execution:**

1. `initRiskEngine()` registers listener for `PortfolioSnapshotCreated`
2. Load current snapshot + up to 90 historical snapshots
3. `extractReturnSeries()`: Compute period-over-period returns from snapshot values
4. 5 analyzers run in parallel via `Promise.allSettled()`:
   - `analyzeMarketRisk()`: CVaR(95%), VaR(95%), Sortino, max drawdown, Calmar, vol 7D/30D
   - `analyzeLiquidationRisk()`: Health factor from Folks Finance borrow positions
   - `analyzeConcentrationRisk()`: HHI for assets and protocols
   - `analyzeProtocolRisk()`: Weighted protocol safety scores from registry
   - `analyzeLiquidityRisk()`: Exit impact estimation per position
5. `computeCompositeRiskScore()`: Weighted blend of 5 component scores
6. `evaluateAlertConditions()`: Generate/update alerts based on thresholds
7. Write `RiskSnapshot` + emit `RiskAnalysisCompleted`

**Market risk algorithms (verified):**
- CVaR: Historical simulation at 95% confidence — correctly averages tail losses below VaR threshold
- Max Drawdown: Peak-to-trough over full history — correct implementation
- Sortino Ratio: Target return = 0, downside deviation in denominator — correct
- Calmar Ratio: Annualized CAGR / MDD — correct, uses `n/365` annualization

**Critical flaw in covariance matrix input for strategy engine (verified):**
The return series used is the PORTFOLIO-level return time series, not per-asset returns. This is a fundamental limitation — the market risk engine cannot compute asset-level correlations because it only tracks aggregate portfolio value. This degrades the HRP optimizer in Engine 3 significantly (see below).

---

### 3. Implementation Audit

**API completeness:** Routes: `/risk/score`, `/risk/market`, `/risk/liquidation`, `/risk/concentration`, `/risk/alerts`, `/risk/history`. All present and connected.

**Algorithm correctness:**
- CVaR calculation requires minimum 20 snapshots — enforced via `MIN_SNAPSHOTS_FOR_CVAR = 20`
- Returns insufficient history flag when data is sparse — correct defensive behavior
- `analyzeLiquidationRisk()` uses Folks Finance health factor — appropriate

**Gaps found:**
- The `analyzeProtocolRisk()` function uses hardcoded static scores from `PROTOCOL_REGISTRY` (e.g., `folks-finance: 75, tinyman: 70, pact: 60`). These scores are not dynamically updated from TVL, audit status, or exploit history — they are hardcoded constants.
- Stress testing (ALGO -40%, stablecoin depeg scenarios) is documented in flow.md but **not implemented anywhere in the codebase**. There is no stress test endpoint or logic.
- `analyzeMarketRisk()` operates on PORTFOLIO-level returns, not per-asset returns. This means VaR is for the whole portfolio, not individual assets.
- Liquidity exit impact estimation is heuristic, not market-depth based.

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 8/10 | Event-driven trigger from Engine 1, clean parallel analyzer pattern |
| Code Quality | 7/10 | Well-implemented financial metrics, but static protocol scores are a weakness |
| Reliability | 7/10 | Graceful degradation with insufficient history, all analyzers fault-tolerant |
| Scalability | 6/10 | 90-snapshot window means metrics mature slowly for new users |
| Maintainability | 7/10 | Good module separation; protocol registry is a maintenance burden |

---

### 4. Effectiveness Analysis

**Will it work?** Yes for portfolio-level risk. Will not catch asset-level correlated risk or provide meaningful CVaR for new users (first 20 scans).

**Financially sound?** CVaR, Sortino, and Calmar are academically rigorous choices. HHI for concentration is correct. Liquidation health factor monitoring is critical for lending users.

**Missing signals:**
- Smart contract exploit risk (not modeled — no on-chain monitoring)
- Impermanent loss rate-of-change as a risk signal
- Correlation between ALGO and LP pool assets (Tinyman pools are mostly ALGO-paired)
- Counterparty risk (all Algorand protocols are non-custodial, reduces this concern)
- Oracle manipulation risk (Gora is not live — CoinGecko prices used)

**Failure modes:**
- If Algorand Indexer is slow, historical return series will have gaps, degrading CVaR accuracy
- Static protocol scores will become wrong after protocol exploits or TVL crashes

---

### 5. State-of-the-Art Analysis

**Classification: Good**

Rationale: CVaR, Sortino, and Calmar are professional-grade metrics. The parallel analyzer architecture is clean. However: (1) no stress testing despite it being in the design, (2) no dynamic protocol risk scoring, (3) portfolio-level-only risk (no per-asset correlation matrix), and (4) no regime detection (bull/bear/sideways market). SOTA risk systems (Gauntlet, Chaos Labs) use agent-based simulation and real-time market depth. This is substantially more sophisticated than most DeFi dashboards, but short of institutional-grade.

---

### 6. Improvements

**Quick Wins:**
- Implement the stress test endpoint (was documented but not built) — 1–2 days of work, very high user value
- Make protocol risk scores dynamic: fetch TVL from protocol APIs and adjust score based on 7D TVL change

**Medium Improvements:**
- Add per-asset return tracking (requires storing price history per ASA, not just portfolio total)
- Add correlation matrix to risk output for multi-asset portfolios

**Major Upgrades:**
- On-chain monitoring via Algorand Indexer event streaming for real-time liquidation alerts
- Regime detection model (moving average crossover or volatility-based) to contextualize risk levels

---

## Engine 3 — Strategy & Optimization

### 1. Purpose

**Problem solved:** Generate explainable, data-driven portfolio rebalancing strategies aligned to user goals.

**Inputs:** Portfolio snapshot (Engine 1) + Risk snapshot (Engine 2) + user goal profile (Engine 5) + historical snapshots

**Outputs:**
- Target allocation weights per asset
- Rebalancing action list (specific assets to buy/sell with delta%)
- Strategy explanation with model metadata
- `StrategySnapshot` record

**Position in architecture:** Triggered by `RiskAnalysisCompleted`. Emits `StrategyPlanCreated` (but listener for this event is not wired anywhere — gap confirmed from audit_report.md).

---

### 2. How It Works

**Step-by-step execution:**

1. `initStrategyEngine()` registers listener for `RiskAnalysisCompleted`
2. Load portfolio snapshot, risk snapshot, user goal profile, 90 historical snapshots
3. **Model selection** (data-driven, verified in code):
   - `< 14 snapshots`: EQUAL_WEIGHT (insufficient history)
   - `14–29 snapshots`: INVERSE_VOL (minimal history)
   - `>= 30 snapshots`: HRP_CVAR (Hierarchical Risk Parity + Mean-CVaR blend)
4. **HRP_CVAR path (>= 30 data points):**
   - `extractReturnSeries()` → portfolio returns array
   - **Critical: per-asset return matrix is SIMULATED via random perturbation** (`Math.random() - 0.5 * 0.001`)
   - `ledoitWolfShrinkage()`: Shrinks sample covariance matrix toward scaled identity
   - `covToCorr()`: Convert to correlation matrix
   - `hrpOptimize()`: Lopez de Prado (2016) HRP — distance matrix → single-linkage clustering → recursive bisection
   - `meanCvarOptimize()`: Gradient descent on probability simplex maximizing Return/CVaR ratio
   - **50/50 blend** of HRP and Mean-CVaR weights
5. `applyMomentumOverlay()`: Applied but momentum signals are hardcoded to `'0'` — no real momentum data
6. `enforceGoalConstraints()`: Caps/floors allocations based on goal profile
7. `generateRebalancingActions()`: Compute delta from current to target, threshold-filtered
8. `explainStrategy()`: Generate human-readable model explanation
9. Write `StrategySnapshot` + emit `StrategyPlanCreated`

---

### 3. Implementation Audit

**Algorithm correctness:**
- HRP implementation is mathematically correct: verified distance matrix, single-linkage clustering, recursive bisection with inverse-variance allocation. This matches Lopez de Prado (2016).
- Ledoit-Wolf shrinkage is correctly implemented using the scaled identity target and oracle formula for shrinkage intensity.
- Mean-CVaR optimizer: gradient ascent on probability simplex, Duchi et al. simplex projection — correct.

**Critical flaw (verified in code, line 136):**
```typescript
const assetReturns: number[][] = symbols.map(
  () => returns.map((r) => r + (Math.random() - 0.5) * 0.001),
);
```
The per-asset return matrix is fabricated by taking the portfolio-level return series and adding tiny random noise (±0.0005). This means ALL assets have essentially identical return series with microscopic perturbations. The resulting covariance matrix is nearly singular, and HRP clustering produces essentially arbitrary groupings. The 50/50 HRP+CVaR blend is being computed on fake data. This is the most severe algorithmic flaw in the entire codebase.

**Impact:** The HRP optimizer outputs weights that are close to equal-weight for all assets because: (a) the perturbations are too small to create meaningful distance differences, and (b) single-linkage clustering on near-identical series groups assets pseudo-randomly. The strategy will appear mathematically rigorous but is effectively equal-weight with noise.

**Additional gaps:**
- `applyMomentumOverlay()` receives `assetReturns14d[sym] = '0'` for all symbols — momentum overlay has no effect whatsoever.
- `StrategyPlanCreated` event is emitted but no listener is registered in any initializaiton file — the event is dead.
- Black-Litterman model mentioned in context.md is deferred and not in the code at all.
- No `POST /strategy/rebalance` endpoint that calls the execution engine — strategy generation and execution are not connected.

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 7/10 | Good event chain, model selection ladder is a smart design |
| Code Quality | 4/10 | Mathematically correct implementations used on fabricated input data — the algorithms are correct but their application is broken |
| Reliability | 5/10 | Will always produce an output but the output is not meaningfully risk-parity aligned |
| Scalability | 7/10 | Stateless computation, scales fine |
| Maintainability | 6/10 | Complex optimizer code is well-commented, but the per-asset return fabrication is a hidden flaw |

---

### 4. Effectiveness Analysis

**Will it work as intended?** No. The HRP and CVaR optimizers are correctly implemented but fed synthetic input data. The resulting allocation is not genuinely risk-parity optimized.

**Financially sound?** The model selection ladder (equal-weight → inverse-vol → HRP+CVaR) is sound in principle and is used by practitioners. The issue is entirely in the data pipeline, not the algorithms.

**The single most important fix in the entire codebase:** Replace per-asset return fabrication (line 136) with actual per-asset price history. This requires Engine 1 to store per-asset price snapshots or the strategy engine to pull 30–90 days of historical prices from CoinGecko for each detected asset.

**Strengths:**
- Legitimate academic references: Lopez de Prado (2016), Rockafellar & Uryasev (2000), Ledoit & Wolf (2004)
- Graceful degradation to simpler models with insufficient data
- Goal constraints enforced post-optimization (a correct approach)
- Strategy explanation generation is present and useful

**Weaknesses:**
- Per-asset return series is synthetic
- Momentum overlay is a no-op
- Event chain is broken (StrategyPlanCreated not consumed)
- No connection to execution engine

---

### 5. State-of-the-Art Analysis

**Classification: Basic (despite Advanced algorithms)**

Rationale: The algorithms chosen (HRP, Ledoit-Wolf, Mean-CVaR) are genuinely state-of-the-art for portfolio optimization. If the data pipeline was correct, this would rate "Advanced." However, the synthetic per-asset returns reduce the effective optimization to noise-perturbed equal-weight. The academic sophistication is present in the code but not realized in the outputs. This is worse than a well-calibrated simple rule-based system.

---

### 6. Improvements

**Quick Wins (high impact):**
- Fix per-asset return fabrication: pull 30D price history from CoinGecko for each asset symbol when running HRP. This is 20–30 lines of code and transforms the engine from broken to genuinely functional. Impact: transforms Engine 3 from Basic to Advanced.
- Wire StrategyPlanCreated event to trigger engine 6 planning flow (closes the execution loop)

**Medium Improvements:**
- Implement momentum signals: compute 14D price return per asset from CoinGecko prices
- Add `POST /strategy/execute` that automatically creates an execution plan from the strategy

**Major Upgrades:**
- Black-Litterman model integration: allow user views to be expressed as expected return adjustments
- Risk parity approach with actual leverage/de-leverage for concentrated positions

---

## Engine 4 — Yield & Opportunity

### 1. Purpose

**Problem solved:** Discover, evaluate, and rank all yield opportunities across Algorand DeFi protocols, personalized to the user's risk profile.

**Inputs:** Portfolio snapshot (Engine 1), user goal profile (Engine 5), Folks/Tinyman/Pact pool APIs

**Outputs:**
- Ranked opportunity list (TOPSIS score + portfolio fit score + final score)
- Idle capital signals (assets earning below baseline APY)
- `YieldOpportunitySnapshot` records

**Position in architecture:** Triggered by `PortfolioSnapshotCreated`. Runs in parallel with Engine 2.

---

### 2. How It Works

**Step-by-step execution:**

1. Parallel fetch from Folks Finance, Tinyman, and Pact adapters
2. Build `RawOpportunity` list for each lending pool and LP pool
3. APY normalization: APR → APY conversion, organic vs. incentivized APY separation
4. Sustainability classification: categorizes APY source (fee-based vs. emission-based)
5. **TOPSIS ranking** — goal-profile-weighted multi-criteria scoring:
   - Criteria: netApy, protocolSafetyScore, yieldConsistencyScore, liquidityScore, ilRiskScore
   - Weight vectors vary by goal profile (CONSERVATIVE heavily weights safety; AGGRESSIVE weights APY)
   - Standard TOPSIS: normalize → weight → find ideal best/worst → Euclidean distance → closeness coefficient
6. Portfolio fit scoring: boost opportunities in assets the user already holds
7. Final score = blend of TOPSIS closeness coefficient and portfolio fit score
8. Idle capital detection: holdings earning < 2% APY flagged
9. Write results + emit `YieldOpportunitiesUpdated`

**TOPSIS implementation (verified):** Mathematically correct. Euclidean distance to ideal best/worst, closeness coefficient, benefit vs. cost criteria correctly identified (`ilRiskScore` is a cost criterion).

---

### 3. Implementation Audit

**API completeness:** Routes exist for `/yield/opportunities`, `/yield/rankings`, `/yield/idle`, `/yield/history`. All connected.

**Algorithm correctness:** TOPSIS is correctly implemented. Sustainability classification is reasonable. Portfolio fit scoring adds useful personalization.

**Gaps found:**
- `yieldConsistencyScore` is hardcoded: `70` for Folks Finance, `60` for Tinyman and Pact — these are never dynamically computed from historical APY variance. A protocol with wildly varying APY will show the same consistency score as a stable one.
- `tvlChange7dPercent` is always `null` and `tvlTrend` is always `'STABLE'` for all opportunities. TVL trend data is never fetched or computed.
- IL risk score computation (`computeIlRiskScore`) uses only asset categories (e.g., STABLE+VOLATILE = medium IL risk) — not actual price correlation, which is the real IL driver.
- `BASELINE_APY_PERCENT = '2.0'` — reasonable for USD savings rate; aggressive for DeFi context where 2% is near-zero yield.
- No staking opportunities (only lending + LP).
- For Tinyman LP yield: fee APY is estimated from `totalFeeShare × 365` — this assumes constant fee volume, which is incorrect. Volume is highly seasonal.

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 8/10 | Clean parallel fetch, TOPSIS is a legitimate MCDM algorithm |
| Code Quality | 7/10 | Well-structured, but yield consistency and TVL trend data are placeholder values |
| Reliability | 7/10 | Falls back gracefully if adapters fail |
| Scalability | 7/10 | Could handle many more protocols with minimal changes |
| Maintainability | 7/10 | Good separation, easy to add new protocols |

---

### 4. Effectiveness Analysis

**Will it work?** Yes — users will receive ranked opportunity lists with real APY data from live protocol APIs. TOPSIS scoring adds meaningful personalization. Idle capital detection is immediately actionable.

**Weaknesses:**
- Yield consistency scores are always constant — removes a key differentiator between stable and volatile yield sources
- TVL trend always showing STABLE means users cannot detect draining liquidity pools
- LP APY extrapolation from single fee rate assumes constant volume

**Strengths:**
- TOPSIS is a sophisticated MCDM algorithm rarely seen in DeFi yield aggregators
- Goal-profile-specific weight vectors provide genuine personalization
- Idle capital detection is a high-value, immediately actionable feature

---

### 5. State-of-the-Art Analysis

**Classification: Advanced**

Rationale: TOPSIS with goal-profile-specific weights is above the level of most DeFi yield aggregators, which typically just sort by APY. The sustainability classification, IL risk scoring, and portfolio fit scoring together form a multi-dimensional ranking system. What's missing for SOTA: dynamic yield consistency from historical APY data, TVL trend analysis, and predictive yield modeling. Yield protocol aggregators like Beefy Finance, Yearn Finance, and Pendle Finance offer more sophisticated yield analysis in their niches, but within the Algorand context this is the best-in-class approach.

---

### 6. Improvements

**Quick Wins:**
- Compute `yieldConsistencyScore` from historical APY variance: query last 30 `YieldOpportunitySnapshot` records for each pool and compute coefficient of variation — 2–3 hours of work, meaningful differentiation
- Pull and store `tvlChange7dPercent` from adapters if they expose historical TVL data

**Medium Improvements:**
- Add real-time IL loss rate monitoring for existing LP positions
- Add projected yield calculation: "If you supply $X USDC to Folks, expected annual yield = $Y"

**Major Upgrades:**
- Yield prediction model: use historical APY time series to forecast 7D/30D expected APY (simple ARIMA or exponential smoothing)
- Integrate Pact's analytics API for historical pool performance data

---

## Engine 5 — User Intelligence

### 1. Purpose

**Problem solved:** Build and maintain a dynamic investor profile that personalizes all other engine outputs.

**Inputs:** Onboarding questionnaire answers, behavioral signals from user actions (accept/ignore recommendations, engagement patterns, goal changes)

**Outputs:**
- `InvestorPersona` (CONSERVATIVE / BALANCED / GROWTH / AGGRESSIVE / YIELD_SEEKER)
- `GoalProfile` (CONSERVATIVE / MODERATE / AGGRESSIVE) — consumed by Engines 2, 3, 4, 6
- Behavioral drift score (tracks divergence between stated and observed preferences)
- Signals: `ONBOARDING_COMPLETED`, `GOAL_PROFILE_CHANGED`, `DRIFT_THRESHOLD_EXCEEDED`

**Position in architecture:** Provides personalization context to all engines. Not triggered by events — updated on user actions.

---

### 2. How It Works

**Onboarding path:**
1. User completes questionnaire → `processOnboarding()`
2. `computeRawScore()`: Weighted scoring of questionnaire answers (risk appetite, time horizon, loss tolerance, goals)
3. `normalizeScore()`: Map raw score to 0–100
4. `classifyPersona()`: Threshold classification:
   - `< 20` → CONSERVATIVE
   - `20–39` → BALANCED
   - `40–59` → GROWTH
   - `60–79` → AGGRESSIVE
   - `>= 80` → YIELD_SEEKER
5. `personaToGoalProfile()`: Maps persona to 3-level GoalProfile for Engine 3/4 consumption
6. Save `UserProfile` + emit `OnboardingCompleted`

**Behavioral drift path:**
1. Events across all engines call `UserIntelligenceService.recordSignal()`
2. Signal type mapped to weight in `SIGNAL_WEIGHTS` (e.g., `IGNORED_CRITICAL_ALERT: 10`, `IGNORES_YIELD_SUGGESTIONS: -8`)
3. Sum of recent 30D signals = `behavioralDriftScore`
4. If `|driftScore| >= 25`: emit `DriftThresholdExceeded` event

---

### 3. Implementation Audit

**Critical gap:** The `intelligence` module directory contains only a `.gitkeep` file — it is empty. Engine 5 exists only in `user/user-intelligence.service.ts`. The service has:
- Onboarding questionnaire processing: implemented
- Manual goal profile update: implemented
- Behavioral signal recording: implemented
- Drift score computation: implemented (threshold-based, signal-weighted)

**What is NOT implemented:**
- No listener registered to actually call `recordSignal()` when users act on recommendations. The signal recording API exists but is never called by other engines — behavioral signals accumulate only if explicitly POSTed by the frontend (not automatically by the backend).
- No automatic persona re-classification based on accumulated drift (drift score is computed and stored, but there's no code that re-classifies the persona when drift exceeds 25).
- Copilot `GOAL_CHANGE` intent classification and routing exists, but it only tells the user to "change in settings" — it doesn't call `updateGoalProfile()` directly.
- No behavioral analysis from actual portfolio decisions (e.g., "user always ignores AGGRESSIVE rebalancing suggestions" is not automatically recorded).

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 5/10 | Framework is correct but behavioral loop is broken — signals are never auto-generated |
| Code Quality | 7/10 | Clean code, correct drift algorithm |
| Reliability | 7/10 | What's implemented works; the problem is what's not implemented |
| Scalability | 7/10 | Simple enough to scale |
| Maintainability | 6/10 | Signal weights are hardcoded magic numbers |

---

### 4. Effectiveness Analysis

**Will it work?** Partially. Onboarding questionnaire → persona classification is fully functional. Dynamic behavioral learning is not functional because the signal recording is never triggered automatically.

**The behavioral adaptation loop is broken:** The design intent (signals from user behavior → drift score → persona update) requires that other engines or the frontend send behavioral signals. The backend never auto-generates these signals from execution outcomes or recommendation interactions.

**The persona classification thresholds are arbitrary:** A user who scores 39 vs. 40 gets BALANCED vs. GROWTH with no gradation. This cliff-edge classification is a known limitation of threshold-based persona systems.

---

### 5. State-of-the-Art Analysis

**Classification: Basic**

Rationale: Questionnaire-based risk profiling is the most basic form of user intelligence — every robo-advisor has done this since 2010. The behavioral drift framework shows intent toward something more advanced, but without automatic signal generation it is inert. True SOTA user intelligence (Betterment, Wealthfront's behavioral engine, or the academic literature on preference learning) uses revealed preferences from actual portfolio decisions, not just stated answers to a questionnaire. The system as implemented is better than no profiling but is not differentiated.

---

### 6. Improvements

**Quick Wins:**
- Auto-generate `ACTED_ON_REBALANCE` signal in `execution.service.ts` when `submitExecution()` is called successfully — 10-line change, activates the drift loop
- Auto-generate `IGNORED_CRITICAL_ALERT` when a CRITICAL risk alert is created but not acted upon after 7 days

**Medium Improvements:**
- Implement automatic persona reclassification when `|driftScore| >= 25`
- Copilot `GOAL_CHANGE` intent should call `updateGoalProfile()` directly when user explicitly states a new persona

**Major Upgrades:**
- Move from threshold classification to a continuous scoring model with Bayesian updating
- Track recommendation acceptance rate per intent category as an observable preference signal

---

## Engine 6 — Autonomous Execution + Copilot

### 1. Purpose

**Problem solved:** (a) Execute approved portfolio actions through the full orchestration pipeline onto the Algorand blockchain. (b) Provide a natural language interface over all engines.

This section covers both the Execution Engine (Engine 6) and the Copilot Layer, which is architecturally built on top of all engines.

**Inputs:**
- User-approved actions (from strategy or direct intent)
- Policy rules (risk limits, daily volume caps, protocol allowlist)
- User goal profile (for policy gate)
- Copilot: user message + cross-engine context (all 5 engines)

**Outputs:**
- Execution: `ExecutionRecord`, `ExecutionTransaction` records, on-chain Algorand transaction IDs
- Copilot: Structured JSON response (answer, dataPoints, confidence, disclaimer, followUpQuestions)

---

### 2. How It Works

**Execution path:**

1. `planExecution()`: Build POA → evaluate policy → simulate → save `ExecutionRecord` (status: PENDING/BLOCKED/AWAITING_APPROVAL)
2. `submitExecution()`: Load record → check status → **MVP STUB**: write mock transaction IDs, mark CONFIRMED
3. Policy Engine gates:
   - Risk score vs. profile cap (CONSERVATIVE: 35, MODERATE: 60, AGGRESSIVE: 85)
   - Daily volume limit (CONSERVATIVE: $5K, MODERATE: $25K, AGGRESSIVE: $100K)
   - Per-step value vs. single-txn limit
   - Protocol allowlist check
   - Blocked action types (LP_ADD blocked for CONSERVATIVE)
4. POA Builder: abstract actions → ordered step graph with dependency resolution and atomic group assignment
5. Simulation gate: **MVP STUB** — always returns `passed: true`

**Copilot path:**

1. `classifyIntent()`: Regex-based keyword matching → 6 intent categories
2. `assembleCopilotContext()`: `Promise.allSettled()` across all 5 engine data sources
3. `buildSystemPrompt()`: Persona + guardrails + output schema + intent instructions + context JSON
4. `completeLLM()`: OpenAI gpt-4.1-mini (primary) → Gemini 2.5-flash (fallback on 429/5xx)
5. `parseCopilotResponse()`: Validate JSON response against expected schema
6. Persist to `CopilotQueryLog` + session management via Redis

---

### 3. Implementation Audit

**Execution engine — critical gaps:**
- `submitExecution()` lines 186–197: Writes `mock-txn-{uuid}` strings as transaction IDs and hardcodes `confirmedRound: 48293710 + i`. No real signing, no real broadcast. This is correctly labeled as "MVP stub" but is a complete placeholder.
- `simulation.gate.ts`: Always returns `passed: true` — no validation whatsoever.
- `poa.builder.ts` line 106: `fromAmountMicro: '0'` for all steps — amounts are never resolved from actual balances.
- All 3 builder files (haystack, folks, tinyman) return mock transaction ID strings — no real Algorand transactions are constructed.
- KYC gate in policy engine: The design requires checking KYC status before execution — this check does NOT exist in `policy.engine.ts`.
- The `StrategyPlanCreated` event listener is never registered — the event chain from strategy → execution is broken.

**Copilot — what works:**
- Intent classification: Regex-based, 5 intent types. Works for common queries. Fails for ambiguous multi-topic queries.
- Context assembly: `Promise.allSettled()` with graceful null handling — correct resilience pattern.
- Dual-provider LLM with fallback: correctly implemented. Fallback triggered on 429 or 5xx.
- System prompt: Well-structured with guardrails, output schema, and intent-specific instructions.
- Session management: Redis-backed conversation history — correct.
- JSON mode enabled for both OpenAI and Gemini — structured output enforced.

**Copilot — gaps:**
- Intent classifier is pure regex — no ML classification. "Should I rebalance or is my risk too high?" routes to STRATEGY_QUERY but misses the RISK_QUERY dimension.
- No streaming response — all responses are blocking HTTP calls with 1500-token cap.
- Context includes full JSON of all engine data — for large portfolios this will approach token limits quickly.
- Copilot cannot actually trigger execution — it tells users to act manually. The design intent of Copilot routing to Engine 6 is not implemented.

**Ratings:**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Architecture | 7/10 | Policy engine design is excellent; execution pipeline is correct in structure |
| Code Quality | 5/10 | Policy engine and copilot are well-implemented; execution is a complete stub |
| Reliability | 4/10 | Everything after policy check is a stub — zero production reliability |
| Scalability | 6/10 | Copilot scales well; execution would need careful async design |
| Maintainability | 7/10 | Clean module structure; replacing stubs with real implementations is clear |

---

### 4. Effectiveness Analysis

**Execution engine:** Will not execute real transactions. From a user perspective, the "execution" currently creates a fake confirmation with mock transaction IDs. This is clearly labeled in code as MVP stub.

**Policy engine:** The policy engine logic is genuinely excellent and production-ready. Risk cap by profile, daily volume limits, per-step value caps, protocol allowlist, and action type blocking are all correct guardrails for a real execution system.

**Copilot:** Will work as intended once LLM API keys are configured (Track A). The intent classification is adequate for the MVP use case. The structured output schema (answer, dataPoints, confidence, disclaimer, followUpQuestions) is well-designed.

**Financial soundness:** The copilot correctly refuses to give specific financial advice (guardrails are in the system prompt). The policy engine limits are reasonable for the profile categories.

---

### 5. State-of-the-Art Analysis

**Execution — Classification: Basic**

The architecture (POA → Policy → Simulate → Sign → Broadcast) matches how production DeFi execution systems work. However, only the Policy Engine is implemented. Everything else is a stub.

**Copilot — Classification: Good**

Dual-provider LLM with fallback, structured JSON output, cross-engine context assembly, Redis session management, and intent routing are all solid engineering choices. The regex intent classifier is the weakest link — GPT-based intent classification would be more robust. Comparing to SOTA financial AI (Bloomberg GPT, Morgan Stanley's AskResearch, Kensho): CrestFlow Copilot is personalized to the user's actual portfolio data, which is more contextually relevant than generic financial AI, but the action execution gap (Copilot cannot actually execute anything) is a significant limitation.

---

### 6. Improvements

**Quick Wins:**
- Track A (external integrations plan): Add LLM API keys → Copilot immediately goes live
- Track F: Wire Turnkey signing and algod broadcast → execution goes live

**Medium Improvements:**
- Implement KYC status check in policy engine (single DB lookup, 10-minute fix)
- Register StrategyPlanCreated listener in execution module init

**Major Upgrades:**
- Agentic copilot: When user says "rebalance my portfolio," Copilot should be able to call `planExecution()` and return a pending execution plan for user approval — this is the key architectural gap between the current system and a true AI financial agent.
- Replace regex intent classifier with a lightweight embedding-based classifier for better multi-intent handling

---

## Cross-Engine Analysis

### Data Flow Between Engines

```
Engine 1 (Portfolio Intelligence)
    |
    |-- PortfolioSnapshotCreated event -->  Engine 2 (Risk Intelligence)
    |                                           |
    |                                           |-- RiskAnalysisCompleted event --> Engine 3 (Strategy)
    |                                                                                    |
    |                                                                                    |-- StrategyPlanCreated event --> [BROKEN: no listener]
    |
    |-- PortfolioSnapshotCreated event -->  Engine 4 (Yield Discovery) [parallel with Engine 2]

Engine 5 (User Intelligence)
    |-- Provides GoalProfile to Engines 2, 3, 4, 6 [via DB query at execution time]
    |-- Receives behavioral signals [BROKEN: never auto-generated by other engines]

Engine 6 (Copilot + Execution)
    |-- Reads all engines via DB queries for context assembly [correct]
    |-- Should trigger Engine 6 execution from Engine 3 output [BROKEN]
    |-- Should trigger Engine 1 refresh after execution [event path exists but execution is stub]
```

### Redundancies

- HHI concentration analysis is computed in both Engine 1 (`06-health-scorer.ts` component 1 = diversification from HHI) and Engine 2 (`analyzeConcentrationRisk()`). Both use the same underlying HHI from the portfolio snapshot. This is acceptable — they serve different purposes (health component vs. risk alert trigger).
- Return series extraction (`extractReturnSeries()`) is imported and called in both Engine 2 and Engine 3 — no real redundancy, same utility function used in different contexts.

### Missing Feedback Loops

1. **Execution → Engine 1 refresh:** `ExecutionConfirmed` event exists and is emitted, but the portfolio refresh is not triggered because execution is a stub. When execution goes live, this loop must be wired.
2. **Engine 5 behavioral signals from engine outputs:** No engine automatically calls `recordSignal()` — the behavioral intelligence loop is broken.
3. **Engine 4 → Engine 3 feed:** Yield engine output is never read by the Strategy engine. Strategies are generated without considering current live yield opportunities. This means the strategy might tell a user to increase ALGO exposure while the yield engine is recommending USDC lending as the best opportunity.
4. **Engine 3 → Engine 6 connection:** `StrategyPlanCreated` event is fired but never consumed. Users must manually copy strategy actions into an execution request — the automation is absent.

### Missing Intelligence

- **Market regime awareness:** No engine knows whether the market is in a bull/bear/sideways regime. All analysis is backward-looking on recent snapshots.
- **Cross-engine signal synthesis:** No engine combines signals from multiple engines. For example: "Risk score is HIGH AND best yield opportunity has LOW sustainability AND user's drift score is +15 (more aggressive)" — no engine synthesizes these into a combined recommendation.
- **Temporal intelligence:** No engine tracks whether recommendations from previous scans were acted upon or not.
- **Alert deduplication:** If Engine 2 fires a liquidation alert, and the user doesn't act, the same alert fires again next scan. There is deduplication logic in `AlertRepository` (update vs. create), but no escalation mechanism.

### Bottlenecks

1. **Engine 1 scan speed:** All analysis is synchronous within the pipeline. A user with many positions across all 3 protocols could face multi-second scan times due to sequential DB writes.
2. **Single scan per refresh:** No incremental update capability. A price change does not trigger a portfolio update — only a full scan does.
3. **Copilot context size:** For a user with large portfolios, the full context JSON (portfolio + risk + strategy + yield) could approach 2,000–4,000 tokens before the user message is added. With 1,500-token max response limit, this creates a budget conflict.

### Single Points of Failure

1. **Algorand Indexer:** If the Indexer is unavailable, Engine 1 fails and the entire event chain stops — Engines 2, 3, 4 all receive no update.
2. **PostgreSQL:** All engine state is in a single database. No read replica or caching layer for frequently read data (like the latest portfolio snapshot).
3. **Redis:** Session management and potentially BullMQ queues depend on Redis. A Redis failure kills the Copilot session state.
4. **CoinGecko:** Price data for all portfolio valuation depends on a single free-tier external API. No price fallback other than Gora Oracle (which is also stubbed).

---

## Final Matrix

| Engine | Working? | Completion % | Architecture | Intelligence | SOTA Level | Major Gaps |
|--------|----------|-------------|--------------|--------------|------------|------------|
| Engine 1 — Portfolio Intelligence | Yes | 85% | 8/10 | Good | Good | Sustainability score flaw, no real-time updates, no per-asset PnL |
| Engine 2 — Risk Intelligence | Yes | 70% | 8/10 | Good | Good | No stress testing, static protocol scores, portfolio-level returns only |
| Engine 3 — Strategy & Optimization | Partially | 60% | 7/10 | Basic | Basic | Fabricated per-asset returns, dead event chain, no execution connection |
| Engine 4 — Yield & Opportunity | Yes | 80% | 8/10 | Advanced | Advanced | Hardcoded consistency scores, no TVL trends, LP APY extrapolation flaw |
| Engine 5 — User Intelligence | Partially | 40% | 5/10 | Basic | Basic | Behavioral signals never auto-generated, no persona auto-update from drift |
| Engine 6 — Execution + Copilot | Partially | 35% | 7/10 | Good (Copilot) | Good (Copilot) / Basic (Execution) | Entire execution pipeline is stub, no real signing/broadcast, dead event chain |

---

## Final Verdict

### 1. Which engine is strongest?

**Engine 4 — Yield & Opportunity.** TOPSIS multi-criteria ranking with goal-profile-specific weights, sustainability classification, and idle capital detection. It is the most complete, most correctly implemented, and most immediately actionable engine. Users get genuine value from it today.

### 2. Which engine is weakest?

**Engine 5 — User Intelligence.** The behavioral adaptation loop — the defining capability that separates a personalized financial AI from a generic portfolio tool — is broken. Signals are never auto-generated, so behavioral drift scores never accumulate from real behavior. The engine is an elaborate questionnaire with no learning.

### 3. Which engine creates the most user value?

**Engine 1 — Portfolio Intelligence** creates the most immediate user value because it is the foundation of the entire system. Without it, no other engine has data. Its LP decomposition (true vs. direct vs. indirect exposure) is a genuinely useful insight that most DeFi portfolio tools do not provide.

### 4. Which engine is least differentiated?

**Engine 5 — User Intelligence** in its current state (questionnaire → 5 personas → 3 goal profiles). Questionnaire-based risk profiling is a commodity feature every robo-advisor has offered since 2010. The behavioral drift framework is differentiated in design but non-functional in implementation.

### 5. Is CrestFlow genuinely intelligent or mostly rule-based?

**Mostly rule-based, with islands of genuine intelligence.**

- Engine 1: Rule-based (HHI thresholds, weighted scoring)
- Engine 2: Hybrid — CVaR, Sortino, and MDD are statistical methods; protocol risk is hardcoded rules
- Engine 3: Nominally intelligent (HRP + CVaR optimization) but effectively rule-based because the per-asset data is fabricated
- Engine 4: Genuine intelligence — TOPSIS MCDM is a legitimate multi-criteria decision algorithm
- Engine 5: Rule-based (questionnaire thresholds)
- Engine 6 Copilot: Genuine intelligence — LLM with cross-engine context is the most intelligent component

The Copilot is the only engine with genuine generative AI. The analytics engines use statistical methods (which are real intelligence) but mostly on heuristic inputs.

### 6. How close is the overall system to state-of-the-art (0–100)?

**Score: 42/100**

Breakdown:
- Analytics depth vs. SOTA (Gauntlet, Risk Harbor, Chaos Labs): 45/100 — correct methods, wrong data inputs
- Personalization vs. SOTA (Betterment, Wealthfront): 20/100 — questionnaire only, no behavioral learning
- Execution vs. SOTA (dYdX, Yearn, DeFi Saver): 10/100 — complete stub
- Copilot vs. SOTA (Bloomberg GPT, Morgan Stanley AskResearch): 55/100 — personalized context is strong; action gap is the differentiator
- Yield optimization vs. SOTA (Beefy, Pendle, Convex): 50/100 — TOPSIS is sophisticated for Algorand context

### 7. Top 10 Improvements That Would Most Increase Competitiveness

**Ranked by impact-to-effort ratio:**

1. **Fix per-asset return series in Engine 3 (2 days, transforms Engine 3 from broken to Advanced)** — Pull 30D daily prices from CoinGecko for each portfolio asset and use them as actual inputs to HRP+CVaR. This is the single highest-leverage fix in the entire codebase.

2. **Add LLM API keys and wire Copilot action execution (Track A + 3 days engineering)** — Copilot goes from a demo to a production product. Allow Copilot to call `planExecution()` and return a user-approvable execution plan.

3. **Implement the stress test endpoint in Engine 2 (2 days)** — Simulate ALGO -40%, stablecoin depeg, and protocol failure scenarios. This is documented in the SRS but not implemented — extremely high user value for risk-aware DeFi users.

4. **Connect Tracks E+F (Algorand SDKs + Turnkey signing, 1 week)** — Engine 6 goes from 0% functional to production-ready. Without this, "Autonomous Execution" is marketing, not product.

5. **Auto-generate behavioral signals in Engine 5 (1 day)** — Wire `recordSignal()` calls into execution confirmation, alert dismissal, and recommendation acceptance. Activates the adaptive personalization loop.

6. **Wire StrategyPlanCreated → Engine 6 (1 hour)** — Register the missing event listener. Closes the automation loop from strategy generation to execution planning.

7. **Dynamic yield consistency scores in Engine 4 (1 day)** — Query historical `YieldOpportunitySnapshot` records to compute APY coefficient of variation per pool. Gives genuine risk differentiation between stable and volatile yield sources.

8. **Fix Engine 1 sustainability score (30 minutes)** — Weight across ALL audited protocols, not just Folks Finance. A trivially simple fix that removes systematic scoring bias.

9. **Implement live momentum signals in Engine 3 (1 day)** — Pull 14D asset price returns and use them as real momentum overlay inputs. Currently all momentum signals are hardcoded to 0.

10. **Add KYC status check to policy engine (30 minutes)** — A single DB lookup for `user.kycStatus` in `policy.engine.ts`. Without this, KYC-gated execution can be bypassed for any user, regardless of KYC status.
