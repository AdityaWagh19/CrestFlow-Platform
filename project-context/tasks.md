# CrestFlow — Task List

> Updated iteratively as the project progresses.
> Legend: [ ] Not started · [/] In progress · [x] Complete · [-] Deferred

---

## P0 — Must ship for MVP to be functional

### Project Setup
- [ ] Initialize monorepo or project structure
- [ ] Configure TypeScript / language tooling
- [ ] Configure linting and formatting
- [ ] Set up environment variable management
- [ ] Set up CI pipeline (GitHub Actions)
- [ ] Configure database connection

### Auth + Onboarding
- [/] Google OAuth integration — Plan 01 written
- [-] Email + password auth — deferred; Google OAuth only for MVP
- [/] Turnkey SDK integration — Plan 01 written
- [/] Embedded Algorand wallet creation on signup — Plan 01 written
- [/] Wallet address stored and linked to user record — Plan 01 written
- [/] Post-onboarding portfolio scan trigger — Plan 01 written

### Financial Knowledge Layer
- [/] Algorand Indexer client (balances, ASAs, transactions) — Plan 02 written
- [/] CoinGecko price service (token pricing, market data) — Plan 02 written
- [/] Folks Finance adapter (positions, pool APYs) — Plan 02 written
- [/] Tinyman adapter (LP positions, pool state) — Plan 02 written
- [/] Pact adapter (LP positions, pool analytics) — Plan 02 written
- [/] Redis caching layer (TTL-based, adapter-level) — Plan 02 written
- [/] Gora Oracle stub (reserved for Engine 6) — Plan 02 written
- [/] Asset registry (ASA ID → CoinGecko ID mapping) — Plan 02 written
- [/] Canonical data types (AssetHolding, ProtocolPosition, PriceData) — Plan 02 written

### Engine 1 — Portfolio Intelligence (P0)
- [/] Asset discovery (native ALGO + all ASAs) — Plan 03 written
- [/] Position discovery — Folks Finance (supply + borrow) — Plan 03 written
- [/] Position discovery — Tinyman LP positions — Plan 03 written
- [/] Position discovery — Pact LP positions — Plan 03 written
- [/] LP token decomposition (ownership ratio → underlying asset amounts) — Plan 03 written
- [/] Impermanent Loss calculation per LP position (2√k/(1+k)−1) — Plan 03 written
- [/] Asset classification (volatile / stablecoin / lending) — Plan 03 written
- [/] Allocation analysis (per-asset, per-category, per-protocol) — Plan 03 written
- [/] Exposure analysis (direct + indirect + true, post-LP decomposition) — Plan 03 written
- [/] PnL tracking (unrealized + realized + yield earned + fees) — Plan 03 written
- [/] Cost basis tracking (weighted average cost, AssetCostBasis table) — Plan 03 written
- [/] HHI concentration index (on true exposure) — Plan 03 written
- [/] Portfolio health score (0–100, weighted composite, 5 components) — Plan 03 written
- [/] Immutable portfolio snapshot (PortfolioSnapshot table, INSERT-only) — Plan 03 written
- [/] PortfolioSnapshotCreated event (feeds Engine 2, 4, 5) — Plan 03 written
- [/] API: GET /api/v1/portfolio/overview — Plan 03 written
- [/] API: GET /api/v1/portfolio/allocation — Plan 03 written
- [/] API: GET /api/v1/portfolio/exposure — Plan 03 written
- [/] API: GET /api/v1/portfolio/performance — Plan 03 written
- [/] API: GET /api/v1/portfolio/health — Plan 03 written
- [/] API: GET /api/v1/portfolio/snapshots — Plan 03 written
- [/] API: POST /api/v1/portfolio/refresh — Plan 03 written

### Engine 2 — Risk Intelligence (P0)
- [/] Historical CVaR (95%) — Plan 04 written
- [/] VaR (95%) reference metric — Plan 04 written
- [/] Sortino Ratio (downside-only risk-adjusted return) — Plan 04 written
- [/] Maximum Drawdown (MDD) — Plan 04 written
- [/] Calmar Ratio (annualized return / MDD) — Plan 04 written
- [/] Realized volatility 7D + 30D (annualized σ) — Plan 04 written
- [/] Liquidation risk monitoring (Folks Finance health factor + distance) — Plan 04 written
- [/] Concentration risk (HHI on true exposure + protocol HHI) — Plan 04 written
- [/] Protocol risk scoring (TVL + audit + age + incidents) — Plan 04 written
- [/] Liquidity exit risk (AMM price impact approximation) — Plan 04 written
- [/] Composite risk score (0–100, 5 weighted components) — Plan 04 written
- [/] Risk alert system (8 alert types, ACTIVE/RESOLVED/DISMISSED lifecycle) — Plan 04 written
- [/] RiskAnalysisCompleted event (feeds Engine 5) — Plan 04 written
- [/] API: GET /api/v1/risk/score — Plan 04 written
- [/] API: GET /api/v1/risk/market — Plan 04 written
- [/] API: GET /api/v1/risk/liquidation — Plan 04 written
- [/] API: GET /api/v1/risk/concentration — Plan 04 written
- [/] API: GET /api/v1/risk/alerts — Plan 04 written
- [/] API: PATCH /api/v1/risk/alerts/:id/dismiss — Plan 04 written

### Engine 4 — Yield and Opportunity (P0)
- [ ] Folks Finance lending opportunity discovery
- [ ] Tinyman LP opportunity discovery
- [ ] Yield aggregation and normalization
- [ ] Liquidity evaluation per opportunity
- [ ] Protocol risk evaluation per opportunity
- [ ] Sustainability scoring
- [ ] Risk-adjusted ranking (default)
- [ ] Idle capital detection
- [ ] API: GET /api/v1/yield/opportunities
- [ ] API: GET /api/v1/yield/rankings

### AI Copilot (P0)
- [ ] Copilot API endpoint (POST /api/v1/copilot/query)
- [ ] Natural language query routing to engines
- [ ] Response format: answer + data + confidence + assumptions + next action
- [ ] Multi-turn session context
- [ ] Copilot: portfolio questions (Engine 1)
- [ ] Copilot: risk questions (Engine 2)
- [ ] Copilot: yield questions (Engine 4)

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

### Identity
- [ ] Veriff KYC integration (document + liveness + AML)
- [ ] KYC status stored per user and exposed to Policy Engine
- [ ] GoPlausible DID generation (post-KYC)
- [ ] GoPlausible KYC VC issuance
- [ ] wallet → did → vc chain established
- [ ] UPI on-ramp integration

### Engine 5 — User Intelligence (P1)
- [ ] Onboarding persona questionnaire
- [ ] Investor persona classification (Conservative / Balanced / Growth / Aggressive / Yield Seeker)
- [ ] Dynamic risk profile generation
- [ ] Goal capture (yield target, growth target, preservation)
- [ ] Profile output consumed by Engines 2, 3, 4
- [ ] API: GET /api/v1/profile
- [ ] API: GET /api/v1/persona
- [ ] API: PUT /api/v1/profile/goals

### Engine 3 — Strategy and Optimization (P1)
- [ ] Portfolio rebalancing recommendations
- [ ] Yield optimization recommendations
- [ ] Capital deployment suggestions (idle capital)
- [ ] Goal-based strategy generation
- [ ] Expected outcome estimation (quantified)
- [ ] Full explainability on every recommendation (reason + outcome + risk + assumptions + confidence)
- [ ] API: GET /api/v1/strategy/recommendations
- [ ] API: POST /api/v1/strategy/rebalance

### Engine 6 — Basic Execution (P1)
- [ ] Folks Finance: supply transaction generation
- [ ] Folks Finance: borrow transaction generation
- [ ] Folks Finance: repay transaction generation
- [ ] Folks Finance: withdraw transaction generation
- [ ] Tinyman: swap transaction generation
- [ ] Transaction simulation (estimated outcome + fees)
- [ ] User approval workflow
- [ ] Audit log entry for every execution
- [ ] Portfolio refresh trigger post-execution
- [ ] API: POST /api/v1/execution/simulate
- [ ] API: POST /api/v1/execution/plan
- [ ] API: POST /api/v1/execution/execute

### Orchestration Layer (P1)
- [ ] Policy Engine: user approval validation
- [ ] Policy Engine: risk limit validation
- [ ] Policy Engine: KYC status check
- [ ] Orchestrator: Plan of Action (POA) generation for supported flows
- [ ] Execution Coordinator: step sequencing
- [ ] Execution Coordinator: failure handling (halt + surface to user)
- [ ] Haystack Router: routing to Folks Finance Adapter
- [ ] Haystack Router: routing to Tinyman Adapter
- [ ] Folks Finance Adapter: supply / borrow / repay / withdraw
- [ ] Tinyman Adapter: swap
- [ ] Gora Oracle: price feed integration
- [ ] Gora Oracle: halt on unavailability

### Dashboard (P1)
- [ ] Recommendations section
- [ ] Execution Center section
- [ ] Investor Profile section

### AI Copilot — Extended (P1)
- [ ] Copilot: strategy questions (Engine 3)
- [ ] Copilot: execution initiation (Engine 6 via Policy Engine)
- [ ] Copilot: user profile questions (Engine 5)

---

## P2 — Post-MVP, before Phase 2

- [ ] Pact API client
- [ ] Pact Adapter (Haystack Router)
- [ ] Pact position discovery (Engine 1)
- [ ] Pact yield opportunities (Engine 4)
- [ ] Tinyman LP provision / withdrawal execution
- [ ] Full stress testing (Monte Carlo, Bayesian scenarios)
- [ ] VaR / CVaR computation
- [ ] Advanced preference learning (Engine 5)
- [ ] Goal progress tracking (Engine 5)
- [ ] x402 payment middleware activation
- [ ] MCP tool schema definitions
- [ ] MCP server implementation
- [ ] API: GET /api/v1/portfolio/pnl
- [ ] API: GET /api/v1/portfolio/performance
- [ ] API: GET /api/v1/risk/liquidity
- [ ] API: GET /api/v1/risk/liquidation
- [ ] DefiLlama integration (if direct protocol APIs are proven insufficient for TVL trending)

---

## Phase 3 — Future

- [ ] Autonomous execution / Autopilot (pre-authorized execution rules)
- [ ] Multi-chain support
- [ ] Multi-agent orchestration
- [ ] Institutional workflows
- [ ] Advanced treasury management
- [ ] Full compliance system
- [ ] RWA protocol integrations
- [ ] Agent-to-agent flows
