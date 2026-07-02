# CrestFlow — Future Plans & Roadmap

> This file documents all planned future integrations, features, and architectural expansions beyond the current MVP scope (Plans 01–11).
> Organized by: P2 (post-MVP before Phase 2), Phase 2, Phase 3 (long-term vision).

---

## P2 — Post-MVP Hardening (before Phase 2)

These features are not blocking MVP launch but should ship within 2–4 sprints after core backend is stable.

---

### P2.1 — MCP Server (Model Context Protocol)

**What:** Expose CrestFlow engines as MCP-compatible tools so external AI agents can query portfolio data, risk scores, and yield opportunities programmatically.

**Scope:**
- Define MCP tool schemas for each engine's primary read endpoints
- Implement MCP server (`@modelcontextprotocol/sdk`) alongside the existing REST API
- Tools: `get_portfolio`, `get_risk_score`, `get_strategy`, `get_yield_opportunities`, `copilot_query`
- All MCP tool calls inherit x402 gating (paid tools respect pricing from Plan 11)

**Why:** Enables agent-to-agent commerce. External AI assistants (Claude, ChatGPT plugins, custom agents) can query a user's CrestFlow data on their behalf. Combined with x402, this creates a machine-readable API economy.

**Dependencies:** Plans 03–07 implemented, Plan 11 (x402) active.

---

### P2.2 — Advanced Preference Learning (Engine 5)

**What:** Upgrade Engine 5's investor persona classification from rule-based scoring to ML-assisted clustering once sufficient user data exists.

**Scope:**
- HDBSCAN or K-Means clustering on normalized questionnaire score + behavioral drift vector
- Cluster centroids → 5 named personas (auto-labelled or human-labelled)
- A/B test: rule-based vs ML personas → measure downstream strategy performance
- Confidence-weighted persona assignment (e.g., 70% GROWTH, 30% AGGRESSIVE)
- Goal progress tracking: compare actual portfolio performance to stated goals quarterly

**Dependencies:** 500+ users with 30+ days of behavioral signal history.

---

### P2.3 — Goal Progress Tracking (Engine 5)

**What:** Track whether a user is on-track to meet their stated investment goals (yield target, growth target, capital preservation).

**Scope:**
- Monthly goal evaluation: compare current portfolio yield vs target yield, current growth vs target growth
- Goal tracking surface: "You're earning 6.2% APY against your 8% target — here's what's holding you back"
- Triggered by Engine 1 (monthly PortfolioSnapshot comparison)
- Engine 5 Copilot: new intent `GOAL_PROGRESS_QUERY`
- `GoalProgressSnapshot` table (monthly, INSERT-only)

**Dependencies:** Plan 07 implemented, 3+ months of portfolio history.

---

### P2.4 — DefiLlama Integration (Financial Knowledge Layer)

**What:** Integrate DefiLlama as a supplementary data source for TVL trending, protocol health signals, and APY discovery beyond Folks Finance, Tinyman, and Pact.

**Scope:**
- DefiLlama adapter: `fetchAlgorandTVL()`, `fetchProtocolTVL(protocol)`, `fetchYieldPools(chain='algorand')`
- Used by Engine 4 as a cross-reference: if DefiLlama APY ≠ direct protocol API APY by >20% → flag discrepancy
- TVL trending: if a protocol's TVL drops >30% in 7 days → Engine 2 surface as risk signal
- Redis cache: 4-hour TTL for TVL data

**Dependencies:** Plan 02 (Financial Knowledge Layer) implemented.

---

### P2.5 — Full Stress Testing (Engine 2)

**What:** Upgrade Engine 2's risk analysis from historical CVaR to full Monte Carlo + Bayesian stress scenarios.

**Scope:**
- Monte Carlo simulation: 10,000 scenarios, 30-day horizon
- Bayesian scenario analysis: "2022 crypto crash", "Algorand governance proposal", "DeFi protocol exploit"
- Liquidity risk analysis: estimate days to liquidate portfolio at 10% slippage, 20% slippage
- New API: `GET /risk/scenarios` (full stress test results)
- `RiskScenarioSnapshot` table (INSERT-only, triggered monthly or on-demand)

**Dependencies:** Plan 04 implemented, 90+ days of portfolio snapshots.

---

### P2.6 — Pact Position Discovery (Engine 1)

**What:** Pact SDK is partially integrated for execution (Plan 08). Add Pact LP position discovery to Engine 1's portfolio scan.

**Scope:**
- Pact adapter: `fetchLPPositions(address)` — enumerate all Pact LP pool tokens held
- LP decomposition (already exists in Engine 1 framework — just add Pact pools)
- IL calculation for Pact positions (same formula as Tinyman — 2√k/(1+k)−1)
- Pact positions included in PortfolioSnapshot.assetHoldings

**Dependencies:** Plan 03 (Engine 1) implemented.

---

### P2.7 — Tinyman LP Provision / Withdrawal Execution (Engine 6)

**What:** Plan 08 includes the Tinyman LP builders but marks `LP_ADD` and `LP_REMOVE` as partially integrated. This plan completes the implementation and adds E2E tests.

**Scope:**
- Complete `tinyman.builder.ts` — production-ready `buildLpAddTxns` + `buildLpRemoveTxns`
- Slippage-aware minimum output calculation for both operations
- Pool price impact calculation before LP_ADD (warn if price impact > 2%)
- E2E integration test against Tinyman Testnet

**Dependencies:** Plan 08 (Engine 6) implemented.

---

### P2.8 — VaR / CVaR Full Computation (Engine 2)

**What:** The current CVaR in Engine 2 is computed using a simplified historical simulation (5th percentile of daily returns). This upgrades to the full Cornish-Fisher expansion for non-normal return distributions.

**Scope:**
- Cornish-Fisher CVaR: accounts for skewness + kurtosis of return distribution (critical for crypto portfolios)
- 95% and 99% confidence levels
- Per-asset CVaR contribution decomposition
- CVaR attribution: "ALGO accounts for 67% of your total tail risk"
- Updated `RiskSnapshot.cvar95Percent` + new `cvar99Percent` field

**Dependencies:** Plan 04 implemented, 60+ days of portfolio snapshots.

---

## Phase 2 — Expansion (6–12 months post-MVP)

Phase 2 transforms CrestFlow from an Algorand-native tool into a multi-chain, institutional-grade platform.

---

### Phase 2.1 — Multi-Chain Portfolio Intelligence

**What:** Expand Engine 1 beyond Algorand to support Ethereum L2s, Solana, and Base.

**Scope:**
- Chain adapter pattern (already established in Plan 02): add `EthereumAdapter`, `SolanaAdapter`, `BaseAdapter`
- Unified portfolio view across all chains in a single PortfolioSnapshot
- Cross-chain health score (same formula, different data sources)
- New `chain` field on `AssetHolding` and `PortfolioSnapshot`
- Unified price service: already uses CoinGecko (chain-agnostic)

**Key integrations:** Alchemy (Ethereum/Base), Helius (Solana), Viem (L2 RPC)

---

### Phase 2.2 — Multi-Chain Execution (Engine 6)

**What:** Extend Engine 6's execution pipeline to support swaps and lending on Ethereum L2s and Solana.

**Scope:**
- New protocol builders: Aave (lending), Uniswap V3 (swap), Jupiter (Solana swap)
- Cross-chain Turnkey signing: Ed25519 (Algorand/Solana), secp256k1 (Ethereum)
- Cross-chain atomic execution is not possible — Saga pattern for multi-chain sequences
- Policy Engine extended with per-chain limits

---

### Phase 2.3 — RWA Protocol Integrations

**What:** Integrate Real World Asset (RWA) protocols on Algorand and other chains.

**Scope:**
- Target protocols: Meld Gold (tokenized gold on Algorand), Lofty.ai (tokenized real estate on Algorand), Backed Finance (tokenized bonds)
- Engine 4 Yield: surface RWA yields alongside DeFi yields
- Engine 3 Strategy: include RWA allocation in HRP optimizer
- Engine 1: discover and value RWA positions
- New asset class: `RWA` (alongside `VOLATILE`, `STABLECOIN`, `LENDING`)

---

### Phase 2.4 — Institutional Workflows

**What:** Support institutional accounts with multi-user access, approval workflows, and enterprise-grade audit.

**Scope:**
- Organisation model: one org → multiple sub-accounts → one portfolio per sub-account
- Role-based access: `ORG_ADMIN`, `TRADER`, `VIEWER`, `COMPLIANCE_OFFICER`
- Multi-sig execution: high-value trades require M-of-N approvals within the org
- Compliance export: MiFID II / FATF-compatible audit report export
- Treasury management mode: track idle treasury capital across multiple wallets
- API-key authentication (for programmatic institutional access, not OAuth)

---

### Phase 2.5 — Advanced Treasury Management

**What:** Dedicated treasury management mode for DAOs and protocol treasuries.

**Scope:**
- Multi-wallet treasury aggregation (unified view of DAO treasury across 5–20 wallets)
- Governance token tracking (ALGO, GOV tokens)
- Treasury yield optimization: maximize yield on idle governance token holdings
- Spending forecast: project runway based on current burn rate vs treasury yield
- Treasury report: monthly PDF for DAO governance
- Protocol revenue tracking: measure protocol-generated revenue vs treasury expenditure

---

### Phase 2.6 — Agent-to-Agent Flows

**What:** Enable CrestFlow's Engine 6 to interact with external AI agents and DeFi protocols via standardised agent-communication protocols.

**Scope:**
- A2A (Agent-to-Agent) protocol support: respond to execution intents from external agents
- Implement Google A2A protocol for cross-agent task delegation
- CrestFlow becomes an "execution agent" that other orchestrators can delegate DeFi actions to
- x402 monetisation: external agents pay CrestFlow per execution via x402
- Policy Engine extended: agent-sourced executions require additional verification (DID-backed)

---

## Phase 3 — Long-Term Vision (12–24 months)

---

### Phase 3.1 — Fully Autonomous Autopilot

**What:** Beyond the current "autopilot within limits" mode — a fully autonomous portfolio manager that rebalances, harvests yield, and manages risk without any user prompts.

**Scope:**
- Autopilot subscription model: monthly USDC payment unlocks fully autonomous execution
- Autonomous rebalance scheduler: execute Engine 3 recommendations on schedule (daily, weekly)
- Autonomous yield harvesting: claim LP rewards and re-deploy automatically
- Autonomous defensive mode: automatically reduce risk when Engine 2 score approaches cap
- Emergency circuit breaker: halt all autonomous activity if portfolio value drops >15% in 24h

---

### Phase 3.2 — Full Compliance System

**What:** Build a comprehensive compliance layer for regulated markets.

**Scope:**
- FATF Travel Rule compliance for transactions above $3,000 (cross-border)
- Real-time AML screening on every execution counterparty (Chainalysis / Elliptic integration)
- Suspicious Activity Report (SAR) automation: flag and file SARs for qualifying patterns
- Regulatory reporting: MAS (Singapore), SEC (US), FCA (UK) report templates
- On-chain compliance attestation: VC-based KYC proof attached to large transactions

---

### Phase 3.3 — CrestFlow Native Token & Fee Model

**What:** Launch a CrestFlow governance + utility token that replaces USDC-based x402 payments.

**Scope:**
- CREST token on Algorand (ASA)
- x402 payments accepted in CREST at a discount (30% cheaper than USDC pricing)
- CREST staking: stake CREST to earn fee revenue share from protocol x402 revenue
- Governance: CREST holders vote on policy engine parameters (max limits, approved protocols)
- Liquidity bootstrapping: CREST/ALGO pair on Tinyman for token liquidity

---

### Phase 3.4 — CrestFlow Protocol (Open Source Execution Layer)

**What:** Open-source the execution engine (Engine 6) as a standalone DeFi execution protocol.

**Scope:**
- `@crestflow/execution-sdk` — npm package
- Any developer can integrate CrestFlow's POA builder + policy engine + multi-protocol builders into their own app
- Revenue: SDK users pay x402 per execution to CrestFlow facilitator
- Documentation site, quickstart guides, example integrations
- Community plugins: new protocol adapters contributed by ecosystem developers

---

### Phase 3.5 — Gora Oracle Full Integration

**What:** Replace CoinGecko price service with on-chain Gora oracle feeds for critical price data.

**Scope:**
- Gora adapter: `fetchAlgorandPrice()`, `fetchASAPrice(asaId)`
- Dual-source price consensus: CoinGecko (off-chain) + Gora (on-chain) → use on-chain price for execution, off-chain for display
- Price manipulation detection: if CoinGecko price diverges >5% from Gora → halt execution, surface alert
- Engine 2 risk signal: Gora oracle unavailability → elevated risk score

**Status:** Gora stub already in Plan 02. Full implementation is Phase 3.

---

### Phase 3.6 — CrestFlow Mobile App

**What:** Native mobile application (iOS + Android) for CrestFlow.

**Scope:**
- React Native or Flutter (TBD)
- Full feature parity with web dashboard
- Push notifications for: risk alerts, execution confirmations, yield opportunities, goal progress
- Biometric authentication (FaceID / fingerprint) for execution approval
- Deep link support: tap notification → opens execution approval directly

---

## Integration Priority Map

```
MVP (Plans 01–11):
  Algorand + Folks Finance + Tinyman + Pact + Haystack
  Turnkey (signing) + Veriff (KYC) + GoPlausible (DID/VC)
  GPT-4.1-mini + Gemini 3.5 Flash (copilot)
  Goplusfable (x402)
  CoinGecko (pricing)

P2 (next 6 months):
  DefiLlama + Gora (data)
  MCP Server (agent tooling)
  Cornish-Fisher CVaR (risk)
  Monte Carlo stress testing (risk)
  Multi-chain adapters (data only)

Phase 2 (6–12 months):
  Aave + Uniswap V3 + Jupiter (execution)
  Alchemy + Helius + Viem (chain data)
  Meld Gold + Lofty.ai + Backed (RWA)
  Chainalysis / Elliptic (AML)
  Google A2A + OpenAI ACP (agent protocols)

Phase 3 (12–24 months):
  CREST token (Algorand ASA)
  @crestflow/execution-sdk (open source)
  Full Gora integration (on-chain oracle)
  CrestFlow Mobile (React Native / Flutter)
  FATF Travel Rule + SAR automation
```

---

## Architecture Evolution Notes

### Current Architecture (MVP)
- Monorepo: single NestJS/Express app
- PostgreSQL + Redis (cache + sessions)
- Algorand-native (one chain)
- REST API + SSE (streaming)
- x402 micropayments (USDC on Algorand)

### P2 Architecture
- Microservices split: `engine-api` + `execution-worker` + `copilot-api` (separate services)
- Message queue (BullMQ or Kafka): engine events → async processing
- Read replicas for PostgreSQL (high-traffic snapshot reads)
- Multi-chain chain adapters (same interface, different implementations)

### Phase 2 Architecture
- Multi-region deployment (Singapore, US East for compliance)
- Event sourcing: full event log as source of truth (replaces snapshot polling)
- GraphQL gateway (supplements REST for complex frontend queries)
- Dedicated audit DB (separate PostgreSQL instance, append-only, replicated)
- Compliance sidecar (separate service, reads from audit stream)

### Phase 3 Architecture
- Protocol-level: CrestFlow smart contracts on Algorand (execution escrow, fee collection)
- SDK distribution via npm + Algorand Developer Portal
- On-chain governance contract (CREST voting)
- Decentralised facilitator network (replace single Goplusfable with multi-facilitator)
