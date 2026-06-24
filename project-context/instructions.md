# CrestFlow Engineering Instructions

**Audience:** All AI agents, developers, and contributors working on CrestFlow  
**Authority:** These instructions take precedence over generated assumptions.  
**Architecture Source of Truth:** `system-architecture.png` — all implementation decisions must align with that diagram.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Core Product Principles](#2-core-product-principles)
3. [Engineering Philosophy](#3-engineering-philosophy)
4. [Canonical Architecture](#4-canonical-architecture)
5. [Architecture Principles](#5-architecture-principles)
6. [Domain-Driven Design](#6-domain-driven-design)
7. [Engine-Specific Rules](#7-engine-specific-rules)
8. [Orchestration & Execution Layer Rules](#8-orchestration--execution-layer-rules)
9. [AI Copilot Rules](#9-ai-copilot-rules)
10. [Protocol Adapter Pattern](#10-protocol-adapter-pattern)
11. [API Design Standards](#11-api-design-standards)
12. [Database Principles](#12-database-principles)
13. [Event-Driven Design](#13-event-driven-design)
14. [Financial Computation Standards](#14-financial-computation-standards)
15. [MCP Design Rules](#15-mcp-design-rules)
16. [x402 Design Rules](#16-x402-design-rules)
17. [Onboarding & Identity Rules](#17-onboarding--identity-rules)
18. [Security Requirements](#18-security-requirements)
19. [Observability Requirements](#19-observability-requirements)
20. [Testing Requirements](#20-testing-requirements)
21. [Performance Requirements](#21-performance-requirements)
22. [Code Quality Standards](#22-code-quality-standards)
23. [Documentation Requirements](#23-documentation-requirements)
24. [Future-Proofing Rules](#24-future-proofing-rules)
25. [Absolute Rules](#25-absolute-rules)

---

## 1. Project Identity

CrestFlow is an **AI-native financial intelligence and portfolio orchestration platform** built on Algorand.

**CrestFlow is:**
- The financial intelligence layer above protocols
- A portfolio analytics platform
- An AI financial copilot
- A portfolio orchestration engine
- Agent-accessible financial infrastructure

**CrestFlow is not:**
- A wallet
- A DEX
- A lending protocol
- A portfolio dashboard
- A robo-advisor

Every feature built must move the platform closer to becoming the **financial operating system of Algorand**. If a feature does not contribute to portfolio intelligence, risk understanding, yield discovery, strategy generation, or execution — question whether it belongs here.

---

## 2. Core Product Principles

All implementations must optimize for these in order:

1. **Simplicity** — Abstract DeFi complexity from users. If it requires manual explanation, it is not simple enough.
2. **Explainability** — Every AI output must be traceable to data. No black boxes.
3. **Transparency** — Users must see the reasoning behind every recommendation.
4. **Reliability** — The system must degrade gracefully. One engine failing cannot break others.
5. **Security** — Non-custodial. No exceptions.
6. **Modularity** — Engines are independently deployable. No hidden coupling.
7. **Capital Efficiency** — Optimize yield relative to risk. Never recommend inefficient capital use.

**User must always understand:**
- Why a recommendation exists
- Expected benefit and outcome
- Associated risks
- Confidence level
- Assumptions made

No black-box financial decisions. Ever.

---

## 3. Engineering Philosophy

**Priority order — never deviate:**

```
Correctness > Reliability > Maintainability > Performance
```

- Never sacrifice correctness for speed
- Never sacrifice reliability for features
- Optimize performance only after correctness is proven
- Financial systems require deterministic and reproducible outputs
- If an output cannot be reproduced from its inputs, it is a bug

---

## 4. Canonical Architecture

> From `system-architecture.png` — this is the finalized system architecture. Do not deviate.

```
User (Auth: Google OAuth / Email+Password)
          │
          ▼
Onboarding & Identity
  ├── Turnkey Embedded Wallet (MVP Priority)
  ├── KYC: Veriff (doc + liveness + AML)
  └── DID + KYC VC: GoPlausible (wallet → did → vc)
          │
          ▼
Portfolio State Analysis (base feed for all engines)
          │
          ▼
─────────────────────────────────────────────────────────
COPILOT API  (single public endpoint, x402-enabled)
─────────────────────────────────────────────────────────
          │
          ├── Financial Knowledge Layer (shared data foundation)
          │
          ├── Engine 1: Portfolio Intelligence Engine
          │     I: Holdings, Transactions, Positions
          │     O: Health Score, Diversification, Performance
          │
          ├── Engine 2: Risk Intelligence Engine
          │     I: Portfolio, Market Data, Protocol Data
          │     O: Risk Score, VaR, CVaR, Liquidation Risk
          │
          ├── Engine 3: Strategy & Optimization Engine
          │     I: Goals, Risk Profile, Portfolio
          │     O: Allocation, Rebalance, Strategy Plan
          │
          ├── Engine 4: Yield & Opportunity Engine
          │     I: APYs, TVL, Liquidity, Protocol Metrics
          │     O: Best Opportunities, Yield Rankings
          │
          ├── Engine 5: User Intelligence Engine
          │     I: Behavior, Goals, Preferences
          │     O: Investor Persona, Dynamic Risk Profile
          │
          └── Engine 6: Autonomous Execution Engine
                I: Strategy, Goals, Risk Limits
                O: Execution Plan, Transactions, Autopilot
          │
          ▼
Orchestration & Execution Layer
  ├── x402 Payment → GoPlausible Facilitator
  ├── Policy Engine (guardrails — mandatory for all execution)
  ├── Orchestrator / Planner (POA)
  └── Execution Coordinator
          │
          ▼
Haystack Router
  ├── Gora Oracle (price feeds)
  ├── Folks Finance (lending pools)
  ├── Tinyman (DEX + LP)
  ├── Pact (DEX + LP)
  └── Future Protocols
          │
          ▼
Algorand Blockchain (fully auditable, instant finality)
```

---

## 5. Architecture Principles

### Layered Architecture

All services must follow this layer order. Violations are forbidden.

```
Presentation Layer     (API controllers, MCP tool handlers)
        ↓
Application Layer      (use cases, orchestration, request handling)
        ↓
Domain Layer           (business logic, engine core, financial models)
        ↓
Infrastructure Layer   (DB, external APIs, blockchain, protocol adapters)
```

**Rules:**
- Infrastructure logic must never appear inside domain logic
- Business logic must never live in API controllers
- Controllers must remain thin — they route, validate input, and delegate
- Domain services own all financial computation and decision logic

### Service Orientation

- Each engine is a separately deployable service
- Engines communicate through versioned API contracts only
- No engine imports or calls another engine's internal implementation
- Engine 1 (Portfolio Intelligence) is the canonical state layer — all others consume its output

### Engine Data Contract

```
Engine 1 → Canonical Portfolio Snapshot → Engines 2, 3, 4, 6
Engine 5 → Investor Profile             → Engines 2, 3, 4
Engines 2, 3, 4 → Intelligence Outputs → Engine 3, 6, Copilot
Engine 3 → Strategy Plan               → Engine 6
Engine 6 → Execution Request           → Orchestration Layer
```

No engine may fetch raw blockchain data directly. Only Engine 1 reads from the Algorand Indexer. All others consume Engine 1's normalized output.

---

## 6. Domain-Driven Design

Use domain-centric design. Business logic belongs inside domains.

### Primary Domains

| Domain | Owns |
|---|---|
| `Portfolio` | Assets, positions, snapshots, allocation, exposure, PnL, health |
| `Risk` | Risk scores, concentration, liquidity, stress tests, alerts |
| `Yield` | Opportunities, rankings, sustainability, idle capital |
| `Strategy` | Recommendations, rebalancing plans, goal-based strategies |
| `Execution` | Transaction generation, simulation, execution plans (POA) |
| `User` | Investor profiles, personas, goals, preferences, behavioral signals |
| `MarketData` | Prices, TVL, APY feeds, oracle data, protocol metrics |
| `Identity` | Auth, wallets, KYC status, DID, VCs |

### Rules

- Avoid large monolithic service classes
- Prefer focused domain services with a single clear responsibility
- Domain models must be pure — no infrastructure dependencies
- Aggregate roots must enforce invariants within their boundary
- Cross-domain communication goes through defined interfaces, not direct domain coupling

---

## 7. Engine-Specific Rules

### Engine 1 — Portfolio Intelligence Engine

- Engine 1 **owns portfolio truth**. It is the canonical financial state layer.
- All other engines consume normalized data from Engine 1's output — never raw blockchain data.
- Engine 1 is responsible for: asset discovery, position discovery, exposure analysis, allocation analysis, cost basis tracking, PnL calculation, and portfolio health scoring.
- Portfolio Snapshots must be **timestamped** and **immutable** once committed.
- Health Score must be **decomposable** — every component must be independently auditable.
- Exposure analysis must correctly decompose LP tokens and yield-bearing positions into underlying assets.

### Engine 2 — Risk Intelligence Engine

- Risk analysis must be **deterministic**. The same inputs must always produce the same output.
- Every risk score must be **decomposable** — show exactly which factors drove it.
- Never produce opaque AI-generated scores without component-level breakdown.
- Risk scoring must always include: concentration, liquidity, protocol risk, volatility, drawdown risk.
- Liquidation monitoring for Folks Finance positions must be continuous, not on-demand only.
- Stress test scenarios must document all assumptions used in the scenario.

### Engine 3 — Strategy & Optimization Engine

- Every recommendation must include: reason, expected outcome, risks, assumptions, confidence score.
- Recommendations must be **reproducible** from the inputs used to generate them.
- Never generate a recommendation without justification.
- Strategy outputs must quantify the expected improvement (e.g., "+1.8% projected yield").
- SOTA methods used (e.g., Black-Litterman, HRP) are **samples** — update as project matures.

### Engine 4 — Yield & Opportunity Engine

- **Never rank opportunities by APY alone.**
- Always rank by risk-adjusted yield as the default sort.
- Always evaluate: liquidity depth, yield sustainability, protocol quality, smart contract risk.
- Idle capital detection is a mandatory continuous check — never ignore undeployed capital.
- Filter opportunities against user risk profile from Engine 5 before surfacing.

### Engine 5 — User Intelligence Engine

- Engine 5 produces the **investor profile** consumed by Engines 2, 3, and 4.
- Profile must update continuously based on behavioral signals — not just at onboarding.
- Behavioral signals include: recommendations accepted/rejected, query patterns, portfolio changes.
- Persona classifications must be explainable to the user in plain language.
- Goal tracking must feed directly into Engine 3 (Strategy) for alignment.

### Engine 6 — Autonomous Execution Engine

- Engine 6 must remain **stateless** wherever possible.
- Mandatory execution sequence — never skip steps:
  1. Validation (inputs and constraints)
  2. Simulation (estimated outcome + fees)
  3. User Approval (via Policy Engine)
  4. Execution
- **Never execute automatically** unless Policy Engine explicitly authorizes via pre-set autopilot rules (Phase 3 only).
- Every execution must produce an audit log entry.
- SOTA methods and APIs listed are **samples** — update as project matures.

---

## 8. Orchestration & Execution Layer Rules

### Policy Engine

- The Policy Engine is a **mandatory guardrail**. No execution action may bypass it.
- The Policy Engine validates: user approval, transaction policies, risk limits, execution limits, KYC status.
- Any request that fails Policy Engine checks must be rejected with a clear, specific reason.
- The Policy Engine must be the **last** component before execution begins — not an optional pre-check.

### Orchestrator / Planner

- The Orchestrator determines the Plan of Action (POA) — the ordered execution sequence.
- POA must be human-readable before being passed to the Execution Coordinator.
- Optimize execution order to minimize fees and slippage.

### Execution Coordinator

- Manages multi-step, multi-protocol execution sequences.
- Step N+1 must not start until Step N completes successfully.
- On step failure: halt remaining steps, surface failure with current state to the user, do not attempt auto-recovery.

### Haystack Router

- Routes each execution action to the correct protocol adapter.
- Core engines interact with the **protocol interface**, never with protocol adapters directly.
- Adding a new protocol requires only a new adapter registered in the Haystack Router — no changes to engines.

### Gora Oracle

- All price data used during execution must be sourced from Gora Oracle.
- If Gora Oracle is unavailable: **halt execution and notify user**. Never proceed with stale or unverified prices.

### x402 Payment

- x402 payment verification must complete **before** engine execution begins.
- Payment is settled via GoPlausible Facilitator on Algorand.
- Failed payments return HTTP 402 — engine must not execute.

---

## 9. AI Copilot Rules

- The AI Copilot is an **advisor**. It is not an autonomous financial manager.
- The Copilot routes queries to the appropriate engine — it does not perform its own computation.
- All Copilot responses must include: direct answer, data/reasoning, confidence level, assumptions, optional next action.
- **The Copilot must never fabricate portfolio data.** If data is unavailable, say so.
- **The Copilot must never invent financial figures.** All numbers must be sourced from engine outputs.
- Low confidence outputs must be flagged as low confidence — never present uncertain estimates as facts.
- Execution initiated via Copilot must route through the Policy Engine before any action is taken.
- Multi-turn conversation context must be retained within a session.

---

## 10. Protocol Adapter Pattern

**Every external protocol must be abstracted behind an interface.** Core engines never interact with protocol-specific implementations.

### Pattern

```
Core Engine
     │
     ▼
Protocol Interface (abstract)
     │
     ├── FolksFinanceAdapter  (implements LendingAdapter)
     ├── TinymanAdapter       (implements DexAdapter + LPAdapter)
     ├── PactAdapter          (implements DexAdapter + LPAdapter)
     └── FutureProtocolAdapter
```

### Interface Examples

```
LendingAdapter
  - getPositions(address)
  - getLendingOpportunities()
  - buildSupplyTransaction(params)
  - buildBorrowTransaction(params)
  - buildRepayTransaction(params)
  - getLiquidationThreshold(position)

DexAdapter
  - getSwapOpportunities()
  - buildSwapTransaction(params)

LPAdapter
  - getLPPositions(address)
  - getLPOpportunities()
  - buildAddLiquidityTransaction(params)
  - buildRemoveLiquidityTransaction(params)

OracleAdapter
  - getPrice(asset)
  - getPriceFeed(assets[])
```

### Rules

- Never hardcode protocol-specific logic into core domain services
- Protocol adapters own all protocol-specific knowledge
- All adapters implement the same interface contract
- Engine 1 uses adapters to discover positions; Engine 6 uses adapters to generate transactions

---

## 11. API Design Standards

### Structure

- All APIs follow REST conventions
- All routes versioned: `/api/v1/`
- No deeply nested routes
- Consistent response envelope on all endpoints

### Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "ISO8601",
    "requestId": "uuid",
    "version": "1.0"
  }
}
```

### Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "RISK_ENGINE_UNAVAILABLE",
    "message": "Human-readable description",
    "requestId": "uuid"
  }
}
```

### Sample Route Patterns (illustrative — update as project matures)

```
GET  /api/v1/portfolio/overview
GET  /api/v1/portfolio/allocation
GET  /api/v1/portfolio/exposure
GET  /api/v1/portfolio/health
GET  /api/v1/risk/score
POST /api/v1/risk/stress-test
GET  /api/v1/yield/opportunities
GET  /api/v1/yield/rankings
GET  /api/v1/strategy/recommendations
POST /api/v1/strategy/rebalance
POST /api/v1/execution/simulate
POST /api/v1/execution/plan
POST /api/v1/execution/execute
GET  /api/v1/profile
GET  /api/v1/persona
```

### Rules

- Controllers are thin — validate input, delegate to application layer, return response
- No business logic in controllers
- All endpoints must have OpenAPI documentation
- All paid endpoints implement x402 payment verification before engine execution
- Rate limiting enforced on all endpoints

---

## 12. Database Principles

- Database is **source-of-truth only**
- Never store derived metrics unless recomputation cost is prohibitive and staleness is acceptable (and clearly indicated to the user)
- Prefer recomputation over serving stale cached intelligence
- Normalize financial entities — avoid duplicated state

### Store

- Assets (normalized records)
- Positions (per protocol, per wallet)
- Transactions (raw on-chain history)
- Portfolio Snapshots (timestamped, immutable)
- Users (auth, profile, preferences)
- Audit Log (all execution events — immutable, append-only)
- KYC Status + DID + VC linkage

### Do Not Store

- Floating-point monetary values (use decimal/string representation)
- Derived analytics that can be recomputed cheaply
- Private keys (never, under any circumstance)
- Seed phrases (never, under any circumstance)

### Snapshot Immutability

Portfolio snapshots, once committed, are **immutable**. A failed refresh must never overwrite a valid snapshot. New snapshots are appended; old ones are retained for audit.

---

## 13. Event-Driven Design

Use events for all major state changes. Events are immutable.

### Core Events

| Event | Trigger |
|---|---|
| `UserOnboarded` | New user completes onboarding |
| `WalletConnected` | Wallet linked to user account |
| `KYCCompleted` | Veriff KYC result received |
| `DIDIssued` | GoPlausible DID and VC created |
| `PortfolioScanned` | Full portfolio scan completed |
| `PortfolioUpdated` | Portfolio snapshot updated |
| `PositionDiscovered` | New protocol position found |
| `RiskScoreGenerated` | Risk Engine produces a new score |
| `RiskAlertTriggered` | Risk threshold breached |
| `OpportunityDiscovered` | Yield Engine finds a new opportunity |
| `StrategyGenerated` | Strategy Engine produces a recommendation |
| `ExecutionPlanCreated` | Execution plan (POA) generated |
| `ExecutionApproved` | User approves execution |
| `ExecutionCompleted` | Transaction confirmed on Algorand |
| `ExecutionFailed` | Transaction failed; state preserved |
| `InvestorProfileUpdated` | Engine 5 updates user profile |

### Rules

- Events carry all data needed to process them — avoid callbacks to external state
- Events are append-only — never mutate an emitted event
- All financial action events must be auditable

---

## 14. Financial Computation Standards

**These rules are non-negotiable. Violations cause financial bugs.**

| Rule | Requirement |
|---|---|
| **No floating point for money** | Use `Decimal` / `BigDecimal` / `BigInt` depending on language |
| **Precision** | All monetary values must preserve full precision — no rounding mid-computation |
| **Determinism** | Same inputs must always produce the same output |
| **Auditability** | All financial computations must be traceable to their inputs |
| **Reproducibility** | Any portfolio metric must be reproducible from the underlying snapshot data |
| **Rounding** | Apply rounding only at display boundaries — never during computation |
| **Percentage calculations** | Use basis points (bps) for APY/fee calculations where precision matters |

### Forbidden

```
// NEVER — floating point for money
const value = 0.1 + 0.2   // = 0.30000000000000004

// NEVER — implicit type coercion on financial values
const total = amount * "1.05"
```

---

## 15. MCP Design Rules

- All intelligence engine capabilities must be exposed as MCP-compatible tool interfaces
- MCP tools are **first-class citizens** — not afterthoughts bolted onto UI logic
- Design tools as reusable, stateless capabilities with structured inputs and outputs
- Avoid embedding UI logic inside MCP tool handlers
- All MCP tool schemas must be versioned and documented

### Rules for Execution MCP Tools

- Execution-capable tools must route through the Policy Engine before any action
- MCP clients must provide a valid user authorization token for execution tools
- Read-only intelligence tools (portfolio, risk, yield queries) do not require execution authorization

### MCP Tool Design Checklist

For each tool, define:
- Tool name (snake_case)
- Description (one sentence, for AI agent understanding)
- Input schema (typed, with descriptions)
- Output schema (typed, with descriptions)
- Errors it can return
- Whether it is read-only or execution-capable

---

## 16. x402 Design Rules

- Every major intelligence module must eventually be exposable as a paid API
- Design internal services so they can become: public REST APIs, MCP tools, SDK functions — without refactoring business logic
- Never tightly couple business logic to UI rendering
- x402 payment verification happens at the API gateway / middleware level — engines never handle payment logic directly
- Payment settlement via GoPlausible Facilitator on Algorand is the canonical approach

### Payment Implementation Pattern

```
Request arrives at Copilot API
        ↓
Middleware: check if endpoint is free or x402-gated
        ↓
If paid: validate x402 payment header
        ↓
GoPlausible Facilitator: settle and confirm payment
        ↓
If confirmed: pass request to engine
If failed: return HTTP 402 with payment details
```

---

## 17. Onboarding & Identity Rules

### Embedded Wallet (Turnkey)

- Turnkey wallet creation is the **MVP priority**
- The embedded wallet must be non-custodial — Turnkey's architecture must be implemented correctly; private keys never touch CrestFlow servers
- Wallet address must be stored and linked to user account immediately after creation
- All transaction signing occurs client-side or through Turnkey's signing infrastructure

### KYC (Veriff)

- KYC is **configurable**: optional for MVP, required production gate for execution features
- KYC gate status must be readable by the Policy Engine to enforce execution restrictions
- Never store raw KYC documents — only KYC status and verification metadata
- Veriff's 500 free check allowance must be tracked and monitored

### Identity (GoPlausible)

- DID issuance and VC management are owned by GoPlausible
- The identity chain must be maintained: `wallet → did → vc`
- VC must be usable by the Policy Engine as an authorization signal
- GoPlausible also serves as the x402 payment facilitator

---

## 18. Security Requirements

| Requirement | Detail |
|---|---|
| **Non-custodial** | Private keys are never stored, transmitted, or accessed by CrestFlow |
| **No seed phrases** | Never request, store, or transmit seed phrases |
| **Execution approval** | Explicit user authorization required for every transaction |
| **Policy Engine mandatory** | No execution action bypasses the Policy Engine |
| **Encryption at rest** | All sensitive user data encrypted (AES-256 or equivalent) |
| **Encryption in transit** | All data in transit uses TLS 1.2+ |
| **Authentication** | JWT or equivalent on all API endpoints |
| **Rate limiting** | Applied per-user and per-API-key to prevent abuse |
| **Audit log** | All execution events logged in an immutable, append-only audit trail |
| **Least privilege** | Services have minimum permissions needed — no over-provisioned roles |
| **No floating point money** | Prevents rounding vulnerabilities in financial computation |
| **Oracle verification** | Never use unverified or stale price data during execution |

**Security takes priority over convenience. Always.**

---

## 19. Observability Requirements

Every service must support the full observability stack.

### Structured Logging

- All logs must be structured (JSON) with: timestamp, service name, engine name, request ID, user ID (hashed), log level, message
- Never log sensitive data: no private keys, no seed phrases, no raw KYC data
- Financial action logs must include: action type, protocol, amount, outcome, txn ID

### Metrics

Expose at minimum:
- Request latency (P50, P95, P99) per endpoint
- Error rate per endpoint
- Portfolio scan duration
- Engine computation time
- x402 payment success/failure rate

### Tracing

- Distributed traces must span the full request path: Copilot API → engine → infrastructure
- Execution traces must cover: Policy Engine decision, Orchestrator POA, Coordinator steps, Haystack routing, blockchain submission

### Audit Events

All of the following must produce immutable audit events:
- User authentication
- Wallet connection
- KYC completion
- DID/VC issuance
- Portfolio scan
- Execution plan creation
- Execution approval
- Transaction submission
- Transaction confirmation or failure

---

## 20. Testing Requirements

### Coverage Targets

| Code Type | Minimum Coverage |
|---|---|
| All modules | 80% |
| Financial computation logic | 95%+ |
| Risk scoring logic | 95%+ |
| Execution pipeline | 95%+ |
| Policy Engine | 95%+ |

### Test Types Required

**Unit Tests**
- All domain services
- All financial computation functions
- All risk scoring components
- All protocol adapters (with mocked protocol responses)

**Integration Tests**
- Engine-to-engine data contract validation
- API endpoint tests (request → response)
- x402 payment flow
- MCP tool invocation
- Execution pipeline (Policy Engine → Orchestrator → Coordinator → Router)

**Contract Tests**
- All inter-engine API contracts
- All protocol adapter interfaces
- All MCP tool schemas

**Financial Regression Tests**
- Core financial computations must have golden-value tests
- Snapshot reproducibility tests (same inputs → same outputs)
- PnL calculation consistency tests

---

## 21. Performance Requirements

| Operation | Target | Measurement |
|---|---|---|
| Portfolio overview load | ≤ 3 seconds | P95 latency |
| Risk score generation | ≤ 5 seconds | P95 latency |
| Yield opportunity discovery | ≤ 5 seconds | P95 latency |
| Strategy generation | ≤ 10 seconds | P95 latency |
| Transaction simulation | ≤ 2 seconds | P95 latency |
| Copilot query response | ≤ 5 seconds | P95 latency |
| API availability | ≥ 99.9% | Monthly uptime |

**Optimization order:** Correctness first. Performance optimization only after correctness is proven and a performance problem is measured — not assumed.

---

## 22. Code Quality Standards

### Required

- **Type safety** — use strong typing throughout; no `any` in TypeScript, no implicit `object` in Python
- **Clear naming** — variables and functions must describe what they do; avoid abbreviations
- **Small functions** — functions do one thing; if it needs a comment to explain what it does, refactor it
- **Single responsibility** — each class, service, and module has one clear job
- **Explicit over implicit** — prefer explicit returns, explicit types, explicit dependencies

### Forbidden

- **God classes** — large classes that own too many concerns
- **Massive service files** — if a service file is growing beyond reason, split by domain responsibility
- **Hidden side effects** — functions that mutate external state without it being obvious from the signature
- **Circular dependencies** — no module A imports B which imports A
- **Business logic in controllers** — controllers route and delegate only
- **Infrastructure in domain** — database or API calls inside domain model methods
- **Floating point for money** — always use decimal types

---

## 23. Documentation Requirements

Every major component must document:

| Section | Content |
|---|---|
| **Purpose** | What this component does and why it exists |
| **Inputs** | What data it consumes, with types and sources |
| **Outputs** | What data it produces, with types and consumers |
| **Dependencies** | What services, adapters, or data sources it relies on |
| **Failure Modes** | How it behaves when dependencies fail; degradation behavior |
| **Assumptions** | What the component assumes to be true about its inputs |
| **Design Rationale** | Why it was designed this way; what alternatives were rejected |

Documentation is **mandatory**. Undocumented financial logic is a liability.

---

## 24. Future-Proofing Rules

### Design for

- **Multi-chain support** — protocol adapters isolate chain-specific logic; adding a new chain adds adapters only
- **Agent ecosystems** — MCP-first design means every capability is accessible to external AI agents
- **Institutional users** — API-first means institutional programmatic access is built in from day one
- **Autonomous workflows** — Policy Engine + Orchestrator are designed to support autopilot without architectural changes

### Do Not

- Prematurely optimize (correctness first)
- Over-engineer abstractions before the use case exists
- Hardcode assumptions about protocol-specific behavior in core domains
- Couple UI logic to business logic in ways that prevent API/MCP exposure

### Extensibility Checklist

Before shipping a feature, verify:
- [ ] Can this be exposed as a REST API endpoint?
- [ ] Can this be exposed as an MCP tool?
- [ ] Does this require changes to engine internals to support a new protocol? (It should not.)
- [ ] Does this work without a UI? (It should.)

---

## 25. Absolute Rules

These rules are **non-negotiable**. Any implementation violating them must be corrected before merge.

### Never

| Rule | Reason |
|---|---|
| Never fabricate financial data | Financial systems require factual, sourced data — invented data causes real financial harm |
| Never bypass user approval for execution | Users must always authorize transactions; unauthorized execution is a security failure |
| Never introduce protocol-specific logic into core domains | Breaks protocol-agnosticism; prevents adapter pattern; creates tight coupling |
| Never place business logic in controllers | Controllers are routing — logic belongs in domain services |
| Never use floating point for monetary calculations | Precision loss causes silent financial errors |
| Never create tightly coupled services | Engine isolation is an architectural invariant |
| Never store private keys or seed phrases | Non-custodial is a core identity principle — violation destroys user trust |
| Never proceed with unverified prices during execution | Stale or manipulated prices cause incorrect execution; halt and notify instead |
| Never skip the Policy Engine for execution | Guardrails exist for user protection; bypassing them creates unauthorized execution risk |
| Never emit opaque, unexplainable AI scores | All AI outputs must be decomposable and traceable to their inputs |

### Always

| Rule | Reason |
|---|---|
| Always prioritize explainability | Users must understand recommendations; unexplained advice erodes trust |
| Always prioritize security | Non-custodial, non-executory without approval — these are identity constraints |
| Always prioritize correctness | Financial data must be accurate before it is fast |
| Always produce deterministic financial outputs | Same inputs → same outputs → auditable and reproducible |
| Always log execution events immutably | Audit trails are required for financial systems |
| Always route execution through the Policy Engine | Guardrails protect users from unauthorized or out-of-policy actions |
| Always surface confidence levels for AI estimates | Uncertainty must be visible; false confidence is a form of deception |
| Always decompose risk and health scores | Composite scores without breakdowns are opaque and unexplainable |
| Always consume Engine 1's normalized output in downstream engines | Engine 1 owns portfolio truth; raw blockchain reads in other engines violate this |
| Always use Gora Oracle prices for execution-critical data | Verified prices prevent incorrect transaction execution |
