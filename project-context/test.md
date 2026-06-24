# CrestFlow — Test Registry

> Updated as plans are written. Status will change to Pass/Fail/Pending once implementation begins.
> Each test is derived directly from the testing requirements in Plans 01–11.
> Format: newest sections at the top within each group.
>
> Legend: `[ ]` Not started · `[P]` Pass · `[F]` Fail · `[~]` Pending (written, not yet run) · `[-]` Skipped

---

## Coverage Targets

| Module | Target | Current | Notes |
|---|---|---|---|
| Auth (Plan 01) | 90%+ | — | Unit + integration |
| Financial Knowledge Layer (Plan 02) | 85%+ | — | Adapter unit tests |
| Engine 1 — Portfolio Intelligence (Plan 03) | 95%+ | — | Financial computation is critical path |
| Engine 2 — Risk Intelligence (Plan 04) | 95%+ | — | Risk scoring must be deterministic |
| Engine 3 — Strategy Optimization (Plan 05) | 95%+ | — | Optimizer functions are pure |
| Engine 4 — Yield Opportunity (Plan 06) | 90%+ | — | TOPSIS + scoring |
| Engine 5 — User Intelligence (Plan 07) | 85%+ | — | LLM calls mocked |
| Engine 6 — Execution (Plan 08) | 95%+ | — | Highest risk — most coverage |
| Audit Layer (Plan 09) | 90%+ | — | Immutability enforcement |
| KYC & Identity (Plan 10) | 90%+ | — | HMAC verification critical |
| x402 Gateway (Plan 11) | 90%+ | — | Payment verification + replay prevention |
| All modules baseline | 80%+ | — | Minimum acceptable |

---

## Plan 01 — Auth + Turnkey Onboarding

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| AU-01 | `auth.service.test.ts` | Google OAuth token exchange → User record created with email + googleId | [ ] |
| AU-02 | `auth.service.test.ts` | New user → Turnkey sub-org created → Algorand wallet derived | [ ] |
| AU-03 | `auth.service.test.ts` | Returning user → existing record fetched, no duplicate Turnkey sub-org | [ ] |
| AU-04 | `auth.service.test.ts` | JWT issued with correct userId + expiry | [ ] |
| AU-05 | `auth.service.test.ts` | Refresh token → new JWT issued without re-auth | [ ] |
| AU-06 | `turnkey.client.test.ts` | `createSubOrganization` → returns subOrgId + walletId | [ ] |
| AU-07 | `turnkey.client.test.ts` | `deriveAlgorandAddress` → returns valid Algorand base32 address (58 chars) | [ ] |
| AU-08 | `turnkey.client.test.ts` | HD path `m/44'/283'/0'/0/0` used for all derivations | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| AU-I-01 | `auth.integration.test.ts` | Full signup flow: Google OAuth → Turnkey sub-org → wallet → User row in DB | [ ] |
| AU-I-02 | `auth.integration.test.ts` | Duplicate signup (same googleId) → 200, returns existing user | [ ] |
| AU-I-03 | `auth.integration.test.ts` | POST /auth/logout → JWT revoked | [ ] |
| AU-I-04 | `auth.integration.test.ts` | GET /auth/me without JWT → 401 | [ ] |
| AU-I-05 | `auth.integration.test.ts` | GET /auth/me with valid JWT → returns user object | [ ] |

---

## Plan 02 — Financial Knowledge Layer

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| FK-01 | `algorand.adapter.test.ts` | `getAccountInfo` → returns balances + ASA holdings | [ ] |
| FK-02 | `algorand.adapter.test.ts` | `getAccountTransactions` → paginated result with cursor | [ ] |
| FK-03 | `algorand.adapter.test.ts` | `getAssetInfo` → ASA metadata (name, decimals, total) | [ ] |
| FK-04 | `folks.adapter.test.ts` | `getUserPositions` → fToken holdings mapped to underlying asset | [ ] |
| FK-05 | `folks.adapter.test.ts` | `getPoolAPYs` → returns APY per market as DECIMAL string | [ ] |
| FK-06 | `folks.adapter.test.ts` | `getLiquidationThreshold` → borrow / (collateral * liquidation_factor) | [ ] |
| FK-07 | `tinyman.adapter.test.ts` | `getLPPositions` → LP tokens decoded to pair + ownership ratio | [ ] |
| FK-08 | `tinyman.adapter.test.ts` | `getPoolState` → returns reserves A + B + LP supply | [ ] |
| FK-09 | `pact.adapter.test.ts` | `getLPPositions` → Pact pools decoded to underlying pair | [ ] |
| FK-10 | `coingecko.service.test.ts` | `getPrice(assetId)` → returns DECIMAL string, never float | [ ] |
| FK-11 | `coingecko.service.test.ts` | Cache hit: second call within TTL → no HTTP request | [ ] |
| FK-12 | `coingecko.service.test.ts` | Cache miss: expired TTL → HTTP request made | [ ] |
| FK-13 | `asset.registry.test.ts` | ASA ID 31566704 → 'usd-coin' (USDC CoinGecko ID) | [ ] |
| FK-14 | `asset.registry.test.ts` | Unknown ASA ID → null (no crash) | [ ] |
| FK-15 | `redis.cache.test.ts` | `set` then `get` within TTL → value returned | [ ] |
| FK-16 | `redis.cache.test.ts` | `get` after TTL expiry → null | [ ] |

---

## Plan 03 — Engine 1: Portfolio Intelligence

### Unit Tests — Financial Computation (95%+ target)

| ID | File | Test | Status |
|---|---|---|---|
| E1-01 | `il.calculator.test.ts` | IL at price ratio k=1 → 0% (no price movement) | [ ] |
| E1-02 | `il.calculator.test.ts` | IL at price ratio k=2 → `2√2/(1+2)−1` = -5.72% | [ ] |
| E1-03 | `il.calculator.test.ts` | IL at price ratio k=0.5 → symmetric = -5.72% | [ ] |
| E1-04 | `il.calculator.test.ts` | IL at price ratio k=4 → -11.8% (known value) | [ ] |
| E1-05 | `exposure.calculator.test.ts` | LP decomposition: 10% ownership of 1000 ALGO / 500 USDC pool → 100 ALGO + 50 USDC | [ ] |
| E1-06 | `exposure.calculator.test.ts` | True exposure = direct + LP-decomposed (no double-counting) | [ ] |
| E1-07 | `hhi.calculator.test.ts` | Perfect concentration (100% one asset) → HHI = 10,000 | [ ] |
| E1-08 | `hhi.calculator.test.ts` | Perfect diversification (equal weights, N assets) → HHI = 10,000/N | [ ] |
| E1-09 | `health.score.test.ts` | All components at max → health score = 100 | [ ] |
| E1-10 | `health.score.test.ts` | All components at zero → health score = 0 | [ ] |
| E1-11 | `health.score.test.ts` | Weighted composite: components sum to expected value | [ ] |
| E1-12 | `pnl.tracker.test.ts` | Unrealized PnL = (current price − cost basis) × quantity | [ ] |
| E1-13 | `pnl.tracker.test.ts` | Cost basis updates on partial sell (FIFO) | [ ] |
| E1-14 | `cost.basis.test.ts` | Weighted average cost on multiple buys at different prices | [ ] |
| E1-15 | `portfolio.service.test.ts` | Snapshot INSERT-only: update attempt on existing snapshot throws | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E1-I-01 | `portfolio.integration.test.ts` | Full scan: Algorand address → PortfolioSnapshot created in DB | [ ] |
| E1-I-02 | `portfolio.integration.test.ts` | GET /portfolio/overview → 200 with health score + totalValueUsd | [ ] |
| E1-I-03 | `portfolio.integration.test.ts` | POST /portfolio/refresh → triggers scan → new snapshot created | [ ] |
| E1-I-04 | `portfolio.integration.test.ts` | PortfolioSnapshotCreated event emitted after scan | [ ] |
| E1-I-05 | `portfolio.integration.test.ts` | GET /portfolio/snapshots → returns ordered list, newest first | [ ] |

---

## Plan 04 — Engine 2: Risk Intelligence

### Unit Tests (95%+ target)

| ID | File | Test | Status |
|---|---|---|---|
| E2-01 | `cvar.calculator.test.ts` | CVaR with known return series → matches expected 5th percentile average | [ ] |
| E2-02 | `cvar.calculator.test.ts` | All positive returns → CVaR = 0 (no downside tail) | [ ] |
| E2-03 | `cvar.calculator.test.ts` | Single catastrophic return → CVaR equals that return | [ ] |
| E2-04 | `volatility.calculator.test.ts` | 7D annualized vol from known daily returns → expected σ × √252 | [ ] |
| E2-05 | `volatility.calculator.test.ts` | 30D annualized vol: longer window → smoother result | [ ] |
| E2-06 | `sortino.calculator.test.ts` | All positive returns → Sortino = Infinity (no downside) | [ ] |
| E2-07 | `sortino.calculator.test.ts` | Known return series → matches expected Sortino ratio | [ ] |
| E2-08 | `drawdown.calculator.test.ts` | MDD from peak at 100, trough at 60 → -40% | [ ] |
| E2-09 | `drawdown.calculator.test.ts` | Never below start → MDD = 0 | [ ] |
| E2-10 | `liquidation.monitor.test.ts` | Health factor < 1.05 → CRITICAL liquidation alert raised | [ ] |
| E2-11 | `liquidation.monitor.test.ts` | Health factor > 1.5 → no alert | [ ] |
| E2-12 | `protocol.scorer.test.ts` | Protocol with TVL > $10M + audit + 2yr age → high score | [ ] |
| E2-13 | `protocol.scorer.test.ts` | Protocol with known exploit → score 0 (blocklisted) | [ ] |
| E2-14 | `risk.score.test.ts` | All components at max risk → risk score = 100 | [ ] |
| E2-15 | `risk.score.test.ts` | All components at zero risk → risk score = 0 | [ ] |
| E2-16 | `risk.score.test.ts` | Weighted composite: 5 components, sum to expected value | [ ] |
| E2-17 | `alert.service.test.ts` | Alert ACTIVE → RESOLVED transition persists correctly | [ ] |
| E2-18 | `alert.service.test.ts` | Duplicate alert for same condition → no duplicate created | [ ] |
| E2-19 | `alert.service.test.ts` | Alert severity ordering: CRITICAL > HIGH > MEDIUM > LOW | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E2-I-01 | `risk.integration.test.ts` | Full analysis: PortfolioSnapshot → RiskSnapshot created in DB | [ ] |
| E2-I-02 | `risk.integration.test.ts` | GET /risk/score → 200 with riskScore + riskLevel | [ ] |
| E2-I-03 | `risk.integration.test.ts` | GET /risk/alerts → returns active alerts only by default | [ ] |
| E2-I-04 | `risk.integration.test.ts` | PATCH /risk/alerts/:id/dismiss → status = DISMISSED | [ ] |
| E2-I-05 | `risk.integration.test.ts` | RiskAnalysisCompleted event emitted after analysis | [ ] |

---

## Plan 05 — Engine 3: Strategy & Optimization

### Unit Tests (95%+ target)

| ID | File | Test | Status |
|---|---|---|---|
| E3-01 | `ledoit-wolf.test.ts` | Shrinkage reduces off-diagonal noise vs sample covariance | [ ] |
| E3-02 | `ledoit-wolf.test.ts` | Shrunk covariance is positive semi-definite | [ ] |
| E3-03 | `hrp.optimizer.test.ts` | HRP weights sum to 1.0 | [ ] |
| E3-04 | `hrp.optimizer.test.ts` | HRP weights all positive (no short positions) | [ ] |
| E3-05 | `hrp.optimizer.test.ts` | Single asset → weight = 1.0 | [ ] |
| E3-06 | `cvar.optimizer.test.ts` | Mean-CVaR weights sum to 1.0 | [ ] |
| E3-07 | `cvar.optimizer.test.ts` | CVaR optimizer reduces tail risk vs equal weight (known test case) | [ ] |
| E3-08 | `ensemble.optimizer.test.ts` | Ensemble = 50% HRP + 50% CVaR weights | [ ] |
| E3-09 | `inverse.vol.optimizer.test.ts` | Inverse vol weights: higher-vol asset gets lower weight | [ ] |
| E3-10 | `inverse.vol.optimizer.test.ts` | Inverse vol weights sum to 1.0 | [ ] |
| E3-11 | `equal.weight.test.ts` | Equal weight with goal tilt: CONSERVATIVE overweights stablecoins | [ ] |
| E3-12 | `momentum.overlay.test.ts` | Positive 14D momentum → +2% tilt added to weight | [ ] |
| E3-13 | `momentum.overlay.test.ts` | Negative 14D momentum → -2% tilt, weight floored at 0 | [ ] |
| E3-14 | `goal.constraint.test.ts` | CONSERVATIVE profile: volatile allocation capped at 40% | [ ] |
| E3-15 | `goal.constraint.test.ts` | CONSERVATIVE profile: stablecoin floor at 30% | [ ] |
| E3-16 | `goal.constraint.test.ts` | AGGRESSIVE profile: no LP restriction | [ ] |
| E3-17 | `defensive.override.test.ts` | riskScore > CONSERVATIVE cap → 100% stablecoin target | [ ] |
| E3-18 | `rebalance.generator.test.ts` | Drift < threshold → NO_OP action | [ ] |
| E3-19 | `rebalance.generator.test.ts` | Drift > threshold → SELL/BUY actions generated | [ ] |
| E3-20 | `rebalance.generator.test.ts` | Urgency: drift > 2× threshold → HIGH urgency | [ ] |
| E3-21 | `model.selector.test.ts` | 0–13 snapshots → equal-weight model selected | [ ] |
| E3-22 | `model.selector.test.ts` | 14–29 snapshots → inverse-vol model selected | [ ] |
| E3-23 | `model.selector.test.ts` | 30+ snapshots → HRP+CVaR ensemble selected | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E3-I-01 | `strategy.integration.test.ts` | Full strategy run → StrategySnapshot created in DB (INSERT-only) | [ ] |
| E3-I-02 | `strategy.integration.test.ts` | GET /strategy/allocation → latest snapshot weights returned | [ ] |
| E3-I-03 | `strategy.integration.test.ts` | POST /strategy/simulate → does NOT persist to DB | [ ] |
| E3-I-04 | `strategy.integration.test.ts` | PUT /strategy/goal → UserGoalProfile updated, next strategy uses new profile | [ ] |
| E3-I-05 | `strategy.integration.test.ts` | StrategyPlanCreated event emitted after strategy run | [ ] |

---

## Plan 06 — Engine 4: Yield & Opportunity

### Unit Tests (90%+ target)

| ID | File | Test | Status |
|---|---|---|---|
| E4-01 | `apy.normalizer.test.ts` | APR 12% → APY = (1 + 0.12/365)^365 − 1 ≈ 12.747% | [ ] |
| E4-02 | `apy.normalizer.test.ts` | TWAP APY: 3 samples → time-weighted average | [ ] |
| E4-03 | `excess.yield.test.ts` | Yield = Folks USDC APY − USDC risk-free baseline | [ ] |
| E4-04 | `il.yield.adjuster.test.ts` | IL-adjusted yield = fee APY + reward APY − estimated annual IL | [ ] |
| E4-05 | `il.yield.adjuster.test.ts` | Negative IL-adjusted yield correctly shown (not clamped to 0) | [ ] |
| E4-06 | `cv.scorer.test.ts` | Stable APY (low σ) → high CV score | [ ] |
| E4-07 | `cv.scorer.test.ts` | Volatile APY (high σ) → low CV score | [ ] |
| E4-08 | `topsis.ranker.test.ts` | TOPSIS weights sum to 1.0 per goal profile | [ ] |
| E4-09 | `topsis.ranker.test.ts` | Best opportunity (ideal solution) → score = 1.0 | [ ] |
| E4-10 | `topsis.ranker.test.ts` | Worst opportunity (anti-ideal) → score = 0 | [ ] |
| E4-11 | `topsis.ranker.test.ts` | CONSERVATIVE profile: risk weight highest | [ ] |
| E4-12 | `topsis.ranker.test.ts` | YIELD_SEEKER profile: yield weight highest | [ ] |
| E4-13 | `sustainability.tagger.test.ts` | >70% incentive APY → INCENTIVIZED tag | [ ] |
| E4-14 | `sustainability.tagger.test.ts` | <30% incentive APY → ORGANIC tag | [ ] |
| E4-15 | `idle.detector.test.ts` | IDLE: asset in wallet, available pool APY > 3% → IDLE signal | [ ] |
| E4-16 | `idle.detector.test.ts` | UNDERPERFORMING: current yield 2%, better pool available 6% → UNDERPERFORMING | [ ] |
| E4-17 | `portfolio.fit.test.ts` | Opportunity exceeds max concentration → penalty applied | [ ] |
| E4-18 | `portfolio.fit.test.ts` | CONSERVATIVE profile + LP opportunity → score 0 (gate applied) | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E4-I-01 | `yield.integration.test.ts` | Full scan → YieldOpportunitySnapshot created in DB | [ ] |
| E4-I-02 | `yield.integration.test.ts` | GET /yield/opportunities → ranked list, highest score first | [ ] |
| E4-I-03 | `yield.integration.test.ts` | GET /yield/idle → idle capital signals for current holdings | [ ] |
| E4-I-04 | `yield.integration.test.ts` | YieldOpportunitiesUpdated event emitted after scan | [ ] |

---

## Plan 07 — Engine 5: User Intelligence & AI Copilot

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| E5-01 | `questionnaire.scorer.test.ts` | All risk-averse answers → score 0–19 → CONSERVATIVE persona | [ ] |
| E5-02 | `questionnaire.scorer.test.ts` | All risk-seeking answers → score 80–100 → YIELD_SEEKER persona | [ ] |
| E5-03 | `questionnaire.scorer.test.ts` | Mixed answers → BALANCED or GROWTH range | [ ] |
| E5-04 | `questionnaire.scorer.test.ts` | Score boundary values: 19→CONSERVATIVE, 20→BALANCED, 39→BALANCED, 40→GROWTH | [ ] |
| E5-05 | `drift.scorer.test.ts` | 5 IGNORED_CRITICAL_ALERT signals in 30D → negative drift | [ ] |
| E5-06 | `drift.scorer.test.ts` | 5 ACTED_ON_REBALANCE signals in 30D → positive drift | [ ] |
| E5-07 | `drift.scorer.test.ts` | Old signals (>30D) → excluded from drift score | [ ] |
| E5-08 | `drift.scorer.test.ts` | Drift > +25 → GOAL_ESCALATION threshold crossed | [ ] |
| E5-09 | `drift.scorer.test.ts` | Drift < -25 → GOAL_DE_ESCALATION threshold crossed | [ ] |
| E5-10 | `intent.classifier.test.ts` | "what is my risk score" → RISK_QUERY (keyword match) | [ ] |
| E5-11 | `intent.classifier.test.ts` | "show my portfolio" → PORTFOLIO_QUERY (keyword match) | [ ] |
| E5-12 | `intent.classifier.test.ts` | "change my goal to aggressive" → GOAL_CHANGE (keyword match) | [ ] |
| E5-13 | `intent.classifier.test.ts` | Ambiguous query → LLM fallback called | [ ] |
| E5-14 | `copilot.service.test.ts` | Context assembler: all 4 engines queried in parallel | [ ] |
| E5-15 | `copilot.service.test.ts` | OpenAI 429 → Gemini fallback called | [ ] |
| E5-16 | `copilot.service.test.ts` | OpenAI 5xx → Gemini fallback called | [ ] |
| E5-17 | `copilot.service.test.ts` | Gemini also fails → structured error returned (no crash) | [ ] |
| E5-18 | `copilot.service.test.ts` | Response schema (Zod) → invalid LLM output → retry once | [ ] |
| E5-19 | `copilot.service.test.ts` | Session: 11th turn → oldest turn evicted (sliding window = 10) | [ ] |
| E5-20 | `copilot.service.test.ts` | Hard guardrail: "give me a specific stock tip" → COMPLIANCE_BLOCK response | [ ] |
| E5-21 | `copilot.service.test.ts` | CopilotQueryLog INSERT: every query recorded with model + tokens + durationMs | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E5-I-01 | `user.integration.test.ts` | POST /user/onboarding → UserProfile created with persona + goalProfile | [ ] |
| E5-I-02 | `user.integration.test.ts` | POST /user/onboarding twice → second submission updates (upsert) | [ ] |
| E5-I-03 | `copilot.integration.test.ts` | POST /copilot/query → 200 with answer + dataPoints + confidence | [ ] |
| E5-I-04 | `copilot.integration.test.ts` | POST /copilot/query/stream → SSE headers set, chunks streamed | [ ] |
| E5-I-05 | `copilot.integration.test.ts` | POST /copilot/reset → Redis session cleared | [ ] |

---

## Plan 08 — Engine 6: Autonomous Execution

### Unit Tests (95%+ target)

| ID | File | Test | Status |
|---|---|---|---|
| E6-01 | `poa.builder.test.ts` | OPT_IN auto-prepended when asset NOT in holdings | [ ] |
| E6-02 | `poa.builder.test.ts` | OPT_IN NOT added when already opted in | [ ] |
| E6-03 | `poa.builder.test.ts` | Steps ordered: OPT_IN → SWAP → LEND_DEPOSIT | [ ] |
| E6-04 | `poa.builder.test.ts` | NO_OP returned when all actions have drift below threshold | [ ] |
| E6-05 | `poa.builder.test.ts` | Atomic group indices assigned correctly (max 16 txns per group) | [ ] |
| E6-06 | `poa.builder.test.ts` | totalValueUsd = sum of all non-NO_OP step estimatedValueUsd | [ ] |
| E6-07 | `poa.builder.test.ts` | ALGO (assetId=0) → always treated as opted in | [ ] |
| E6-08 | `policy.engine.test.ts` | riskScore > riskScoreCap → BLOCKED | [ ] |
| E6-09 | `policy.engine.test.ts` | Daily volume would be exceeded → BLOCKED | [ ] |
| E6-10 | `policy.engine.test.ts` | Unknown protocol in step → BLOCKED | [ ] |
| E6-11 | `policy.engine.test.ts` | LP_ADD with CONSERVATIVE profile → BLOCKED | [ ] |
| E6-12 | `policy.engine.test.ts` | Single step value > profile limit → BLOCKED | [ ] |
| E6-13 | `policy.engine.test.ts` | Slippage > profile max → BLOCKED | [ ] |
| E6-14 | `policy.engine.test.ts` | Step value > $2,000 → REQUIRES_APPROVAL (not BLOCKED) | [ ] |
| E6-15 | `policy.engine.test.ts` | Step value exactly at limit → APPROVED (boundary) | [ ] |
| E6-16 | `policy.engine.test.ts` | All checks pass → APPROVED | [ ] |
| E6-17 | `simulation.gate.test.ts` | Simulation success → `passed: true` | [ ] |
| E6-18 | `simulation.gate.test.ts` | Simulation failure message → `passed: false` + reason | [ ] |
| E6-19 | `simulation.gate.test.ts` | Network error during simulate → `passed: false` (does NOT throw) | [ ] |
| E6-20 | `simulation.gate.test.ts` | Multi-group: failure in group 2 → `failedGroupIndex: 1` | [ ] |
| E6-21 | `opt-in.builder.test.ts` | Built opt-in txn: from === to === sender, amount === 0, flatFee === true | [ ] |
| E6-22 | `opt-in.builder.test.ts` | assetId=0 (ALGO) → isAccountOptedIn returns true unconditionally | [ ] |
| E6-23 | `turnkey.signer.test.ts` | Multi-group: all groups signed | [ ] |
| E6-24 | `turnkey.signer.test.ts` | Turnkey failure → throws (not silently swallowed) | [ ] |
| E6-25 | `turnkey.signer.test.ts` | Group with >1 txn → groupId assigned before signing | [ ] |
| E6-26 | `execution.coordinator.test.ts` | Transient network error (ECONNRESET) → single retry attempted | [ ] |
| E6-27 | `execution.coordinator.test.ts` | Business logic failure (slippage) → no retry | [ ] |
| E6-28 | `execution.coordinator.test.ts` | Successful broadcast → txId returned + confirmed: true | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| E6-I-01 | `execution.integration.test.ts` | Full pipeline: actions → APPROVED → sim pass → sign → broadcast → CONFIRMED record | [ ] |
| E6-I-02 | `execution.integration.test.ts` | Policy BLOCKED: ExecutionRecord created with POLICY_BLOCKED status, no signing attempted | [ ] |
| E6-I-03 | `execution.integration.test.ts` | Simulation fail: SIMULATION_FAILED status, no signing | [ ] |
| E6-I-04 | `execution.integration.test.ts` | Turnkey fail: FAILED status, no broadcast | [ ] |
| E6-I-05 | `execution.integration.test.ts` | ExecutionConfirmed event emitted after confirmed broadcast | [ ] |
| E6-I-06 | `execution.integration.test.ts` | ACTED_ON_REBALANCE behavioral signal emitted to Engine 5 | [ ] |
| E6-I-07 | `execution.integration.test.ts` | execution_transactions table: UPDATE attempt rejected by DB | [ ] |
| E6-I-08 | `execution.integration.test.ts` | Second execution exceeding daily volume → POLICY_BLOCKED | [ ] |
| E6-I-09 | `execution.integration.test.ts` | GET /execute/status/:id → correct status returned at each stage | [ ] |
| E6-I-10 | `execution.integration.test.ts` | GET /execute/history → all records for user, newest first | [ ] |

---

## Plan 09 — Audit Layer

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| AU9-01 | `audit.service.test.ts` | `write()` → AuditEntry inserted with all required fields | [ ] |
| AU9-02 | `audit.service.test.ts` | `write()` failure (DB down) → logs error, does NOT throw | [ ] |
| AU9-03 | `audit.service.test.ts` | `writeBatch()` → all entries inserted in single query | [ ] |
| AU9-04 | `audit.service.test.ts` | DB-level: UPDATE on audit_entries → rejected (permission error) | [ ] |
| AU9-05 | `audit.service.test.ts` | DB-level: DELETE on audit_entries → rejected | [ ] |
| AU9-06 | `audit.listeners.test.ts` | PortfolioSnapshotCreated event → PORTFOLIO_SCAN entry written | [ ] |
| AU9-07 | `audit.listeners.test.ts` | RiskAlertCreated event → RISK_ALERT entry with severity | [ ] |
| AU9-08 | `audit.listeners.test.ts` | ExecutionConfirmed with 2 txIds → 2 EXECUTION entries created | [ ] |
| AU9-09 | `audit.listeners.test.ts` | ExecutionBlocked event → EXECUTION entry with status=BLOCKED | [ ] |
| AU9-10 | `audit.listeners.test.ts` | All events: audit failure isolated → calling engine unaffected | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| AU9-I-01 | `audit.integration.test.ts` | GET /audit/log → paginated, newest first | [ ] |
| AU9-I-02 | `audit.integration.test.ts` | GET /audit/log?category=EXECUTION → only EXECUTION entries | [ ] |
| AU9-I-03 | `audit.integration.test.ts` | GET /audit/execution/:executionId → all txIds for that execution | [ ] |
| AU9-I-04 | `audit.integration.test.ts` | GET /audit/export (x402 gated) → without payment → 402 | [ ] |
| AU9-I-05 | `audit.integration.test.ts` | GET /audit/export with valid payment → streaming JSONL response | [ ] |

---

## Plan 10 — KYC & Identity

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| KY-01 | `kyc.service.test.ts` | `initiateKYC` when kycStatus = APPROVED → throws | [ ] |
| KY-02 | `kyc.service.test.ts` | `initiateKYC` → KYCApplication created with status PENDING | [ ] |
| KY-03 | `kyc.service.test.ts` | `handleVeriffWebhook` 'approved' → User.kycStatus = APPROVED, DID + VC issued | [ ] |
| KY-04 | `kyc.service.test.ts` | `handleVeriffWebhook` 'declined' → User.kycStatus = DECLINED, no DID issued | [ ] |
| KY-05 | `kyc.service.test.ts` | `handleVeriffWebhook` unknown sessionId → logs warn, does not throw | [ ] |
| KY-06 | `kyc.service.test.ts` | DID issuance failure → kycStatus remains APPROVED (isolated failure) | [ ] |
| KY-07 | `veriff.client.test.ts` | `verifyWebhookSignature`: valid HMAC → true | [ ] |
| KY-08 | `veriff.client.test.ts` | `verifyWebhookSignature`: tampered payload → false | [ ] |
| KY-09 | `veriff.client.test.ts` | Timing-safe comparison used (crypto.timingSafeEqual) | [ ] |
| KY-10 | `onramp.service.test.ts` | `initiateOnRamp` with kycStatus !== APPROVED → throws | [ ] |
| KY-11 | `onramp.service.test.ts` | `initiateOnRamp` success → OnRampTransaction created with INITIATED status | [ ] |
| KY-12 | `onramp.service.test.ts` | `handleWebhook` COMPLETED → status updated, algorandTxId stored | [ ] |
| KY-13 | `onramp.service.test.ts` | `handleWebhook` FAILED → status = FAILED, failureReason stored | [ ] |
| KY-14 | `offramp.service.test.ts` | `initiateOffRamp` with kycStatus !== APPROVED → throws | [ ] |
| KY-15 | `offramp.service.test.ts` | `initiateOffRamp` with insufficient USDC balance → throws | [ ] |
| KY-16 | `offramp.service.test.ts` | `initiateOffRamp` success → OffRampTransaction created with INITIATED status | [ ] |
| KY-17 | `offramp.service.test.ts` | `handleWebhook` COMPLETED → status = COMPLETED, fiatAmountInr + providerTxId stored | [ ] |
| KY-18 | `offramp.service.test.ts` | Off-ramp minimum $10 USDC enforced | [ ] |
| KY-19 | `offramp.service.test.ts` | UPI ID stored hashed (SHA-256) — NOT plaintext | [ ] |

### Integration Tests

| ID | File | Test | Status |
|---|---|---|---|
| KY-I-01 | `kyc.integration.test.ts` | POST /kyc/initiate → 200 with sessionUrl | [ ] |
| KY-I-02 | `kyc.integration.test.ts` | POST /kyc/webhook valid signature → 200, kycStatus updated | [ ] |
| KY-I-03 | `kyc.integration.test.ts` | POST /kyc/webhook invalid HMAC → 401 | [ ] |
| KY-I-04 | `kyc.integration.test.ts` | GET /identity/did after approval → returns DID | [ ] |
| KY-I-05 | `kyc.integration.test.ts` | POST /onramp/initiate → 200 with paymentUrl | [ ] |
| KY-I-06 | `kyc.integration.test.ts` | POST /offramp/initiate → 200 with providerAlgoAddress + estimatedInr | [ ] |
| KY-I-07 | `kyc.integration.test.ts` | Engine 6 execution without KYC → POLICY_BLOCKED with KYC message | [ ] |

---

## Plan 11 — x402 Gateway

### Unit Tests

| ID | File | Test | Status |
|---|---|---|---|
| X4-01 | `x402.middleware.test.ts` | Free endpoint → passes through, no 402 | [ ] |
| X4-02 | `x402.middleware.test.ts` | Paid endpoint, no X-PAYMENT header → 402 with price + facilitator address | [ ] |
| X4-03 | `x402.middleware.test.ts` | 402 response contains: amountMicro, amountUsdc, asaId, network, payTo | [ ] |
| X4-04 | `x402.middleware.test.ts` | Paid endpoint, invalid payment → 402 with PAYMENT_INVALID | [ ] |
| X4-05 | `x402.middleware.test.ts` | Paid endpoint, valid payment → next() called | [ ] |
| X4-06 | `x402.middleware.test.ts` | Replay attack: same txId used twice → rejected on second use | [ ] |
| X4-07 | `x402.middleware.test.ts` | Streaming endpoint: 402 returned before SSE connection opened | [ ] |
| X4-08 | `x402.middleware.test.ts` | NODE_ENV !== 'production' → all paid endpoints pass through | [ ] |
| X4-09 | `x402.middleware.test.ts` | 13 paid endpoints correctly registered in X402_ENDPOINTS registry | [ ] |
| X4-10 | `x402.middleware.test.ts` | /execute/autopilot/disable (DELETE) → FREE, no 402 | [ ] |

---

## Protocol Adapters

### Folks Finance

| ID | File | Test | Status |
|---|---|---|---|
| FF-01 | `folks.builder.test.ts` | `buildLendDepositTxns` → returns valid algosdk Transaction[] | [ ] |
| FF-02 | `folks.builder.test.ts` | `buildLendWithdrawTxns` → returns valid Transaction[] | [ ] |
| FF-03 | `folks.builder.test.ts` | Deposit amount encoded as BigInt (no floating point) | [ ] |

### Haystack Router

| ID | File | Test | Status |
|---|---|---|---|
| HS-01 | `haystack.builder.test.ts` | `buildSwapTxns` → returns valid atomic txn group | [ ] |
| HS-02 | `haystack.builder.test.ts` | Slippage tolerance passed correctly per goal profile | [ ] |
| HS-03 | `haystack.builder.test.ts` | Haystack API unavailable → falls back to Tinyman direct swap | [ ] |

### Tinyman V2

| ID | File | Test | Status |
|---|---|---|---|
| TM-01 | `tinyman.builder.test.ts` | `buildLpAddTxns` → valid Transaction[] | [ ] |
| TM-02 | `tinyman.builder.test.ts` | `buildLpRemoveTxns` → valid Transaction[] | [ ] |
| TM-03 | `tinyman.adapter.test.ts` | LP token balance decoded to pool position | [ ] |

### Pact

| ID | File | Test | Status |
|---|---|---|---|
| PA-01 | `pact.builder.test.ts` | `buildPactLpAddTxns` → valid Transaction[] | [ ] |
| PA-02 | `pact.builder.test.ts` | `buildPactLpRemoveTxns` → valid Transaction[] | [ ] |

---

## Financial Computation Standards

> All tests in this section apply to any module performing financial arithmetic.

| ID | Test | Status |
|---|---|---|
| FC-01 | All monetary values are DECIMAL strings — never float or number | [ ] |
| FC-02 | No `parseFloat()` on any monetary value anywhere in codebase | [ ] |
| FC-03 | All DECIMAL operations use `decimal.js` — verified by lint rule | [ ] |
| FC-04 | Division by zero: all dividers checked before operation | [ ] |
| FC-05 | All percentage values stored as `0.xx` (not `xx%`) in DB and events | [ ] |
| FC-06 | All USD values stored with 8 decimal places (microunit precision) | [ ] |
| FC-07 | All ALGO values stored with 6 decimal places (microALGO precision) | [ ] |

---

## API Contract Tests

> Verifies response shapes match the contracts defined in each plan.

| ID | Endpoint | Test | Status |
|---|---|---|---|
| API-01 | GET /portfolio/overview | Returns `healthScore`, `totalValueUsd`, `changePercent` | [ ] |
| API-02 | GET /risk/score | Returns `riskScore` (0-100), `riskLevel`, `components` | [ ] |
| API-03 | GET /risk/alerts | Returns array with `severity`, `title`, `threshold`, `status` | [ ] |
| API-04 | GET /strategy/allocation | Returns `weights` map + `model` used + `goalProfile` | [ ] |
| API-05 | GET /yield/opportunities | Returns ranked array with `netApyPercent`, `topsisScore`, `sustainabilityTag` | [ ] |
| API-06 | POST /copilot/query | Returns `answer`, `dataPoints`, `confidence`, `followUps`, `disclaimer` | [ ] |
| API-07 | POST /execute/plan | Returns `steps[]` with `actionType`, `protocol`, `estimatedValueUsd`, `estimatedSlippagePct` | [ ] |
| API-08 | GET /execute/status/:id | Returns `status` (enum), `steps[].txId`, `confirmedAt` | [ ] |
| API-09 | GET /audit/log | Returns paginated `entries[]` with `category`, `action`, `status`, `createdAt` | [ ] |
| API-10 | All 402 responses | Returns `error: 'PAYMENT_REQUIRED'`, `price.amountUsdc`, `payTo`, `facilitator` | [ ] |

---

## Security Tests

| ID | Test | Status |
|---|---|---|
| SEC-01 | Veriff webhook: invalid HMAC → 401 (no processing) | [ ] |
| SEC-02 | Turnkey: private key never logged or stored outside TEE | [ ] |
| SEC-03 | JWT: expired token → 401 on any protected endpoint | [ ] |
| SEC-04 | x402 replay: same txId used twice → 402 PAYMENT_INVALID on second use | [ ] |
| SEC-05 | UPI ID: off-ramp stores SHA-256 hash, not plaintext | [ ] |
| SEC-06 | VC JWT: stored encrypted at rest (IdentityRecord.vcJwt) | [ ] |
| SEC-07 | audit_entries: REVOKE UPDATE, DELETE confirmed at DB level | [ ] |
| SEC-08 | execution_transactions: INSERT-only confirmed at DB level | [ ] |
| SEC-09 | Engine 6: simulation always runs before signing — enforced by service layer | [ ] |
| SEC-10 | KYC gate: execution blocked if kycStatus !== APPROVED | [ ] |
