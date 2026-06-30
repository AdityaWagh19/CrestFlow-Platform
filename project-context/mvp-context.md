# CrestFlow MVP Context

**Version:** 1.0  
**Architecture Source of Truth:** `system-architecture.png`

> The MVP is not a simplified version of CrestFlow. It is the first complete, end-to-end implementation of the Financial Intelligence Layer — with reduced protocol coverage, not reduced intelligence depth.

---

## Table of Contents

1. [MVP Philosophy](#1-mvp-philosophy)
2. [MVP Success Criteria](#2-mvp-success-criteria)
3. [What the MVP Validates](#3-what-the-mvp-validates)
4. [MVP Scope — What's In](#4-mvp-scope--whats-in)
5. [MVP Scope — What's Out](#5-mvp-scope--whats-out)
6. [MVP Architecture](#6-mvp-architecture)
7. [Onboarding & Identity (MVP)](#7-onboarding--identity-mvp)
8. [Module 1 — Portfolio Intelligence Engine (P0)](#8-module-1--portfolio-intelligence-engine-p0)
9. [Module 2 — Risk Intelligence Engine (P0)](#9-module-2--risk-intelligence-engine-p0)
10. [Module 3 — Yield & Opportunity Engine (P0)](#10-module-3--yield--opportunity-engine-p0)
11. [Module 4 — User Intelligence Engine (P1)](#11-module-4--user-intelligence-engine-p1)
12. [Module 5 — Strategy & Optimization Engine (P1)](#12-module-5--strategy--optimization-engine-p1)
13. [Module 6 — Basic Execution Engine (P1)](#13-module-6--basic-execution-engine-p1)
14. [Orchestration Layer (MVP)](#14-orchestration-layer-mvp)
15. [AI Copilot (P0)](#15-ai-copilot-p0)
16. [Supported Protocols (MVP)](#16-supported-protocols-mvp)
17. [MVP Data Sources](#17-mvp-data-sources)
18. [MVP APIs](#18-mvp-apis)
19. [MVP Dashboard Sections](#19-mvp-dashboard-sections)
20. [MVP User Journey](#20-mvp-user-journey)
21. [Build Priorities](#21-build-priorities)
22. [Definition of Done](#22-definition-of-done)
23. [Architecture Rules for MVP](#23-architecture-rules-for-mvp)

---

## 1. MVP Philosophy

The CrestFlow MVP is the **first complete implementation of the Financial Intelligence Layer** — not a stripped-down dashboard.

The MVP reduces scope through:
- **Fewer protocol integrations** — not fewer intelligence capabilities
- **No autonomous execution** — not no execution
- **Simplified identity flow** — not no identity

The intelligence depth must be full. A user who connects a wallet to the MVP should experience the complete CrestFlow value proposition:

- Understand their entire financial state
- See their risks explained
- Discover yield opportunities ranked by quality
- Receive actionable, explainable recommendations
- Execute supported actions
- Ask questions in natural language

**The intelligence layer is the product. The dashboard is only the interface.**

---

## 2. MVP Success Criteria

The MVP is successful when a user can complete the following **end-to-end**, without friction:

| # | Capability |
|---|---|
| 1 | Onboard and get a Turnkey embedded Algorand wallet created |
| 2 | Import complete portfolio (assets + protocol positions) |
| 3 | View portfolio intelligence (allocation, exposure, health score) |
| 4 | Understand portfolio risks (score, breakdown, vulnerabilities) |
| 5 | Discover yield opportunities (ranked by risk-adjusted APY) |
| 6 | Receive AI-generated, explainable recommendations |
| 7 | Simulate actions before committing |
| 8 | Execute supported actions with wallet approval |
| 9 | Ask questions in natural language and get sourced answers |
| 10 | Monitor portfolio changes continuously |

If all 10 exist, the MVP is complete.

---

## 3. What the MVP Validates

| Hypothesis | What We're Testing |
|---|---|
| **H1 — Intelligence > Dashboards** | Users prefer actionable intelligence over raw data displays |
| **H2 — AI Insight Value** | AI-generated portfolio insights meaningfully improve user decisions |
| **H3 — Risk Awareness** | Risk-aware recommendations change user behavior for the better |
| **H4 — Natural Language UX** | Natural language portfolio management is a materially better experience than manual DeFi navigation |
| **H5 — Platform Potential** | CrestFlow can become the financial operating system for Algorand |

---

## 4. MVP Scope — What's In

| Module | Priority | Notes |
|---|---|---|
| **Onboarding** — Auth + Embedded Wallet | P0 | Turnkey wallet is MVP priority |
| **KYC** (Veriff + GoPlausible DID/VC) | P1 | Optional for MVP; prod gate for execution |
| **Portfolio Intelligence Engine** | P0 | Full capabilities — canonical state layer |
| **Risk Intelligence Engine** | P0 | Full risk scoring and explainability |
| **Yield & Opportunity Engine** | P0 | Full discovery across MVP protocols |
| **User Intelligence Engine** | P1 | Required for personalized recommendations |
| **Strategy & Optimization Engine** | P1 | Rebalancing + yield optimization recommendations |
| **Basic Execution Engine** | P1 | Folks Finance actions + Tinyman swaps; no autopilot |
| **Policy Engine** | P1 | Mandatory execution guardrail |
| **Orchestrator / Planner** | P1 | Basic POA for supported execution flows |
| **Execution Coordinator** | P1 | Single-step and simple multi-step execution |
| **Haystack Router** | P1 | Folks Finance adapter + Tinyman adapter |
| **Gora Oracle** | P1 | Verified prices during execution |
| **AI Copilot** | P0 | Full natural language interface over all engines |
| **Copilot API** | P0 | x402-ready architecture; monetization optional at launch |
| **MCP-ready architecture** | P1 | Tools designed but MCP clients optional at launch |

---

## 5. MVP Scope — What's Out

These are explicitly deferred. **Do not build these for MVP.**

| Excluded | Deferred To |
|---|---|
| Autonomous execution / Autopilot | Phase 3 |
| Multi-agent orchestration | Phase 3 |
| Multi-chain support | Phase 3 |
| Institutional workflows | Phase 3 |
| Advanced treasury management | Phase 3 |
| Full compliance system (Sumsub) | Phase 3 |
| RWA protocol integrations | Phase 3 |
| Advanced agent-to-agent flows | Phase 3 |
| x402 live monetization | Phase 2 (APIs designed now; payments activated later) |

---

## 6. MVP Architecture

> Full architecture from `system-architecture.png` — MVP is a scoped subset. No temporary shortcuts. No MVP-only hacks. The architecture must be extensible to production scale from day one.

```
User (Google OAuth / Email+Password)
          │
          ▼
Onboarding & Identity
  ├── Turnkey Embedded Wallet          ← ★ MVP Priority
  ├── [Optional] Veriff KYC            ← configurable gate
  └── [Optional] GoPlausible DID + VC  ← if KYC completed
          │
          ▼
Portfolio State Analysis
(Algorand Indexer → auto-triggered post-onboarding)
          │
          ▼
──────────────────────────────────────────────────────────────
COPILOT API  (x402-ready; single public endpoint)
──────────────────────────────────────────────────────────────
          │
          ├── Financial Knowledge Layer
          │     ├── Algorand Indexer (on-chain data)
          │     ├── CoinGecko (market pricing)
          │     ├── Folks Finance API (protocol data)
          │     └── Tinyman API (protocol data)
          │
          ├── Engine 1: Portfolio Intelligence Engine  [P0]
          │     I: Holdings, Transactions, Positions
          │     O: Snapshot, Allocation, Exposure, Health Score
          │
          ├── Engine 2: Risk Intelligence Engine       [P0]
          │     I: Portfolio Snapshot, Market Data
          │     O: Risk Score, Concentration, Liquidity, Alerts
          │
          ├── Engine 3: Strategy & Optimization Engine [P1]
          │     I: Portfolio, Risk Profile, Goals
          │     O: Rebalancing Plan, Yield Plan, Strategy
          │
          ├── Engine 4: Yield & Opportunity Engine     [P0]
          │     I: APYs, TVL, Protocol Metrics
          │     O: Ranked Opportunities, Yield Insights
          │
          ├── Engine 5: User Intelligence Engine       [P1]
          │     I: Behavior, Goals, Preferences
          │     O: Investor Persona, Dynamic Risk Profile
          │
          └── Engine 6: Execution Engine (Basic)       [P1]
                I: Approved Action, Risk Limits
                O: Transaction, Simulation Result
          │
          ▼
Orchestration Layer (MVP subset)
  ├── Policy Engine       ← mandatory guardrail for all execution
  ├── Orchestrator        ← POA generation for supported actions
  └── Execution Coordinator  ← sequential step management
          │
          ▼
Haystack Router (MVP adapters only)
  ├── Gora Oracle         ← verified prices during execution
  ├── Folks Finance Adapter  ← supply, borrow, repay, withdraw
  └── Tinyman Adapter        ← swap
          │
          ▼
Wallet Signature (Turnkey — in-app signing)
          │
          ▼
Algorand Blockchain (fully auditable, instant finality)
```

---

## 7. Onboarding & Identity (MVP)

### Authentication

- Google OAuth — primary
- Email + Password — primary

### Embedded Wallet (★ P0 — Only Wallet)

- Turnkey wallet created on signup
- Non-custodial — private keys never touch CrestFlow servers
- Wallet address stored and linked to user account
- Sole transaction-signing wallet — all execution, x402 payments, and portfolio imports use this wallet

> External wallets (Pera, Defly, Lute) are excluded from the MVP and from the architecture entirely. External wallets cannot autonomously pay x402 fees.

### KYC (P1 — Optional for MVP, Production Gate)

- Veriff integration (500 free checks available)
- Document check + liveness + AML
- KYC status gates execution features — configurable as optional (MVP) or required (production)

### Identity (P1 — conditional on KYC)

- GoPlausible: DID generation + KYC VC issuance
- Chain: `wallet → did → vc`
- VC feeds into Policy Engine as authorization signal

### On-Ramp (P1)

- UPI on-ramp for wallet funding
- Required before a user can execute transactions

### Post-Onboarding (P0)

- Auto-triggered portfolio scan (Algorand Indexer)
- Discovers all holdings + Folks Finance + Tinyman positions
- Initializes all engines with user's financial state

---

## 8. Module 1 — Portfolio Intelligence Engine (P0)

**This is the foundation of the entire platform. Nothing else bypasses this layer.**

### Capabilities (all P0 for MVP)

| Capability | Detail |
|---|---|
| Asset discovery | Native ALGO + all ASA holdings |
| Position discovery | Folks Finance (supply/borrow) + Tinyman LP positions |
| Portfolio aggregation | Total value in USD and ALGO |
| Asset classification | Volatile / stablecoin / LP / yield-bearing |
| Allocation analysis | Per-asset, per-category, per-protocol |
| Exposure analysis | Direct + indirect (LP decomposition) |
| PnL tracking | Realized, unrealized, yield earned, fees paid |
| Cost basis tracking | FIFO / LIFO / Average Cost |
| Portfolio health scoring | 0–100 composite score with component breakdown |
| Portfolio insights | AI-generated, explainability-first insights |

### Required Outputs

- Portfolio Snapshot (canonical state — consumed by all other engines)
- Allocation Report (by asset, category, protocol)
- Exposure Report (direct + true indirect exposure)
- PnL Report
- Health Score (0–100 with per-component breakdown + strengths + weaknesses + actions)
- Portfolio Insights

### Data Sources

- Algorand Indexer (on-chain positions)
- CoinGecko (pricing)
- Folks Finance API (lending/borrowing positions)
- Tinyman API (LP positions)

### Key Constraint

**No downstream engine reads raw blockchain data.** Engine 1 is the sole source of normalized portfolio state.

---

## 9. Module 2 — Risk Intelligence Engine (P0)

**Every risk score must be explainable and decomposable. No black-box outputs.**

### Capabilities (all P0 for MVP)

| Capability | Detail |
|---|---|
| Portfolio risk score | Overall 0–100 risk score |
| Asset concentration analysis | HHI-based, flags over-concentration |
| Protocol concentration analysis | % of portfolio in each protocol |
| Liquidity analysis | Pool depth, exit feasibility |
| Protocol risk analysis | TVL health, smart contract risk scoring |
| Drawdown analysis | Max drawdown, current drawdown from ATH |
| Liquidation monitoring | Folks Finance borrow proximity to liquidation threshold |
| Risk alerts | Automatic alerts on threshold breach |

### Deferred to Phase 2

- Full stress testing (scenario modeling) — P2 (architecture ready, compute deferred)
- VaR / CVaR Monte Carlo — P2 (methods scaffolded; simplified version for MVP)
- Regime models — P2

### Required Outputs

- Risk Score (0–100) + component breakdown
- Concentration Report
- Liquidity Score
- Drawdown Metrics
- Liquidation proximity indicator (Folks Finance)
- Risk Alerts

### Key Constraint

Every risk score must surface: which factors drove it, what threshold was breached, and what the user should do about it.

---

## 10. Module 3 — Yield & Opportunity Engine (P0)

**Never rank by raw APY alone. Risk-adjusted ranking is the default.**

### Capabilities (all P0 for MVP)

| Capability | Detail |
|---|---|
| Folks Finance yield discovery | Lending pool APYs, available assets |
| Tinyman yield discovery | LP pool APYs, fee yields |
| Yield aggregation | Normalized APY comparison across protocols |
| Liquidity evaluation | Pool depth per opportunity |
| Protocol risk evaluation | Risk score applied to each opportunity |
| Sustainability scoring | Reward dependency and yield stability |
| Risk-adjusted ranking | Default sort — not raw APY |
| Idle capital detection | Flags assets earning no yield with specific suggestions |
| Personalization filter | Engine 5 risk profile filters/ranks opportunities for the user |

### Required Outputs

- Full opportunity list (Folks Finance + Tinyman)
- Ranked opportunities (risk-adjusted, user-filtered)
- Idle capital alerts
- Sustainability score per opportunity
- Yield Insights

### Key Constraint

The output the user sees by default is risk-adjusted ranking. Raw APY ranking is available as an alternate view.

---

## 11. Module 4 — User Intelligence Engine (P1)

**Required for personalized strategy and yield outputs. Must be live before Engine 5 can serve Engine 3.**

### Capabilities

| Capability | Priority |
|---|---|
| Onboarding persona questionnaire | P1 |
| Investor persona classification | P1 |
| Dynamic risk profile (from portfolio + behavior) | P1 |
| Goal capture (yield target, growth target, preservation) | P1 |
| Preference learning (recommendations accepted/rejected) | P2 — post-MVP |
| Goal progress tracking | P2 — post-MVP |

### MVP Persona Classifications

| Persona | Behavior |
|---|---|
| Conservative | Low volatility, stablecoin preference, capital preservation |
| Balanced | Moderate risk, mixed allocation |
| Growth | Higher volatility accepted, long-term upside focused |
| Aggressive | Maximum upside, high risk tolerance |
| Yield Seeker | Passive income optimization |

### Required Outputs

- Investor Persona (label + plain language explanation)
- Dynamic Risk Profile (risk tolerance band + concentration limits)
- Goal record

### Consumers

- Engine 2: personalizes risk alert thresholds
- Engine 3: aligns strategies to persona + goals
- Engine 4: filters opportunities by risk tolerance

---

## 12. Module 5 — Strategy & Optimization Engine (P1)

**Every recommendation must be explainable. No recommendation without justification.**

### Capabilities

| Capability | Priority |
|---|---|
| Portfolio rebalancing recommendations | P1 |
| Yield optimization recommendations | P1 |
| Capital deployment suggestions (idle capital) | P1 |
| Goal-based strategy generation | P1 |
| Expected outcome estimation | P1 |
| Recommendation explainability (reason, outcome, risk, confidence) | P0 — mandatory |
| Black-Litterman / HRP optimization | P2 — simplified model for MVP |

### MVP Strategy Types

| Strategy | Description |
|---|---|
| Rebalancing | Move assets to target allocation |
| Yield move | Deploy idle capital or move from lower to higher risk-adjusted yield |
| Risk reduction | Reduce concentration, liquidation risk, or protocol exposure |
| Goal alignment | Bring allocation in line with stated investor goal |

### Required Outputs

- Strategy recommendations (with full explainability)
- Rebalancing plan (specific asset moves)
- Yield optimization plan
- Expected outcome per recommendation (quantified)
- Confidence score per recommendation

### Key Constraint

Every output includes: **reason + expected outcome + risks + assumptions + confidence**. Non-negotiable. No recommendation ships without all five.

---

## 13. Module 6 — Basic Execution Engine (P1)

**No autonomous execution. Every action requires explicit user approval.**

### Supported Actions (MVP)

| Protocol | Action |
|---|---|
| Folks Finance | Supply asset to lending pool |
| Folks Finance | Borrow asset against collateral |
| Folks Finance | Repay borrowed amount |
| Folks Finance | Withdraw supplied assets |
| Tinyman | Swap token A for token B |

### Unsupported in MVP (Deferred)

| Action | Reason |
|---|---|
| Tinyman LP provision/withdrawal | Deferred — complexity; add in MVP+ |
| Pact swaps/LP | Deferred — Pact is MVP+ candidate |
| Autopilot / pre-authorized execution | Phase 3 only |
| Cross-protocol multi-step automation | Phase 3 only |

### Required Capabilities

| Capability | Detail |
|---|---|
| Execution plan generation | Human-readable POA before any signing |
| Transaction simulation | Estimated outcome + fees before submission |
| User approval workflow | User sees plan → approves → Policy Engine validates → executes |
| Transaction submission | Signed and submitted to Algorand |
| Confirmation monitoring | Awaits on-chain confirmation (instant finality on Algorand) |
| Audit log entry | Every execution logged immutably |
| Portfolio refresh trigger | Engine 1 re-runs post-execution |

---

## 14. Orchestration Layer (MVP)

> The full orchestration layer is built for MVP — but scoped to supported actions only. The architecture is extensible; adding Phase 2 flows requires only new Haystack Router adapters and updated POA logic — not architectural changes.

### Policy Engine (P1 — mandatory)

The Policy Engine is live and active in MVP. No execution bypasses it.

Validates for MVP:
- User approval confirmed
- Transaction policy not violated
- Risk limits not breached
- KYC status (if execution gate configured as required)

### Orchestrator / Planner (P1)

Generates the Plan of Action (POA) for supported execution flows.

MVP POA complexity: mostly single-step or simple two-step sequences.

### Execution Coordinator (P1)

Manages step sequencing for MVP actions. On failure: halts, surfaces state to user.

### Haystack Router (P1 — MVP adapters)

| Adapter | MVP Status |
|---|---|
| Folks Finance Adapter | ✓ Active |
| Tinyman Adapter | ✓ Active (swap only) |
| Pact Adapter | Deferred (MVP+ candidate) |
| Gora Oracle | P2 Stub (CoinGecko is MVP price source) |

### Key Rule

**Price source unavailable = execution halted, user notified.** Never execute with unverified prices. MVP uses CoinGecko with 5-minute staleness check. P2+ uses Gora Oracle for verified on-chain feeds.

---

## 15. AI Copilot (P0)

**The Copilot is not a chatbot. It is a natural language interface over all six engines.**

### Example Queries the Copilot Must Handle (MVP)

| Query | Routes To |
|---|---|
| "What is my biggest risk?" | Engine 2 |
| "Why is my portfolio health low?" | Engine 1 + Engine 2 |
| "Where can I earn more yield?" | Engine 4 |
| "How can I improve my diversification?" | Engine 3 |
| "Show my protocol exposure." | Engine 1 |
| "What happens if ALGO drops 30%?" | Engine 2 (simplified stress test) |
| "What is my allocation?" | Engine 1 |
| "Find me the safest yield opportunity." | Engine 4 |
| "Rebalance my portfolio." | Engine 3 → Engine 6 |
| "Move idle USDC to the best opportunity." | Engine 4 → Engine 6 |

### Response Requirements (non-negotiable)

Every Copilot response must include:
1. **Direct answer** — specifically answers the query
2. **Data + reasoning** — where the answer comes from
3. **Confidence level** — flagged when estimation is involved
4. **Assumptions** — what was assumed to produce the answer
5. **Suggested next action** — optional; e.g., "Would you like me to move the USDC?"

### Constraints

- AI must **never fabricate portfolio data**
- AI must **never invent financial figures** — all numbers come from engine outputs
- AI must **never hide uncertainty** — low-confidence outputs flagged explicitly
- Execution initiated via Copilot routes through Policy Engine — no shortcuts

---

## 16. Supported Protocols (MVP)

### Wallets

| Wallet | Status | Integration |
|---|---|---|
| **Turnkey (embedded)** | ✓ Primary | Turnkey SDK — sole transaction wallet |

> External wallets (Pera, Defly, Lute) are excluded. They cannot autonomously pay x402 fees and are not in the finalized architecture.

### Lending

| Protocol | Status | Actions |
|---|---|---|
| **Folks Finance** | ✓ Primary | Supply, Borrow, Repay, Withdraw |

### DEX

| Protocol | Status | Actions |
|---|---|---|
| **Tinyman** | ✓ Primary | Swap, LP position discovery (read-only) |
| **Pact** | MVP+ candidate | Deferred — add if timeline allows |

### Data & Oracle

| Provider | Status | Data Provided |
|---|---|---|
| **Algorand Indexer** | ✓ Active | On-chain balances, positions, transactions |
| **Gora Oracle** | P2 Stub | Deferred to P2. CoinGecko is the MVP price source. Gora stub returns null — execution uses CoinGecko with staleness checks |
| **CoinGecko** | ✓ Active | Market pricing, token metadata |
| **Folks Finance API** | ✓ Active | Lending/borrowing positions, pool APYs |
| **Tinyman API** | ✓ Active | LP positions, swap rates, pool APYs |

---

## 17. MVP Data Sources

| Source | Purpose | Priority |
|---|---|---|
| Algorand Indexer | All on-chain data — balances, ASAs, transactions, positions | P0 |
| CoinGecko | Portfolio valuation, token metadata, market data | P0 |
| Folks Finance API | Lending/borrowing positions, lending APYs | P0 |
| Tinyman API | LP positions, swap rates, pool APYs | P0 |
| Gora Oracle | Verified price feeds for execution pipeline | P2 (stub only in MVP; CoinGecko is MVP price source) |

**Intentionally excluded:** Additional oracle aggregators, external aggregators. Protocol data sourced directly from Folks Finance and Tinyman APIs.

---

## 18. MVP APIs

> All endpoints designed for future x402 monetization from day one. Monetization activation is Phase 2 — but the architecture accommodates it now.

### Portfolio (Engine 1)

| Method | Endpoint | Priority |
|---|---|---|
| GET | `/api/v1/portfolio/overview` | P0 |
| GET | `/api/v1/portfolio/allocation` | P0 |
| GET | `/api/v1/portfolio/exposure` | P0 |
| GET | `/api/v1/portfolio/health` | P0 |
| GET | `/api/v1/portfolio/pnl` | P1 |
| GET | `/api/v1/portfolio/performance` | P1 |

### Risk (Engine 2)

| Method | Endpoint | Priority |
|---|---|---|
| GET | `/api/v1/risk/score` | P0 |
| GET | `/api/v1/risk/concentration` | P0 |
| GET | `/api/v1/risk/liquidity` | P1 |
| GET | `/api/v1/risk/liquidation` | P1 |

### Yield (Engine 4)

| Method | Endpoint | Priority |
|---|---|---|
| GET | `/api/v1/yield/opportunities` | P0 |
| GET | `/api/v1/yield/rankings` | P0 |

### Strategy (Engine 3)

| Method | Endpoint | Priority |
|---|---|---|
| GET | `/api/v1/strategy/recommendations` | P1 |
| POST | `/api/v1/strategy/rebalance` | P1 |

### Execution (Engine 6)

| Method | Endpoint | Priority |
|---|---|---|
| POST | `/api/v1/execution/simulate` | P1 |
| POST | `/api/v1/execution/plan` | P1 |
| POST | `/api/v1/execution/execute` | P1 |

### User Intelligence (Engine 5)

| Method | Endpoint | Priority |
|---|---|---|
| GET | `/api/v1/profile` | P1 |
| GET | `/api/v1/persona` | P1 |
| PUT | `/api/v1/profile/goals` | P1 |

### Copilot

| Method | Endpoint | Priority |
|---|---|---|
| POST | `/api/v1/copilot/query` | P0 |

---

## 19. MVP Dashboard Sections

These are the required UI sections. Everything else is secondary and deferred.

| Section | Engine(s) | Priority |
|---|---|---|
| **Portfolio Overview** | Engine 1 | P0 |
| **Portfolio Health** | Engine 1 | P0 |
| **Asset Allocation** | Engine 1 | P0 |
| **Protocol Exposure** | Engine 1 | P0 |
| **Risk Analysis** | Engine 2 | P0 |
| **Yield Opportunities** | Engine 4 | P0 |
| **AI Copilot** | All engines | P0 |
| **Recommendations** | Engine 3 + 5 | P1 |
| **Execution Center** | Engine 6 | P1 |
| **Investor Profile** | Engine 5 | P1 |

---

## 20. MVP User Journey

**This flow must work end-to-end before MVP is considered complete.**

```
User Visits CrestFlow
          │
          ▼
Auth (Google OAuth or Email/Password)
          │
          ▼
Embedded Algorand Wallet Created (Turnkey)   ← ★ MVP Priority
          │
          ▼
[Optional] KYC → DID → VC (if configured)
          │
          ▼
Turnkey Embedded Wallet Active
          │
          ▼
Fund Wallet (existing assets or UPI on-ramp)
          │
          ▼
Auto Portfolio Scan
  ├── Algorand Indexer: native ALGO + ASA holdings
  ├── Folks Finance: supply + borrow positions
  └── Tinyman: LP positions
          │
          ▼
─────────── INTELLIGENCE LAYER ───────────
          │
          ├── Engine 1: Portfolio Snapshot + Health Score
          ├── Engine 2: Risk Score + Alerts
          ├── Engine 4: Yield Opportunities Ranked
          └── Engine 5: Investor Profile Built
          │
          ▼
AI Insights Generated (multi-engine synthesis)
          │
          ▼
User Reviews Dashboard
  ├── Portfolio overview and health
  ├── Risk breakdown and alerts
  ├── Yield opportunity rankings
  └── Proactive AI insights
          │
          ▼
User Interacts with AI Copilot
  └── Natural language queries answered with explainability
          │
          ▼
─────────── ORCHESTRATION LAYER ───────────
          │
          ▼
Engine 3: Strategy Recommendations
  └── Rebalancing plan / Yield optimization / Goal alignment
          │
          ▼
User Reviews + Approves Action
          │
          ▼
Policy Engine → Orchestrator → Execution Coordinator
  └── Haystack Router → (Gora Oracle + Folks / Tinyman adapter)
          │
          ▼
Wallet Signature → Algorand Blockchain
          │
          ▼
Portfolio Refresh (Engine 1 re-runs)
          │
          ▼
─────────── MONITORING LAYER ───────────
          │
          ▼
Continuous Background Monitoring
  ├── Risk threshold alerts (liquidation, concentration)
  └── Yield opportunity alerts (better APY, idle capital)
          │
          ▼
New Alerts + Insights Surfaced
          │
          ▼
Repeat Loop (continuous portfolio intelligence)
```

---

## 21. Build Priorities

### P0 — Must ship for MVP to be functional

- Auth + Turnkey embedded wallet creation
- Algorand Indexer integration
- Engine 1: Portfolio Intelligence (full capability)
- Engine 2: Risk Intelligence (full capability minus advanced stress testing)
- Engine 4: Yield & Opportunity (full capability, Folks + Tinyman)
- AI Copilot (natural language over Engines 1, 2, 4)
- Copilot API (REST endpoints for all P0 engines)
- Portfolio dashboard (Overview, Health, Allocation, Exposure, Risk, Yield)

### P1 — Must ship for MVP to demonstrate full value

- Engine 5: User Intelligence (persona + risk profile + goals)
- Engine 3: Strategy & Optimization (rebalancing + yield optimization)
- Engine 6: Basic Execution (Folks Finance + Tinyman swap)
- Policy Engine (mandatory before any P1 execution ships)
- Orchestrator + Execution Coordinator (basic POA for supported flows)
- Haystack Router (Folks + Tinyman adapters)
- Gora Oracle integration (P2 stub only — CoinGecko is MVP execution price source)
- KYC (Veriff) — optional user flow, configurable as gate
- GoPlausible DID/VC — conditional on KYC
- UPI on-ramp
- Execution Center dashboard section
- Recommendations dashboard section
- Investor Profile dashboard section

### P2 — Post-MVP, before Phase 2

- Pact integration (Haystack Router new adapter only)
- Tinyman LP provision/withdrawal execution
- Full stress testing (Monte Carlo, Bayesian scenarios)
- Advanced preference learning (Engine 5)
- Goal progress tracking
- x402 live monetization activation
- MCP tool interfaces
- DefiLlama integration (after direct protocol APIs are proven insufficient)

---

## 22. Definition of Done

The MVP is complete when a user can perform all of the following:

| # | Capability | Engine(s) |
|---|---|---|
| 1 | Sign up and get an embedded Algorand wallet created | Onboarding |
| 2 | Onboard with Turnkey embedded wallet and access portfolio | Onboarding |
| 3 | View complete portfolio: assets, LP positions, Folks Finance positions | Engine 1 |
| 4 | See portfolio health score with component breakdown | Engine 1 |
| 5 | See allocation and true exposure (including indirect LP exposure) | Engine 1 |
| 6 | See risk score with breakdown — understand why their portfolio is risky | Engine 2 |
| 7 | See liquidation proximity if they have Folks Finance borrows | Engine 2 |
| 8 | See yield opportunities ranked by risk-adjusted APY | Engine 4 |
| 9 | Receive AI-generated, explainable portfolio insights | Engine 1+2+4 |
| 10 | Receive explainable strategy recommendations | Engine 3+5 |
| 11 | Simulate a Folks Finance or Tinyman action before committing | Engine 6 |
| 12 | Execute a Folks Finance supply/borrow/repay/withdraw or Tinyman swap | Engine 6 |
| 13 | Ask any portfolio question in natural language and get a sourced answer | Copilot |
| 14 | Receive an alert when a risk threshold is breached | Engine 2 |
| 15 | Have portfolio refresh automatically after execution | Engine 1 |

At that point, CrestFlow has successfully validated the **Financial Intelligence Layer** thesis and is ready to expand to Phase 2 (Portfolio Orchestration).

---

## 23. Architecture Rules for MVP

These rules apply from day one — not after MVP.

| Rule | Applies in MVP |
|---|---|
| Engine 1 is the sole blockchain reader — no other engine reads Algorand Indexer directly | ✓ From day one |
| Policy Engine is mandatory for all execution — no bypass | ✓ From day one |
| No floating point for monetary values | ✓ From day one |
| No business logic in API controllers | ✓ From day one |
| Protocol adapters in Haystack Router only — no protocol logic in core engines | ✓ From day one |
| Every AI output includes reason, confidence, and assumptions | ✓ From day one |
| Every execution requires explicit user approval | ✓ From day one |
| Audit log for all execution events | ✓ From day one |
| Private keys never stored or accessed | ✓ From day one |
| Price source unavailable = halt execution (CoinGecko MVP, Gora P2+) | ✓ From day one |

> The reason these rules apply from MVP is simple: it is cheaper to build correctly once than to refactor a financial system that has users.
