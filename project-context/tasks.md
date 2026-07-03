# CrestFlow — Task List

> Updated iteratively as the project progresses.
> Legend: [ ] Not started · [/] In progress · [x] Complete · [-] Deferred

---

## P0 — Must ship for MVP to be functional

### Project Setup

- [x] Initialize monorepo or project structure — Plan 00 implemented
- [x] Configure TypeScript / language tooling — Plan 00 implemented
- [x] Configure linting and formatting — Plan 00 implemented
- [x] Set up environment variable management — Plan 00 implemented
- [x] Set up CI pipeline (GitHub Actions) — Plan 00 implemented
- [x] Configure database connection — Plan 00 implemented

### Auth + Onboarding

- [x] Google OAuth integration — Plan 01 implemented
- [-] Email + password auth — deferred; Google OAuth only for MVP
- [x] Turnkey SDK integration — Plan 01 implemented
- [x] Embedded Algorand wallet creation on signup — Plan 01 implemented
- [x] Wallet address stored and linked to user record — Plan 01 implemented
- [x] Post-onboarding portfolio scan trigger — Plan 01 implemented
- [x] JWT sign/verify with jose (HS256, tokenVersion revocation) — Plan 01 implemented
- [x] authenticate middleware with tokenVersion check — Plan 01 implemented
- [x] WalletProvisionRecord idempotency tracking (GAP-08) — Plan 01 implemented
- [x] API: POST /api/v1/auth/google — Plan 01 implemented
- [x] API: GET /api/v1/auth/me — Plan 01 implemented
- [x] API: POST /api/v1/auth/logout — Plan 01 implemented
- [x] API: POST /api/v1/auth/trigger-portfolio-scan — Plan 01 implemented

### Financial Knowledge Layer

- [x] Algorand Indexer client (balances, ASAs, transactions) — Plan 02 implemented
- [x] CoinGecko price service (token pricing, market data) — Plan 02 implemented
- [x] Folks Finance adapter (positions, pool APYs) — Plan 02 implemented
- [x] Tinyman adapter (LP positions, pool state) — Plan 02 implemented
- [x] Pact adapter (LP positions, pool analytics) — Plan 02 implemented
- [x] Redis caching layer (TTL-based, adapter-level) — Plan 02 implemented
- [x] Gora Oracle stub (reserved for Engine 6) — Plan 02 implemented
- [x] Asset registry (ASA ID → CoinGecko ID mapping) — Plan 02 implemented
- [x] Canonical data types (AssetHolding, ProtocolPosition, PriceData) — Plan 02 implemented

### Engine 1 — Portfolio Intelligence (P0)

- [x] Asset discovery (native ALGO + all ASAs) — Plan 03 implemented
- [x] Position discovery — Folks Finance (supply + borrow) — Plan 03 implemented
- [x] Position discovery — Tinyman LP positions — Plan 03 implemented
- [x] Position discovery — Pact LP positions — Plan 03 implemented
- [x] LP token decomposition (ownership ratio → underlying asset amounts) — Plan 03 implemented
- [x] Impermanent Loss calculation per LP position (2√k/(1+k)−1) — Plan 03 implemented
- [x] Asset classification (volatile / stablecoin / lending) — Plan 03 implemented
- [x] Allocation analysis (per-asset, per-category, per-protocol) — Plan 03 implemented
- [x] Exposure analysis (direct + indirect + true, post-LP decomposition) — Plan 03 implemented
- [x] PnL tracking (unrealized + realized + yield earned + fees) — Plan 03 implemented
- [x] Cost basis tracking (weighted average cost, AssetCostBasis table) — Plan 03 implemented
- [x] HHI concentration index (on true exposure) — Plan 03 implemented
- [x] Portfolio health score (0–100, weighted composite, 5 components) — Plan 03 implemented
- [x] Immutable portfolio snapshot (PortfolioSnapshot table, INSERT-only) — Plan 03 implemented
- [x] PortfolioSnapshotCreated event (feeds Engine 2, 4, 5) — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/overview — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/allocation — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/exposure — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/performance — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/health — Plan 03 implemented
- [x] API: GET /api/v1/portfolio/snapshots — Plan 03 implemented
- [x] API: POST /api/v1/portfolio/refresh — Plan 03 implemented

### Engine 2 — Risk Intelligence (P0)

- [x] Historical CVaR (95%) — Plan 04 implemented
- [x] VaR (95%) reference metric — Plan 04 implemented
- [x] Sortino Ratio (downside-only risk-adjusted return) — Plan 04 implemented
- [x] Maximum Drawdown (MDD) — Plan 04 implemented
- [x] Calmar Ratio (annualized return / MDD) — Plan 04 implemented
- [x] Realized volatility 7D + 30D (annualized σ) — Plan 04 implemented
- [x] Liquidation risk monitoring (Folks Finance health factor + distance) — Plan 04 implemented
- [x] Concentration risk (HHI on true exposure + protocol HHI) — Plan 04 implemented
- [x] Protocol risk scoring (TVL + audit + age + incidents) — Plan 04 implemented
- [x] Liquidity exit risk (AMM price impact approximation) — Plan 04 implemented
- [x] Composite risk score (0–100, 5 weighted components) — Plan 04 implemented
- [x] Risk alert system (8 alert types, ACTIVE/RESOLVED/DISMISSED lifecycle) — Plan 04 implemented
- [x] RiskAnalysisCompleted event (feeds Engine 5) — Plan 04 implemented
- [x] API: GET /api/v1/risk/score — Plan 04 implemented
- [x] API: GET /api/v1/risk/market — Plan 04 implemented
- [x] API: GET /api/v1/risk/liquidation — Plan 04 implemented
- [x] API: GET /api/v1/risk/concentration — Plan 04 implemented
- [x] API: GET /api/v1/risk/alerts — Plan 04 implemented
- [x] API: PATCH /api/v1/risk/alerts/:id/dismiss — Plan 04 implemented

### Engine 4 — Yield and Opportunity (P0)

- [x] APY normalization (APR->APY, 30D TWAP, organic/incentivized split) — Plan 06 implemented
- [x] Excess yield over risk-free baseline (USDC Folks lending rate) — Plan 06 implemented
- [x] Coefficient of Variation (CV) yield consistency scoring — Plan 06 implemented
- [x] IL-adjusted true yield for LP positions (fee APY + reward APY - estimated IL) — Plan 06 implemented
- [x] Annualized IL estimation from 30D realized vol of asset pair — Plan 06 implemented
- [x] TOPSIS multi-criteria ranking (5 criteria, goal-profile-weighted) — Plan 06 implemented
- [x] Sustainability tagger (ORGANIC / MIXED / INCENTIVIZED) — Plan 06 implemented
- [x] TVL trend analysis (GROWING / STABLE / DECLINING / DISTRESS) — Plan 06 implemented
- [x] Liquidity scorer (TVL-to-position ratio + utilization health) — Plan 06 implemented
- [x] Portfolio fit scorer (concentration penalty + goal gate + MCR contribution) — Plan 06 implemented
- [x] Idle capital detector (IDLE / UNDERPERFORMING / SUBOPTIMAL tiers) — Plan 06 implemented
- [x] Opportunity cost calculation (USD/year, plain-English suggestion) — Plan 06 implemented
- [x] Final composite score (70% TOPSIS + 30% portfolio fit) — Plan 06 implemented
- [x] YieldOpportunitySnapshot table (INSERT-only, immutable) — Plan 06 implemented
- [x] IdleCapitalSignal table (INSERT + resolved update) — Plan 06 implemented
- [x] YieldOpportunitiesUpdated event (feeds Engine 5 + Engine 6) — Plan 06 implemented
- [x] API: GET /api/v1/yield/opportunities — Plan 06 implemented
- [x] API: GET /api/v1/yield/rankings — Plan 06 implemented
- [x] API: GET /api/v1/yield/idle — Plan 06 implemented
- [x] API: GET /api/v1/yield/opportunity/:id — Plan 06 implemented
- [-] API: POST /api/v1/yield/simulate — deferred to P2
- [-] API: GET /api/v1/yield/upgrades — covered by idle capital detection
- [x] API: GET /api/v1/yield/history — Plan 06 implemented

### Engine 5 — User Intelligence & AI Copilot (P0)

#### Part A: User Intelligence

- [x] Onboarding questionnaire (7 questions, weighted scoring) — Plan 07 implemented
- [x] Raw score → normalized score → persona classification — Plan 07 implemented
- [x] 5 investor personas: CONSERVATIVE / BALANCED / GROWTH / AGGRESSIVE / YIELD_SEEKER — Plan 07 implemented
- [x] Persona → GoalProfile mapping (feeds Engine 3 + Engine 4) — Plan 07 implemented
- [x] Behavioral signal accumulation (7 signal types) — Plan 07 implemented
- [x] Drift score computation (weighted 30D rolling window) — Plan 07 implemented
- [x] Drift threshold alerts (±25 threshold → profile update prompt) — Plan 07 implemented
- [x] UserProfile table (stated + revealed preferences) — Plan 07 implemented
- [x] BehavioralSignal table (INSERT-only event log) — Plan 07 implemented
- [x] API: POST /api/v1/user/onboarding — Plan 07 implemented
- [x] API: GET /api/v1/user/profile — Plan 07 implemented
- [x] API: PUT /api/v1/user/profile — Plan 07 implemented

#### Part B: AI Copilot

- [x] Context assembler (parallel fetch from all 4 engines) — Plan 07 implemented
- [x] Intent classifier (keyword-first + LLM fallback, 6 intents) — Plan 07 implemented
- [x] System prompt builder (goal/context/expectations/source framework) — Plan 07 implemented
- [x] LLM client: gpt-4.1-mini primary, gemini-3.5-flash fallback — Plan 07 implemented
- [x] Structured output schema (Zod: answer, dataPoints, confidence, disclaimer, followUps) — Plan 07 implemented
- [x] Redis-backed 10-turn sliding window session — Plan 07 implemented
- [x] Hard guardrails (NEVER list in system prompt) — Plan 07 implemented
- [x] Confidence scoring (HIGH / MEDIUM / LOW per response) — Plan 07 implemented
- [-] SSE streaming endpoint — deferred (non-streaming query implemented)
- [x] CopilotQueryLog table (audit log, INSERT-only) — Plan 07 implemented
- [x] API: POST /api/v1/copilot/query — Plan 07 implemented
- [-] API: POST /api/v1/copilot/query/stream — deferred (SSE streaming)
- [x] API: GET /api/v1/copilot/history — Plan 07 implemented
- [x] API: POST /api/v1/copilot/reset — Plan 07 implemented

### Dashboard (P0)

- [ ] Portfolio Overview section
- [ ] Portfolio Health section
- [ ] Asset Allocation section
- [ ] Protocol Exposure section
- [ ] Risk Analysis section
- [ ] Yield Opportunities section
- [ ] AI Copilot section

---

## P1 — Must ship for MVP to demonstrate full value

### Identity / KYC (Plan 10)

- [/] Veriff KYC session creation + webhook handler — Plan 10 written
- [/] Veriff HMAC-SHA256 webhook signature verification — Plan 10 written
- [/] KYCApplication table (PENDING → APPROVED / DECLINED) — Plan 10 written
- [/] User.kycStatus updated on Veriff decision webhook — Plan 10 written
- [/] GoPlausible DID creation (anchored to Algorand address) — Plan 10 written
- [/] GoPlausible KYC VC issuance (claims: kycVerified, tier) — Plan 10 written
- [/] IdentityRecord table (DID + VC JWT) — Plan 10 written
- [/] Wallet → DID → VC chain established in User table — Plan 10 written
- [/] KYC gate in Engine 6 Policy Engine (block execution if not APPROVED) — Plan 10 written
- [/] KYC tier limits (TIER_1: $1K/day, TIER_2: $10K/day, TIER_3: unlimited) — Plan 10 written
- [/] UPI on-ramp: Transak/Ramp integration + webhook handler — Plan 10 written
- [/] OnRampTransaction table — Plan 10 written
- [/] UPI off-ramp: Transak/Ramp off-ramp order creation + webhook handler — Plan 10 written
- [/] OffRampTransaction table (crypto → INR via provider) — Plan 10 written
- [/] Off-ramp: validate KYC + balance before initiation — Plan 10 written
- [/] Off-ramp: crypto send via Engine 6 execution pipeline (Turnkey signed) — Plan 10 written
- [/] Off-ramp: UPI ID stored hashed (SHA-256, never plaintext) — Plan 10 written
- [/] Off-ramp: minimum $10 USDC + KYC tier daily limit enforcement — Plan 10 written
- [/] API: POST /api/v1/kyc/initiate — Plan 10 written
- [/] API: GET /api/v1/kyc/status — Plan 10 written
- [/] API: POST /api/v1/kyc/webhook — Plan 10 written
- [/] API: GET /api/v1/identity/did — Plan 10 written
- [/] API: GET /api/v1/identity/vc — Plan 10 written
- [/] API: POST /api/v1/onramp/initiate — Plan 10 written
- [/] API: POST /api/v1/onramp/webhook — Plan 10 written
- [/] API: POST /api/v1/offramp/initiate — Plan 10 written
- [/] API: POST /api/v1/offramp/webhook — Plan 10 written

### Audit Layer (Plan 09)

- [/] AuditEntry schema (INSERT-only, 10 categories) — Plan 09 written
- [/] DB-level immutability: REVOKE UPDATE/DELETE on audit_entries — Plan 09 written
- [/] AuditService: write() + writeBatch() (fail-silently, never blocks caller) — Plan 09 written
- [/] Event listeners for all 10 categories (Engine 1–6, Auth, System) — Plan 09 written
- [/] Algorand txID indexed on audit_entries for direct explorer lookup — Plan 09 written
- [/] KYC status snapshot on every EXECUTION audit entry — Plan 09 written
- [/] API: GET /api/v1/audit/log (pagination + filter by category/status/date) — Plan 09 written
- [/] API: GET /api/v1/audit/log/:id — Plan 09 written
- [/] API: GET /api/v1/audit/execution/:executionId — Plan 09 written
- [/] API: GET /api/v1/audit/export (x402-gated JSONL streaming) — Plan 09 written

### x402 Gateway (Plan 11)

- [/] x402 endpoint registry (13 paid endpoints, $0.005–$0.10 USDC per call) — Plan 11 written
- [/] x402 middleware: 402 response with price + facilitator address — Plan 11 written
- [/] Goplusfable facilitator payment verification — Plan 11 written
- [/] Replay attack prevention (used txId tracking via facilitator) — Plan 11 written
- [/] x402 disabled in development (NODE_ENV check) — Plan 11 written
- [/] x402 applied AFTER auth middleware, BEFORE route handler — Plan 11 written

### Engine 5 — User Intelligence (see P0 section above)

- All Engine 5 tasks moved to P0 section — Plan 07 written

### Engine 6 — Autonomous Execution Engine (P0)

#### Layer 1: Orchestrator / POA Builder

- [/] Step graph with 7 action types (SWAP, LEND_DEPOSIT, LEND_WITHDRAW, LP_ADD, LP_REMOVE, OPT_IN, NO_OP) — Plan 08 written
- [/] Dependency resolution (OPT_IN before transfer, SWAP before LEND_DEPOSIT) — Plan 08 written
- [/] ASA opt-in pre-check + auto-prepend — Plan 08 written
- [/] Atomic group bundling (max 16 txns per group) — Plan 08 written

#### Layer 2: Policy Engine

- [/] Hard transaction limits per goal profile (CONSERVATIVE $1K, MODERATE $5K, AGGRESSIVE $20K) — Plan 08 written
- [/] Daily volume limits per goal profile (rolling 24h window) — Plan 08 written
- [/] Protocol allowlist (Folks/Tinyman/Pact/Haystack only) — Plan 08 written
- [/] Risk score gate (Engine 2 score vs profile cap) — Plan 08 written
- [/] Slippage cap enforcement (0.5% / 1% / 2% by profile) — Plan 08 written
- [/] Goal profile action gate (CONSERVATIVE: no LP) — Plan 08 written
- [/] High-value approval gate (> $2,000 → pause + notify) — Plan 08 written

#### Layer 3: Simulation Gate

- [/] algod.simulateTransaction() on all txn groups before signing — Plan 08 written
- [/] Catch reverts, slippage failures, opt-in failures, insufficient balance — Plan 08 written
- [/] Fail-closed: any simulation failure blocks execution — Plan 08 written

#### Layer 4: Protocol Transaction Builders

- [/] Haystack Router (SWAP: best price across Tinyman + Pact) — Plan 08 written
- [/] Folks Finance builder (LEND_DEPOSIT, LEND_WITHDRAW) — Plan 08 written
- [/] Tinyman V2 builder (LP_ADD, LP_REMOVE) — Plan 08 written
- [/] Pact builder (LP_ADD, LP_REMOVE — fallback) — Plan 08 written
- [/] ASA opt-in builder (OPT_IN) — Plan 08 written

#### Layer 5: Signing + Execution Coordinator

- [/] Turnkey TEE signing (ACTIVITY_TYPE_SIGN_TRANSACTION_V2 per group) — Plan 08 written
- [/] Signature verification before broadcast — Plan 08 written
- [/] algod.sendRawTransaction() + waitForConfirmation (3 rounds) — Plan 08 written
- [/] Single retry on transient network errors only — Plan 08 written
- [/] ExecutionRecord (PENDING → SUBMITTED → CONFIRMED / FAILED) — Plan 08 written
- [/] ExecutionTransaction (INSERT-only audit, txID per group) — Plan 08 written
- [/] ExecutionConfirmed event → Engine 1 rescan — Plan 08 written
- [/] ACTED_ON_REBALANCE signal → Engine 5 behavioral drift — Plan 08 written

#### x402 Payment Middleware

- [/] HTTP 402 gate on paid endpoints (/execute/plan, /execute/submit, /execute/simulate, /autopilot/enable) — Plan 08 written
- [/] Goplusfable facilitator payment verification — Plan 08 written

#### API Endpoints

- [/] API: POST /api/v1/execute/plan — Plan 08 written
- [/] API: POST /api/v1/execute/submit — Plan 08 written
- [/] API: GET /api/v1/execute/status/:executionId — Plan 08 written
- [/] API: GET /api/v1/execute/history — Plan 08 written
- [/] API: POST /api/v1/execute/simulate — Plan 08 written
- [/] API: POST /api/v1/execute/autopilot/enable — Plan 08 written
- [/] API: DELETE /api/v1/execute/autopilot/disable — Plan 08 written

### Engine 3 — Strategy and Optimization (P0)

- [x] Ledoit-Wolf covariance shrinkage (de-noise sample covariance) — Plan 05 implemented
- [x] HRP optimizer (hierarchical clustering + recursive bisection) — Plan 05 implemented
- [x] Mean-CVaR optimizer (95% confidence, gradient descent on simplex) — Plan 05 implemented
- [x] HRP + Mean-CVaR ensemble (50/50 blend, 30+ snapshots) — Plan 05 implemented
- [x] Inverse Volatility optimizer (naïve risk parity, 14+ snapshots) — Plan 05 implemented
- [x] Equal Weight + goal tilt (seed model, Day 1) — Plan 05 implemented
- [x] Black-Litterman stub (P2 — requires 90+ snapshots) — Plan 05 implemented
- [x] Momentum signal overlay (+/-2% tilt, 14-day lookback) — Plan 05 implemented
- [x] Goal-based constraint enforcer (CONSERVATIVE / MODERATE / AGGRESSIVE) — Plan 05 implemented
- [x] Defensive risk override (riskScore > profile cap → shift to stablecoins) — Plan 05 implemented
- [x] Progressive model selector (snapshotCount → best available model) — Plan 05 implemented
- [x] Rebalancing action generator (diff, urgency tiers, vol-adjusted threshold) — Plan 05 implemented
- [x] Strategy explainer (plain-English rationale, trust layer) — Plan 05 implemented
- [x] strategy_snapshots table (INSERT-only, immutable) — Plan 05 implemented
- [x] user_goal_profiles table (mutable, one per user) — Plan 05 implemented
- [x] StrategyPlanCreated event (feeds Engine 6 + Engine 5) — Plan 05 implemented
- [x] API: GET /api/v1/strategy/allocation — Plan 05 implemented
- [x] API: GET /api/v1/strategy/rebalance — Plan 05 implemented
- [-] API: POST /api/v1/strategy/simulate — deferred (goal change triggers recompute instead)
- [x] API: PUT /api/v1/strategy/goal — Plan 05 implemented
- [x] API: POST /api/v1/strategy/refresh — Plan 05 implemented
- [x] API: GET /api/v1/strategy/explain — Plan 05 implemented
- [x] API: GET /api/v1/strategy/history — Plan 05 implemented

### Engine 6 — Autonomous Execution (covered by Plan 08 in P0 section above)

- [/] Folks Finance: lend deposit + lend withdraw transaction builders — Plan 08 written
- [/] Tinyman V2: LP add + LP remove transaction builders — Plan 08 written
- [/] Pact: LP add + LP remove transaction builders (fallback) — Plan 08 written
- [/] Haystack Router: swap transaction builder (best price, Tinyman+Pact aggregation) — Plan 08 written
- [/] Transaction simulation via algod.simulateTransaction() — Plan 08 written
- [/] User approval workflow (REQUIRES_APPROVAL gate for transactions > $2,000) — Plan 08 written
- [/] Audit log entry for every execution (via Plan 09 event listeners) — Plan 09 written
- [/] Portfolio refresh trigger post-execution (ExecutionConfirmed → Engine 1) — Plan 08 written
- [/] API: POST /api/v1/execute/plan — Plan 08 written
- [/] API: POST /api/v1/execute/submit — Plan 08 written
- [/] API: POST /api/v1/execute/simulate — Plan 08 written

### Orchestration Layer (covered by Plan 08 in P0 section above)

- [/] Policy Engine: user approval validation (REQUIRES_APPROVAL gate) — Plan 08 written
- [/] Policy Engine: risk limit validation (score gate vs profile cap) — Plan 08 written
- [/] Policy Engine: KYC status check (first policy check before all others) — Plan 10 written
- [/] Policy Engine: protocol allowlist (Folks/Tinyman/Pact/Haystack only) — Plan 08 written
- [/] Policy Engine: slippage cap enforcement (0.5%/1%/2% by profile) — Plan 08 written
- [/] Policy Engine: daily volume limits + single txn limits by profile — Plan 08 written
- [/] Orchestrator: Plan of Action (POA) generation with dependency resolution — Plan 08 written
- [/] Execution Coordinator: step sequencing + atomic group bundling — Plan 08 written
- [/] Execution Coordinator: failure handling (halt + surface plain-English to user) — Plan 08 written
- [/] Haystack Router: smart order routing (Tinyman + Pact aggregation) — Plan 08 written
- [/] Folks Finance Adapter: lend deposit + lend withdraw — Plan 08 written
- [/] Tinyman Adapter: swap + LP add + LP remove — Plan 08 written
- [/] Pact Adapter: LP add + LP remove (fallback) — Plan 08 written
- [-] Gora Oracle: price feed integration — deferred to P2 (stub only in Plan 02)
- [-] Gora Oracle: halt on unavailability — deferred to P2

### Dashboard (P1)

- [ ] Recommendations section
- [ ] Execution Center section
- [ ] Investor Profile section

### AI Copilot — Extended (covered by Plan 07)

- [/] Copilot: strategy questions (Engine 3 context in assembler, STRATEGY_QUERY intent) — Plan 07 written
- [/] Copilot: yield questions (Engine 4 context in assembler, YIELD_QUERY intent) — Plan 07 written
- [/] Copilot: execution initiation (EXECUTION_REQUEST intent → routes to Engine 6) — Plan 07 written
- [/] Copilot: user profile questions (GOAL_CHANGE intent → Engine 5 profile update) — Plan 07 written
- [/] Copilot: risk questions (RISK_QUERY intent + Engine 2 context) — Plan 07 written

---

## P2 — Post-MVP, before Phase 2

- [ ] Gora Oracle: full price feed integration (currently stub — Plan 02)
- [ ] Gora Oracle: halt-on-unavailability circuit breaker
- [ ] Pact position discovery in Engine 1 (LP holdings scan)
- [ ] Tinyman LP provision / withdrawal execution (complete Plan 08 builders)
- [ ] DefiLlama adapter (TVL trending, APY cross-reference)
- [ ] Full Monte Carlo stress testing (10,000 scenarios, 30-day horizon)
- [ ] Bayesian scenario analysis ('2022 crash', 'DeFi exploit' templates)
- [ ] Cornish-Fisher CVaR (non-normal distribution, skewness + kurtosis)
- [ ] VaR / CVaR at 99% confidence level
- [ ] Advanced preference learning (HDBSCAN persona clustering)
- [ ] Goal progress tracking (monthly portfolio vs goal comparison)
- [ ] MCP tool schema definitions + MCP server implementation
- [ ] x402 payment middleware activation (Plan 11 — already designed)
- [ ] Black-Litterman model (requires 90+ portfolio snapshots)
- [ ] Multi-chain portfolio data (Ethereum L2, Solana, Base — read-only)

---

## Phase 3 — Future

> See `project-context/future-plans.md` for full detail on all Phase 3 items.

- [ ] Fully autonomous Autopilot (subscription model, no approval needed)
- [ ] Multi-chain execution (Aave + Uniswap V3 + Jupiter)
- [ ] RWA protocol integrations (Meld Gold, Lofty.ai, Backed Finance)
- [ ] Institutional workflows (multi-sig, org roles, compliance export)
- [ ] Advanced treasury management (DAO treasury, runway forecasting)
- [ ] Full compliance system (FATF Travel Rule, AML screening, SAR automation)
- [ ] CREST native token (utility + governance on Algorand)
- [ ] CrestFlow Protocol (open-source `@crestflow/execution-sdk`)
- [ ] Agent-to-agent flows (Google A2A, OpenAI ACP)
- [ ] CrestFlow Mobile (React Native / Flutter)
