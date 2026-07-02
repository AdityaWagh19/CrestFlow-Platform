# CrestFlow — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Product:** CrestFlow  
**Category:** AI-Native Financial Intelligence & Portfolio Orchestration Layer  
**Blockchain:** Algorand  
**Architecture Source of Truth:** `system-architecture.png`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Vision & Goals](#3-vision--goals)
4. [Target Users & Personas](#4-target-users--personas)
5. [Product Scope & Phases](#5-product-scope--phases)
6. [User Onboarding Flow](#6-user-onboarding-flow)
7. [Core Module Specifications](#7-core-module-specifications)
8. [Orchestration & Execution Layer](#8-orchestration--execution-layer)
9. [Key Features](#9-key-features)
10. [Algorand Ecosystem Integrations](#10-algorand-ecosystem-integrations)
11. [Functional Requirements](#11-functional-requirements)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Monetization Strategy](#13-monetization-strategy)
14. [MCP Strategy](#14-mcp-strategy)
15. [Success Metrics](#15-success-metrics)
16. [Roadmap](#16-roadmap)
17. [Constraints & Guardrails](#17-constraints--guardrails)

---

## 1. Executive Summary

CrestFlow is an AI-native financial intelligence and portfolio orchestration platform built on Algorand.

The platform transforms fragmented on-chain positions into actionable portfolio intelligence, personalized financial recommendations, and eventually autonomous financial execution — all through a unified AI copilot interface.

Rather than requiring users to manually navigate multiple DeFi protocols, lending platforms, DEXs, and yield venues, CrestFlow serves as a **unified financial operating system** that:

- Understands a user's complete on-chain financial state
- Analyzes risk across all positions and protocols
- Discovers yield opportunities ranked by risk-adjusted return
- Generates personalized portfolio strategies
- Executes approved actions through integrated Algorand protocols
- Adapts continuously through behavioral learning

The long-term objective is to become the **canonical financial intelligence and orchestration layer** for the Algorand ecosystem.

---

## 2. Problem Statement

DeFi remains operationally complex and intellectually demanding for most users.

### User Pain Points

| Pain Point | Current State |
|---|---|
| **Fragmented capital** | Assets spread across Folks Finance, Tinyman, Pact, and native holdings with no unified view |
| **Limited portfolio visibility** | No cross-protocol aggregation of value, yield, or exposure |
| **Risk opacity** | Users cannot quantify concentration, liquidation, or protocol risk |
| **Poor yield discovery** | Comparing APYs across protocols is manual and error-prone |
| **No actionable intelligence** | Dashboards show data; nothing tells users what to *do* |
| **Complex execution** | Multi-step, multi-protocol actions require deep technical knowledge |
| **Behavioral blind spots** | No system learns from user preferences to improve recommendations |

### The Core Gap

Most platforms provide **dashboards**.  
Very few provide **intelligence**.

Users know what they own. They do not know:

- What risks they are actually taking
- Whether their portfolio is efficiently deployed
- What opportunities exist right now
- What specific actions would improve their position
- How to execute those actions safely

CrestFlow fills this gap entirely.

---

## 3. Vision & Goals

### Vision

> *Create the financial intelligence layer for Algorand — where every user, agent, and institution can understand, optimize, and execute across their entire on-chain financial state through a single, AI-native interface.*

### Product Goals

| Goal | Description |
|---|---|
| **G1 — Intelligence** | Provide institutional-grade portfolio analytics for retail users |
| **G2 — Unification** | Create a unified financial view across all Algorand protocols |
| **G3 — Explainability** | Enable AI-driven recommendations that are always transparent and explainable |
| **G4 — Simplification** | Reduce portfolio management complexity to natural language interactions |
| **G5 — Infrastructure** | Build programmable financial infrastructure accessible via APIs and MCP |
| **G6 — Monetization** | Create sustainable revenue through tiered subscriptions and x402 API payments |

---

## 4. Target Users & Personas

### Persona 1 — Crypto-Native Professional *(Primary)*

**Age:** 25–35  
**Volume:** Primary addressable market at launch

| Attribute | Detail |
|---|---|
| **Holdings** | Algorand-native assets, some majors (BTC, ETH bridged) |
| **Behavior** | Uses 2–4 protocols simultaneously; checks portfolio 1–3x/week |
| **Goal** | Passive yield with portfolio visibility |
| **Pain** | Fragmented positions, risk uncertainty, slow opportunity discovery |
| **Willingness to pay** | Pro tier ($15–30/month); x402 API usage |

**Jobs to be done:**
- See my entire portfolio in one place
- Know if I'm taking too much risk
- Find where I can earn more without doing manual research
- Get told what to do, not just shown data

---

### Persona 2 — Advanced DeFi User *(Secondary)*

| Attribute | Detail |
|---|---|
| **Activity** | Active LP, multi-protocol yield optimizer, lending protocol participant |
| **Goal** | Capital efficiency and yield maximization |
| **Pain** | Position complexity, IL tracking, sub-optimal capital allocation |
| **Willingness to pay** | Premium tier; high API usage volume |

**Jobs to be done:**
- Understand true impermanent loss across LP positions
- Find rebalancing opportunities before capital sits idle
- Run stress tests against market scenarios
- Access engine APIs directly for automation

---

### Persona 3 — Institutional Portfolio Manager *(Future — Phase 3)*

| Examples | DAO Treasury, Family Office, Fund Manager, Fintech App |
|---|---|
| **Requirement** | Programmatic API access, MCP integration, audit trails |
| **Willingness to pay** | Enterprise pricing; high x402 volume |

---

## 5. Product Scope & Phases

### Phase 1 — Financial Intelligence Layer

**Status:** Active Build  
**Focus:** Portfolio visibility, analytics, risk, and yield discovery

Deliverables:
- User onboarding with embedded Algorand wallet (Turnkey)
- KYC infra (Veriff + GoPlausible DID/VC) — optional for MVP, required for production gate
- Portfolio Intelligence Engine (Engine 1)
- Risk Intelligence Engine (Engine 2)
- Yield & Opportunity Engine (Engine 4)
- User Intelligence Engine (Engine 5)
- AI Copilot interface
- Copilot API with free + x402-paid tiers

---

### Phase 2 — Portfolio Orchestration Layer

**Focus:** Strategy, optimization, and orchestrated execution

Deliverables:
- Strategy & Optimization Engine (Engine 3)
- Policy Engine (guardrails for execution)
- Orchestrator / Planner
- Execution Coordinator
- Haystack Router
- Rebalancing and allocation workflows

---

### Phase 3 — Autonomous Financial Layer

**Focus:** Agent-driven autonomous execution and institutional access

Deliverables:
- Autonomous Execution Engine (Engine 6) — full autopilot mode
- Multi-agent orchestration workflows
- MCP-native tool exposure
- Cross-protocol capital allocation
- Institutional API tier
- x402 ecosystem at full scale

---

## 6. User Onboarding Flow

> Grounded in `system-architecture.png`. The embedded Algorand wallet is the **MVP priority**.

```
User Onboarding
└── Google OAuth  ← MVP only (Email/Password deferred post-MVP)
        │
        ▼
Platform User Created & Authenticated
        │
        ▼
Turnkey User Created (Backend)
        │
        ▼
Embedded Algorand Wallet Created         ← ★ MVP Priority
        │
        ▼
Wallet Address Stored & Linked to User Account
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  KYC Infra  ← Optional for MVP; Production Gate        │
│                                                         │
│  1. Veriff KYC (500 free checks)                        │
│  2. Document Check (Aadhaar/PAN) + Liveness + AML       │
│  3. Generate DID & Issue KYC Verifiable Credential (VC) │
│  4. Link VC to DID                                      │
│  5. DID connected to Wallet (wallet → did → vc)         │
└─────────────────────────────────────────────────────────┘
        │
        ▼
Fund Wallet
└── Add Money via UPI On-Ramp
        │
        ▼
Portfolio State Analysis
(Existing Assets, Holdings, Positions)
★ Base data feed for all six engines
```

### Onboarding Requirements

| Requirement | Detail |
|---|---|
| **Wallet creation** | Non-custodial via Turnkey; user retains key ownership |
| **KYC gate** | Veriff integration; 500 free checks in early phase |
| **Identity** | GoPlausible for DID issuance and VC management |
| **On-ramp** | UPI supported at launch |
| **Portfolio scan** | Auto-triggered post-onboarding; feeds all engines |

---

## 7. Core Module Specifications

> CrestFlow has **6 core engines**. Each engine corresponds to a bundled x402-enabled API group.  
> All engines are accessed via the **Copilot API** — the single public endpoint that routes internally.  
> All engines consume from the **Financial Knowledge Layer** as shared data foundation.

---

### Financial Knowledge Layer *(Shared Foundation)*

Consumed by all engines. Not a user-facing module.

| Data Type | Sources |
|---|---|
| Live market data | CoinGecko |
| Protocol data (TVL, APYs, liquidity) | Folks Finance API, Tinyman API, Pact API |
| On-chain data | Algorand Indexer |
| Price feeds | Gora Oracle |
| Historical data | Algorand Indexer, CoinGecko |
| Risk data | Internal models |
| Research data | Internal heuristics |

---

### Engine 1 — Portfolio Intelligence Engine

**Purpose:** Convert raw on-chain positions into normalized portfolio intelligence. This is the canonical financial state output consumed by all other engines.

| Attribute | Detail |
|---|---|
| **Input** | Holdings, Transactions, Positions (from Algorand Indexer) |
| **Output** | Health Score, Diversification metrics, Performance attribution |
| **SOTA Methods** | Factor Analysis, Performance Attribution Models |
| **Sample APIs** | `GET /analyze`, `GET /health`, `GET /performance` |

**Capabilities:**
- Asset discovery across native holdings and protocol positions
- Portfolio value aggregation in USD and ALGO
- Allocation and exposure analysis (asset, protocol, stablecoin, LP)
- Performance tracking and PnL calculation
- Cost basis tracking
- Portfolio health scoring (0–100)
- Insight generation

**Outputs delivered to user:**
- Portfolio overview dashboard
- Allocation breakdown
- Exposure map
- Performance analytics
- Health score with explanations

---

### Engine 2 — Risk Intelligence Engine

**Purpose:** Measure, monitor, and explain portfolio risk.

| Attribute | Detail |
|---|---|
| **Input** | Portfolio state, Market data, Protocol data |
| **Output** | Risk Score, VaR, CVaR, Liquidation Risk indicators |
| **SOTA Methods** | Monte Carlo simulation, Bayesian models, Regime models |
| **Sample APIs** | `POST /risk/stress-test`, `GET /risk/liquidation` |

**Capabilities:**
- Portfolio risk scoring
- Concentration risk analysis
- Protocol-specific risk scoring
- Liquidity analysis
- Drawdown analysis
- Stress testing against market scenarios
- Scenario modeling (e.g., ALGO drops 40%)
- Liquidation proximity monitoring for lending positions

**Outputs delivered to user:**
- Risk Score (0–100)
- Active risk alerts
- Portfolio vulnerabilities list
- Stress test results

---

### Engine 3 — Strategy & Optimization Engine

**Purpose:** Generate data-driven portfolio strategies.

| Attribute | Detail |
|---|---|
| **Input** | Goals, Risk profile (from Engine 5), Portfolio state (from Engine 1) |
| **Output** | Allocation plan, Rebalancing plan, Strategy narrative |
| **SOTA Methods** | Black-Litterman, Hierarchical Risk Parity (HRP), Risk Parity |
| **Sample APIs** | `GET /strategy/allocation`, `POST /strategy/rebalance` |

**Capabilities:**
- Asset allocation recommendations
- Rebalancing plans with specific actions
- Goal-based strategy generation
- Risk-adjusted portfolio optimization
- Strategy explainability (why + expected outcome + risk + confidence)

**Outputs delivered to user:**
- Recommended strategy plans
- Specific rebalancing actions
- Expected outcome estimates
- Risk impact of each recommendation

---

### Engine 4 — Yield & Opportunity Engine

**Purpose:** Discover and evaluate yield opportunities across Algorand protocols.

| Attribute | Detail |
|---|---|
| **Input** | APYs, TVL, Liquidity metrics, Protocol performance data |
| **Output** | Ranked opportunity list, Best yield recommendations |
| **SOTA Methods** | Risk-Adjusted Yield Scoring |
| **Sample APIs** | `GET /yield/opportunities`, `GET /yield/rankings`, `POST /yield/optimize` |

**Capabilities:**
- Yield aggregation across Folks Finance, Tinyman, Pact
- APY comparison and normalization
- Opportunity ranking by raw yield and risk-adjusted yield
- Yield sustainability analysis
- Idle capital detection
- Personalized yield recommendations (filtered by user risk profile)

**Outputs delivered to user:**
- Yield opportunity rankings
- Best risk-adjusted opportunities
- Idle capital alerts with suggestions

---

### Engine 5 — User Intelligence Engine

**Purpose:** Build, maintain, and evolve a dynamic investor profile for each user. Personalizes all other engine outputs.

| Attribute | Detail |
|---|---|
| **Input** | User behavior, Goals, Stated and revealed preferences |
| **Output** | Investor Persona, Dynamic Risk Profile |
| **SOTA Methods** | Behavioral Finance models, Preference Learning |
| **Sample APIs** | `GET /profile`, `GET /preferences`, `GET /persona` |

**Capabilities:**
- Investor persona classification (conservative, balanced, aggressive)
- Dynamic risk profile updates based on behavior
- Goal tracking (yield target, portfolio growth, risk tolerance)
- Preference learning from user interactions and accepted/rejected recommendations
- Personalization signals passed to all other engines

**Outputs delivered to user:**
- Investor persona card
- Risk tolerance profile
- Goal progress tracking

---

### Engine 6 — Autonomous Execution Engine

**Purpose:** Execute approved portfolio actions through integrated Algorand protocols.

| Attribute | Detail |
|---|---|
| **Input** | Strategy plan, Goals, Risk limits (from Policy Engine) |
| **Output** | Execution plan, Signed transactions, Autopilot status |
| **SOTA Methods** | Intent routing, Agentic execution patterns |
| **Sample APIs** | `POST /execute`, `POST /execution-plan`, `POST /autopilot` |

**Capabilities:**
- Transaction preparation and simulation
- Multi-step protocol routing via Haystack Router
- Execution plan generation (human-reviewable before execution)
- Autopilot mode for pre-authorized recurring actions (Phase 3)
- Transaction result tracking and audit log

**Guardrail:** Engine 6 **never executes** without explicit user authorization routed through the Policy Engine. No autonomous execution without approval.

---

## 8. Orchestration & Execution Layer

> From `system-architecture.png`. This layer coordinates all approved execution across protocols.

### Architecture

```
Copilot API Request (execution intent)
        │
        ▼
x402 Payment Check → Goplus Facilitator (settles & tracks payment)
        │
        ▼
Policy Engine
  - Validates user approval rules
  - Checks transaction policies
  - Enforces risk limits
  - Enforces execution limits
  - Creates guardrails
        │
        ▼
Orchestrator / Planner
  - Determines Plan of Action (POA)
  - Sets execution order across protocols
        │
        ▼
Execution Coordinator
  - Coordinates multi-step, multi-protocol transactions
        │
        ▼
Haystack Router
  - Routes to correct protocol adapter
        │
        ├── Gora Oracle (price feeds & verified external data)
        ├── Folks Finance (Lending pools)
        ├── Tinyman (DEX and LP)
        ├── Pact (DEX and LP)
        └── Future Protocols (Yield protocols, RWAs)
                  │
                  ▼
        Wallet Transactions on Algorand Blockchain
        (Fully auditable, instant finality)
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **Policy Engine** | Approval guardrails. No transaction proceeds without passing policy checks. Enforces risk limits and execution constraints set by user. |
| **Orchestrator / Planner** | Decides the Plan of Action — which protocols to use, in what order, with what parameters |
| **Execution Coordinator** | Coordinates multi-protocol execution sequences; handles dependencies and failure recovery |
| **Haystack Router** | Selects and routes to the correct protocol adapter for each action |
| **Gora Oracle** | Provides verified price feeds and external data to the execution pipeline |

---

## 9. Key Features

### 9.1 Portfolio Health Score

A single 0–100 score representing overall portfolio quality.

**Input components:**

| Component | Weight (indicative) |
|---|---|
| Diversification | 20% |
| Concentration risk | 20% |
| Liquidity adequacy | 15% |
| Risk-adjusted yield | 20% |
| Yield sustainability | 15% |
| Protocol quality | 10% |

**Output:** Numerical score + qualitative grade + per-component breakdown + top improvement actions

---

### 9.2 Exposure Analysis

Reveals the true underlying exposure of a portfolio, including indirect exposure through LP positions and protocol holdings.

**Exposure types surfaced:**

| Type | Example |
|---|---|
| Asset exposure | Direct ALGO, USDC, ALGO-wrapped assets |
| Protocol exposure | % of portfolio in Folks Finance vs. Tinyman vs. native |
| Stablecoin exposure | Effective % of portfolio in stable vs. volatile assets |
| LP exposure | Underlying asset composition of LP positions |
| Indirect exposure | "72% of your portfolio is indirectly exposed to ALGO" |

---

### 9.3 Risk Analysis

Quantifies and explains all material portfolio risks.

| Risk Type | Description |
|---|---|
| Concentration risk | Overexposure to single asset or protocol |
| Liquidity risk | Capital locked in illiquid positions |
| Protocol risk | Smart contract, TVL, or team-related protocol risk |
| Market risk | Sensitivity to broad market drawdowns |
| Liquidation risk | Proximity to Folks Finance liquidation thresholds |

---

### 9.4 Yield Discovery

Surfaces yield opportunities ranked and filtered for the user's risk profile.

**Ranking dimensions:**
- Raw APY
- Risk-adjusted APY
- Yield sustainability score
- Protocol trust score
- Liquidity depth

**User outputs:**
- Top opportunities with full breakdown
- Comparison vs. user's current yield
- Estimated gain from reallocation

---

### 9.5 AI Insights

Proactive, explainable insights generated by the AI Copilot layer.

**Examples:**

> *"72% of your portfolio is indirectly exposed to ALGO. A 40% ALGO drawdown would reduce your portfolio value by approximately $X."*

> *"45% of your returns over the past 30 days came from Folks Finance lending rewards. This yield source has shown declining sustainability — here's why."*

> *"You have $420 in idle USDC. Moving it to [opportunity] would generate an estimated 8.4% APY with your current risk tolerance."*

> *"Your portfolio concentration in a single protocol creates elevated liquidation risk. Here are three actions to reduce it."*

All insights include:
- The observation
- The data behind it
- The implication
- Optional: suggested action

---

### 9.6 AI Copilot Interface

Natural language interface routing queries to the appropriate engine(s).

**Example query routing:**

| Query | Routed To |
|---|---|
| "What is my portfolio risk?" | Risk Intelligence Engine |
| "Find safer yield opportunities" | Yield & Opportunity Engine |
| "How can I improve my returns?" | Strategy & Optimization Engine |
| "Rebalance my portfolio" | Strategy Engine → Execution Engine |
| "Move idle USDC to best opportunity" | Full orchestration pipeline |
| "What's my ALGO exposure?" | Portfolio Intelligence Engine |
| "Am I close to liquidation?" | Risk Intelligence Engine |

**AI output requirements (all responses must include):**
- Direct answer to the query
- Data and reasoning behind the answer
- Confidence level (where applicable)
- Assumptions made
- Suggested next action (optional)

---

## 10. Algorand Ecosystem Integrations

### Wallets

| Wallet | Integration Type | Status |
|---|---|---|
| Embedded Smart Wallet | Turnkey (built-in) | Phase 1 — MVP Priority |

> External wallets (Pera, Defly, Lute) are excluded. They do not support autonomous x402 payments and are not in the finalized architecture. All transactions go through the Turnkey embedded wallet.

### Protocols

| Protocol | Type | Status |
|---|---|---|
| Folks Finance | Lending pools | Phase 1 |
| Tinyman | DEX and LP | Phase 1 |
| Pact | DEX and LP | Phase 1 |
| Future Protocols | Yield protocols, RWAs | Phase 3 |

### Data Sources

| Source | Data Provided | Status |
|---|---|---|
| Algorand Indexer | On-chain transactions, balances, positions | Phase 1 |
| Gora Oracle | Verified price feeds, external data | Phase 1 |
| CoinGecko | Market pricing and token metadata | Phase 1 |
| Folks Finance API | Lending/borrowing positions, pool APYs | Phase 1 |
| Tinyman API | LP positions, swap rates, pool APYs | Phase 1 |
| Pact API | LP positions, pool APYs | Phase 1 |

> DefiLlama is not in the finalized architecture. Protocol data is sourced directly from protocol APIs.

### Identity & Compliance

| Provider | Role | Status |
|---|---|---|
| Veriff | KYC — document + liveness + AML | Phase 1 (optional MVP, prod gate) |
| GoPlausible | DID issuance, VC management, x402 facilitator | Phase 1 |

---

## 11. Functional Requirements

### FR-01: Portfolio Analytics

| ID | Requirement |
|---|---|
| FR-01.1 | System must discover all native Algorand asset holdings for a connected wallet |
| FR-01.2 | System must discover active positions in Folks Finance (lending/borrowing) |
| FR-01.3 | System must discover LP positions in Tinyman and Pact |
| FR-01.4 | System must calculate total portfolio value in USD and ALGO |
| FR-01.5 | System must calculate asset allocation percentages |
| FR-01.6 | System must calculate true exposure including indirect LP exposure |
| FR-01.7 | System must calculate PnL and performance attribution |
| FR-01.8 | System must generate a Portfolio Health Score (0–100) with per-component breakdown |

### FR-02: Risk Analytics

| ID | Requirement |
|---|---|
| FR-02.1 | System must generate a portfolio-level risk score |
| FR-02.2 | System must identify and quantify concentration risk |
| FR-02.3 | System must analyze liquidity of all portfolio positions |
| FR-02.4 | System must assess protocol-level risk for all integrated protocols |
| FR-02.5 | System must monitor liquidation proximity for Folks Finance positions |
| FR-02.6 | System must support stress testing against configurable market scenarios |

### FR-03: Yield Analytics

| ID | Requirement |
|---|---|
| FR-03.1 | System must aggregate yield opportunities across all integrated protocols |
| FR-03.2 | System must calculate and normalize APYs for comparison |
| FR-03.3 | System must rank opportunities by risk-adjusted yield |
| FR-03.4 | System must detect idle capital and suggest yield opportunities |
| FR-03.5 | System must filter opportunities based on user risk profile from Engine 5 |

### FR-04: Strategy Generation

| ID | Requirement |
|---|---|
| FR-04.1 | System must generate asset allocation recommendations |
| FR-04.2 | System must generate rebalancing plans with specific, executable actions |
| FR-04.3 | System must support goal-based strategy generation |
| FR-04.4 | System must explain every recommendation (rationale, expected return, risk, confidence) |
| FR-04.5 | System must estimate expected outcomes for each strategy |

### FR-05: Execution

| ID | Requirement |
|---|---|
| FR-05.1 | System must generate a human-readable execution plan before any transaction |
| FR-05.2 | System must route transactions through the Policy Engine before execution |
| FR-05.3 | System must simulate transactions before submission |
| FR-05.4 | System must route protocol actions through the Haystack Router |
| FR-05.5 | System must never execute without explicit user approval |
| FR-05.6 | System must maintain an audit log of all executed actions |

### FR-06: User Intelligence

| ID | Requirement |
|---|---|
| FR-06.1 | System must build and maintain a dynamic risk profile per user |
| FR-06.2 | System must classify users into investor personas |
| FR-06.3 | System must update persona based on behavioral signals |
| FR-06.4 | System must pass personalization signals to all other engines |

### FR-07: AI Copilot

| ID | Requirement |
|---|---|
| FR-07.1 | System must accept natural language queries |
| FR-07.2 | System must route queries to the appropriate engine(s) |
| FR-07.3 | System must return explainable, sourced answers |
| FR-07.4 | System must surface confidence levels and assumptions |
| FR-07.5 | System must support multi-turn conversations |

### FR-08: Onboarding

| ID | Requirement |
|---|---|
| FR-08.1 | System must support Google OAuth authentication (Email/Password deferred post-MVP) |
| FR-08.2 | System must create an embedded Algorand wallet via Turnkey on signup |
| FR-08.3 | System must store wallet address linked to user account |
| FR-08.4 | System must support KYC via Veriff (document + liveness + AML; required before execution) |
| FR-08.5 | System must issue a DID and KYC Verifiable Credential via GoPlausible post-KYC |
| FR-08.6 | System must support UPI on-ramp for wallet funding (INR → USDC/ALGO via Transak/Ramp) |
| FR-08.7 | System must auto-trigger portfolio scan post-onboarding |
| FR-08.8 | System must support UPI off-ramp for fund withdrawal (USDC/ALGO → INR via same provider; KYC required) |

---

## 12. Non-Functional Requirements

### Performance

| Requirement | Target |
|---|---|
| Portfolio load time | < 3 seconds (P95) |
| Insight generation | < 5 seconds (P95) |
| Risk score calculation | < 3 seconds (P95) |
| Copilot query response | < 5 seconds (P95) |
| Transaction simulation | < 2 seconds (P95) |

### Scalability

| Requirement | Detail |
|---|---|
| Multi-user architecture | System must handle concurrent users without degradation |
| Protocol-agnostic design | Adding new protocols must not require engine redesign |
| Horizontal scalability | All engines must be independently scalable |
| Independent deployability | Each engine must be deployable without impacting others |

### Reliability

| Requirement | Detail |
|---|---|
| Graceful degradation | If one engine fails, others must continue functioning |
| Fault tolerance | Protocol data source failures must not crash portfolio views |
| Retry logic | All external API calls must implement retry with backoff |

### Security

| Requirement | Detail |
|---|---|
| Non-custodial | CrestFlow never holds private keys; Turnkey model enforced |
| User-controlled execution | All transactions require explicit user approval |
| Wallet security | Turnkey non-custodial architecture; no private keys on CrestFlow servers |
| Policy enforcement | Policy Engine acts as mandatory guardrail for all execution |
| Data encryption | All user data encrypted at rest and in transit |

### Architecture Principles

| Principle | Requirement |
|---|---|
| Modular | Every engine independently deployable |
| Event-driven | Engines communicate through defined contracts, not internal coupling |
| API-first | All capabilities exposed as APIs before UI |
| MCP-compatible | All engines accessible from external AI agents |
| Multi-agent ready | Architecture supports autonomous agent orchestration (Phase 3) |
| Protocol-agnostic | Engine internals do not depend on specific protocol implementations |

---

## 13. Monetization Strategy

> **Implementation Reference:** See `plans/11-x402-gateway-policy.md` for the definitive endpoint pricing table and facilitator configuration.

### Primary Model — x402 Per-Call Micropayments

The MVP monetization model is **x402 per-call payments** settled in USDC on Algorand via Goplusfable Facilitator. No subscription required. Users pay only for what they compute.

| Tier | Price (USDC) | What It Covers |
|---|---|---|
| **Read** | Free | All snapshot reads, history, status polls, safety actions |
| **Micro** | $0.005 | Portfolio chain scan (`/portfolio/refresh`) |
| **Standard** | $0.01 | Risk/yield simulate, copilot query, risk report |
| **Premium** | $0.02–$0.03 | Strategy simulate/refresh, execution simulate, autopilot enable |
| **Execution** | $0.05–$0.10 | Execution plan ($0.05) + execution submit ($0.10) |
| **Export** | $0.05 | Audit log JSONL export |

**13 paid endpoints / 42 free endpoints** across all engines.

### Future — Subscription Tier (Phase 2)

Once usage patterns are established, a subscription tier may be introduced as a convenience bundle over x402 per-call credits:

| Tier | Price | Capabilities |
|---|---|---|
| **Free** | $0/month | All read endpoints, portfolio health |
| **Pro** | $15–30/month | Bundle of x402 credits for standard use |
| **Premium** | $50–100/month | High-volume credit bundle + priority access |

### x402 API Monetization

Every engine exposes x402-enabled API endpoints. Payment is settled via **GoPlausible Facilitator**.

**Portfolio APIs**

| Endpoint | Type |
|---|---|
| `GET /portfolio/overview` | Paid |
| `GET /portfolio/allocation` | Paid |
| `GET /portfolio/exposure` | Paid |
| `GET /portfolio/performance` | Paid |
| `GET /portfolio/health` | Free (rate-limited) |

**Risk APIs**

| Endpoint | Type |
|---|---|
| `GET /risk/score` | Paid |
| `POST /risk/stress-test` | Paid |
| `GET /risk/protocol-analysis` | Paid |
| `GET /risk/liquidation` | Paid |

**Yield APIs**

| Endpoint | Type |
|---|---|
| `GET /yield/opportunities` | Paid |
| `GET /yield/rankings` | Paid |
| `POST /yield/optimize` | Paid |

**Strategy APIs**

| Endpoint | Type |
|---|---|
| `GET /strategy/recommendations` | Paid |
| `POST /strategy/rebalance` | Paid |
| `GET /strategy/allocation` | Paid |

**Execution APIs**

| Endpoint | Type |
|---|---|
| `POST /execute` | Paid |
| `POST /execution-plan` | Paid |
| `POST /autopilot` | Paid (Phase 3) |

**User Intelligence APIs**

| Endpoint | Type |
|---|---|
| `GET /profile` | Paid |
| `GET /preferences` | Paid |
| `GET /persona` | Paid |

### Payment Flow

```
API Request
    → x402 payment check
    → GoPlausible Facilitator (settle & track)
    → Engine executes
    → Response returned
```

---

## 14. MCP Strategy

CrestFlow will expose all intelligence engines through MCP-compatible interfaces to enable external AI agents to access financial intelligence natively.

### Target Integrations

| Platform | Status |
|---|---|
| Claude (Anthropic) | Phase 2 |
| ChatGPT | Phase 2 |
| Cursor / Windsurf | Phase 2 |
| External agent frameworks | Phase 3 |

### MCP-Exposed Capabilities

| Tool | Description |
|---|---|
| `query_portfolio` | Query portfolio state for a wallet address |
| `analyze_risk` | Run risk analysis on a portfolio |
| `discover_yield` | Discover yield opportunities filtered by risk profile |
| `generate_strategy` | Generate allocation or rebalancing strategy |
| `create_execution_plan` | Generate execution plan for a strategy |
| `execute_action` | Execute an approved portfolio action (with user auth) |

---

## 15. Success Metrics

### User Metrics

| Metric | Target (Phase 1) |
|---|---|
| Monthly Active Users (MAU) | 500 at 3 months |
| Retention Rate (30-day) | > 40% |
| Portfolio Connections | 1+ per active user |
| Onboarding Completion Rate | > 70% |

### Product Metrics

| Metric | Target (Phase 1) |
|---|---|
| Insights generated per user/week | > 5 |
| Recommendations accepted rate | > 25% |
| Assets Under Analysis (AUA) | Growing MoM |
| Copilot queries per session | > 2 |

### Business Metrics

| Metric | Target |
|---|---|
| Monthly Recurring Revenue (MRR) | Growing from Month 1 |
| API Revenue | Activated Phase 2 |
| x402 Transaction Volume | Growing with ecosystem adoption |
| Pro tier conversion | > 15% of active free users |

---

## 16. Roadmap

### Phase 1 — Financial Intelligence Layer *(Active)*

| Milestone | Deliverable |
|---|---|
| M1 | User auth + embedded wallet (Turnkey) |
| M2 | Portfolio Intelligence Engine live |
| M3 | Risk Intelligence Engine live |
| M4 | Yield & Opportunity Engine live |
| M5 | User Intelligence Engine live |
| M6 | AI Copilot (natural language queries over Engines 1, 2, 4, 5) |
| M7 | Copilot API with x402 endpoints |
| M8 | KYC infra (Veriff + GoPlausible) |

### Phase 2 — Portfolio Orchestration Layer

| Milestone | Deliverable |
|---|---|
| M9 | Strategy & Optimization Engine (Engine 3) |
| M10 | Policy Engine + Orchestrator / Planner |
| M11 | Execution Coordinator + Haystack Router |
| M12 | Rebalancing and strategy execution workflows |
| M13 | MCP tool exposure (Phase 2 capabilities) |

### Phase 3 — Autonomous Financial Layer

| Milestone | Deliverable |
|---|---|
| M14 | Autonomous Execution Engine (Engine 6) — Autopilot mode |
| M15 | Multi-agent orchestration |
| M16 | Cross-protocol autonomous capital allocation |
| M17 | Institutional API tier |
| M18 | Full MCP ecosystem |

---

## 17. Constraints & Guardrails

### AI Constraints

| Rule | Detail |
|---|---|
| **No silent execution** | AI must never execute transactions without explicit user authorization |
| **No hidden assumptions** | All AI outputs must surface assumptions made |
| **No unexplained recommendations** | Every recommendation must include rationale, expected return, risk, and confidence |
| **Confidence required** | AI responses must indicate confidence level where applicable |

### Technical Constraints

| Constraint | Detail |
|---|---|
| **Engine isolation** | No engine may directly depend on another engine's internal implementation |
| **Contract-based communication** | Engines communicate only through defined output schemas |
| **Policy Engine is mandatory** | All execution actions must pass through Policy Engine before routing |
| **Non-custodial** | CrestFlow never stores or accesses user private keys |

### Regulatory Constraints

| Constraint | Detail |
|---|---|
| **KYC gate** | KYC required before production execution features are enabled |
| **AML** | AML screening required as part of Veriff KYC flow |
| **Audit trail** | All executed actions must be auditable on-chain and off-chain |

---

*This PRD is anchored to the finalized system architecture in `system-architecture.png`. All implementation decisions must align with that diagram.*
