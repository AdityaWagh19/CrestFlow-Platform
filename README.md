# CrestFlow

**AI-native financial intelligence and portfolio orchestration layer built on Algorand.**

CrestFlow is not a wallet. Not a DEX. Not a dashboard.

It is the **financial operating system** for on-chain users — transforming fragmented DeFi positions into actionable portfolio intelligence, risk-aware recommendations, and executed financial decisions through natural language.

---

## What CrestFlow Does

Traditional DeFi forces users to manually track multiple protocols, hunt for yield, monitor risk, and rebalance portfolios. CrestFlow abstracts all of that.

A user connects their wallet. CrestFlow handles the rest:

- Understands their entire on-chain financial state
- Analyzes portfolio risk across protocols
- Discovers yield opportunities ranked by quality, not raw APY
- Generates explainable strategy recommendations
- Executes approved actions through integrated protocols
- Answers any portfolio question in natural language

---

## System Architecture

> Architecture source of truth: [`system-architecture.png`](./project-context/system-architecture.png)

```mermaid
flowchart TD
    User["User\nGoogle OAuth / Email+Password"]
    Onboarding["Onboarding and Identity\nTurnkey Embedded Wallet · Veriff KYC · GoPlausible DID/VC"]
    Portfolio["Portfolio State Analysis\nAlgorand Indexer — auto-triggered post-onboarding"]
    CopilotAPI["Copilot API\nx402-ready · Single public endpoint"]
    FKL["Financial Knowledge Layer\nAlgorand Indexer · CoinGecko · Gora Oracle · Folks Finance API · Tinyman API · Pact API"]

    E1["Engine 1 — Portfolio Intelligence\nCanonical financial state layer"]
    E2["Engine 2 — Risk Intelligence\nExplainable risk scoring and alerts"]
    E3["Engine 3 — Strategy and Optimization\nGoal-based recommendations"]
    E4["Engine 4 — Yield and Opportunity\nRisk-adjusted opportunity ranking"]
    E5["Engine 5 — User Intelligence\nDynamic investor profiling"]
    E6["Engine 6 — Autonomous Execution\nApproved transaction flows"]

    Orch["Orchestration Layer\nPolicy Engine · Orchestrator · Execution Coordinator"]
    Haystack["Haystack Router"]
    Gora["Gora Oracle\nVerified price feeds"]
    Folks["Folks Finance Adapter"]
    Tinyman["Tinyman Adapter"]
    Pact["Pact Adapter"]
    Algorand["Algorand Blockchain\nFully auditable · Instant finality"]

    User --> Onboarding
    Onboarding --> Portfolio
    Portfolio --> CopilotAPI
    CopilotAPI --> FKL
    FKL --> E1
    FKL --> E2
    FKL --> E3
    FKL --> E4
    FKL --> E5
    FKL --> E6
    E6 --> Orch
    Orch --> Haystack
    Haystack --> Gora
    Haystack --> Folks
    Haystack --> Tinyman
    Haystack --> Pact
    Folks --> Algorand
    Tinyman --> Algorand
    Pact --> Algorand
```

---

## Engine Data Contracts

Engine 1 is the **canonical state layer**. All downstream engines consume its output. No engine reads raw blockchain data directly.

```mermaid
flowchart LR
    E1["Engine 1\nPortfolio Intelligence\nCanonical State"]
    E2["Engine 2\nRisk Intelligence"]
    E3["Engine 3\nStrategy and Optimization"]
    E4["Engine 4\nYield and Opportunity"]
    E5["Engine 5\nUser Intelligence\nInvestor Profile"]
    E6["Engine 6\nAutonomous Execution"]

    E1 -->|"Portfolio Snapshot"| E2
    E1 -->|"Portfolio Snapshot"| E3
    E1 -->|"Portfolio Snapshot"| E4
    E1 -->|"Portfolio Snapshot"| E6
    E5 -->|"Investor Profile"| E2
    E5 -->|"Investor Profile"| E3
    E5 -->|"Investor Profile"| E4
    E3 -->|"Strategy Plan"| E6
```

---

## Execution Pipeline

Every execution action follows a strict, non-skippable sequence. No step can be bypassed.

```mermaid
flowchart LR
    Intent["User Intent\nApproved by user"]
    PE["Policy Engine\nValidation · Risk limits · KYC status"]
    Orch["Orchestrator\nPlan of Action"]
    Coord["Execution Coordinator\nStep sequencing"]
    Router["Haystack Router\nProtocol selection"]
    Oracle["Gora Oracle\nPrice verification"]
    Adapter["Protocol Adapter\nFolks Finance / Tinyman / Pact"]
    Chain["Algorand Blockchain"]

    Intent --> PE
    PE --> Orch
    Orch --> Coord
    Coord --> Router
    Router --> Oracle
    Router --> Adapter
    Oracle -->|"Verified prices"| Adapter
    Adapter --> Chain
```

> If Gora Oracle is unavailable, execution halts. Unverified prices are never used.

---

## Protocol Integrations

| Type | Protocol | Status |
|---|---|---|
| Embedded Wallet | Turnkey | Active |
| Lending | Folks Finance | Active |
| DEX / LP | Tinyman | Active |
| DEX / LP | Pact | Deferred — MVP+ |
| Oracle | Gora Oracle | Active |
| Market Data | CoinGecko | Active |
| On-chain Data | Algorand Indexer | Active |

---

## MVP Scope

The MVP is the **first complete implementation** of the Financial Intelligence Layer — with fewer protocol integrations, not reduced intelligence depth.

### In Scope

| Priority | Module |
|---|---|
| P0 | Auth + Turnkey embedded wallet |
| P0 | Portfolio Intelligence Engine |
| P0 | Risk Intelligence Engine |
| P0 | Yield and Opportunity Engine |
| P0 | AI Copilot |
| P0 | Copilot API |
| P1 | User Intelligence Engine |
| P1 | Strategy and Optimization Engine |
| P1 | Basic Execution Engine |
| P1 | Policy Engine + Orchestrator + Execution Coordinator |
| P1 | Haystack Router |
| P1 | Gora Oracle integration |
| P1 | Veriff KYC + GoPlausible DID/VC |

### Out of Scope

| Excluded | Deferred To |
|---|---|
| Autonomous execution / Autopilot | Phase 3 |
| Multi-chain support | Phase 3 |
| Multi-agent orchestration | Phase 3 |
| Institutional workflows | Phase 3 |
| x402 live monetization | Phase 2 |

---

## Engineering Principles

```
Correctness > Reliability > Maintainability > Performance
```

- **Modular** — Each engine is independently deployable. No engine depends on another's internal implementation.
- **API-first** — All intelligence is exposed as REST APIs, versioned and documented.
- **MCP-compatible** — All capabilities are designed to be accessible to external AI agents.
- **Non-custodial** — Private keys never touch CrestFlow servers. Turnkey architecture enforced throughout.
- **Explainable** — Every AI output includes reason, confidence level, assumptions, and expected outcome. No black-box decisions.
- **Decimal arithmetic** — All monetary calculations use decimal types. Floating point is forbidden.
- **Policy Engine mandatory** — No execution action bypasses the guardrail layer.

---

## Repository Structure

```
CrestFlow-Platform/
├── system-architecture.png                  # Architecture source of truth
├── project-context/
│   ├── context.md                 # Platform context and philosophy
│   ├── prd.md                     # Product Requirements Document
│   ├── srs.md                     # Software Requirements Specification
│   ├── flow.md                    # User and system flows
│   ├── mvp-context.md             # MVP scope, priorities, and definition of done
│   ├── instructions.md            # Engineering instructions for agents and developers
│   ├── architecture.md            # Architecture notes
│   └── design.md                  # Design notes
```

---

## MVP Definition of Done

The MVP is complete when a user can:

1. Sign up and receive a Turnkey embedded Algorand wallet
2. Import their complete portfolio — native assets, Folks Finance positions, Tinyman LP positions
3. View portfolio health score with per-component breakdown
4. View risk score with full decomposition — understand which factors drove it
5. View yield opportunities ranked by risk-adjusted APY, not raw APY
6. Receive AI-generated, explainable strategy recommendations
7. Simulate an action before committing
8. Execute a Folks Finance or Tinyman action with wallet approval
9. Ask any portfolio question in natural language and receive a sourced answer
10. Receive alerts when risk thresholds are breached

---

## Non-Negotiables

| Rule | Reason |
|---|---|
| Never fabricate financial data | Financial systems require factual, sourced outputs |
| Never bypass user approval for execution | Users must authorize every transaction |
| Never use floating point for monetary values | Precision loss causes silent financial errors |
| Never skip the Policy Engine | Guardrails protect users from unauthorized execution |
| Always produce explainable AI outputs | No black-box financial decisions |
| Always use Gora Oracle prices during execution | Unverified prices cause incorrect transactions |
| Always consume Engine 1 output in downstream engines | Engine 1 owns portfolio truth |

---

*CrestFlow — Financial intelligence layer for Algorand.*
