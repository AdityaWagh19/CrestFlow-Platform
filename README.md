# CrestFlow

**AI-native financial intelligence and portfolio orchestration layer built on Algorand.**

CrestFlow is not a wallet. Not a DEX. Not a dashboard.

It is the **financial operating system** for on-chain users — transforming fragmented DeFi positions into actionable portfolio intelligence, risk-aware recommendations, and executed financial decisions through natural language.

---

## What CrestFlow Does

Traditional DeFi forces users to manually track multiple protocols, hunt for yield, monitor risk, and rebalance portfolios. CrestFlow abstracts all of that.

A user connects their wallet. CrestFlow handles the rest:

- **Understands** their entire on-chain financial state
- **Analyzes** portfolio risk across protocols
- **Discovers** yield opportunities ranked by quality
- **Generates** explainable strategy recommendations
- **Executes** approved actions through integrated protocols
- **Answers** any portfolio question in natural language

---

## Architecture

CrestFlow is built around **six intelligence engines** that run on top of Algorand protocols.

```
User (Auth)
    │
    ▼
Onboarding & Identity
  ├── Turnkey Embedded Wallet
  ├── Veriff KYC (optional MVP, prod gate)
  └── GoPlausible DID + VC
    │
    ▼
Copilot API  (x402-ready, single public endpoint)
    │
    ├── Engine 1 — Portfolio Intelligence  (canonical state layer)
    ├── Engine 2 — Risk Intelligence       (explainable risk scoring)
    ├── Engine 3 — Strategy & Optimization (goal-based recommendations)
    ├── Engine 4 — Yield & Opportunity     (risk-adjusted rankings)
    ├── Engine 5 — User Intelligence       (dynamic investor profiles)
    └── Engine 6 — Autonomous Execution    (approved transaction flows)
    │
    ▼
Orchestration Layer
  Policy Engine → Orchestrator → Execution Coordinator
    │
    ▼
Haystack Router
  ├── Gora Oracle      (verified price feeds)
  ├── Folks Finance    (lending, borrowing, supply, repay)
  ├── Tinyman          (DEX, LP)
  └── Pact             (DEX, LP)
    │
    ▼
Algorand Blockchain
```

> Architecture source of truth: [`crestflow.png`](./crestflow.png)

---

## MVP Scope

The MVP is the **first complete implementation** of the Financial Intelligence Layer — with fewer protocol integrations, not reduced intelligence depth.

### What's in MVP

| Priority | Module |
|---|---|
| P0 | Auth + Turnkey embedded wallet |
| P0 | Portfolio Intelligence Engine (full capabilities) |
| P0 | Risk Intelligence Engine (full capabilities) |
| P0 | Yield & Opportunity Engine (Folks Finance + Tinyman) |
| P0 | AI Copilot (natural language over all engines) |
| P0 | Copilot API (x402-ready) |
| P1 | User Intelligence Engine (investor persona + risk profile) |
| P1 | Strategy & Optimization Engine (rebalancing + yield plans) |
| P1 | Basic Execution Engine (Folks Finance + Tinyman swap) |
| P1 | Policy Engine + Orchestrator + Execution Coordinator |
| P1 | Haystack Router (Folks + Tinyman adapters) |
| P1 | Gora Oracle integration |
| P1 | KYC (Veriff) + GoPlausible DID/VC (optional gate) |

### What's out of MVP

- Autonomous execution / Autopilot → Phase 3
- Multi-chain support → Phase 3
- Multi-agent orchestration → Phase 3
- x402 live monetization → Phase 2 (architecture ready now)

---

## Protocol Integrations

| Type | Protocol | MVP Status |
|---|---|---|
| Embedded Wallet | Turnkey | ✅ Active |
| Lending | Folks Finance | ✅ Active |
| DEX / LP | Tinyman | ✅ Active |
| DEX / LP | Pact | Deferred (MVP+) |
| Oracle | Gora Oracle | ✅ Active |
| Market Data | CoinGecko | ✅ Active |
| On-chain Data | Algorand Indexer | ✅ Active |

---

## Engineering Principles

```
Correctness > Reliability > Maintainability > Performance
```

- **Modular** — Each engine is independently deployable. No engine depends on another's internals.
- **API-first** — All intelligence is exposed as REST APIs, designed for x402 monetization.
- **MCP-compatible** — All capabilities are designed to be accessible to external AI agents.
- **Non-custodial** — Private keys never touch CrestFlow servers. Turnkey architecture enforced.
- **Explainable** — Every AI output includes reason, confidence, assumptions, and expected outcome.
- **No floating point** — All monetary calculations use decimal arithmetic.
- **Policy Engine mandatory** — No execution bypasses the guardrail layer.

---

## Repository Structure

```
CrestFlow-Platform/
├── crestflow.png                  # Architecture source of truth
├── project-context/
│   ├── context.md                 # Platform context and philosophy
│   ├── prd.md                     # Product Requirements Document
│   ├── srs.md                     # Software Requirements Specification
│   ├── flow.md                    # User and system flows (all 19 flows)
│   ├── mvp-context.md             # MVP scope, priorities, and definition of done
│   ├── instructions.md            # Engineering instructions for agents and developers
│   ├── architecture.md            # Architecture notes
│   └── design.md                  # Design notes
```

---

## MVP Definition of Done

The MVP is complete when a user can:

1. Sign up and get a Turnkey embedded Algorand wallet
2. Import their complete portfolio (assets + Folks Finance + Tinyman LP positions)
3. See portfolio health score with component breakdown
4. See risk score with full breakdown — and understand why
5. See yield opportunities ranked by risk-adjusted APY
6. Receive explainable AI recommendations
7. Simulate an action before committing
8. Execute a Folks Finance or Tinyman action
9. Ask any portfolio question in natural language
10. Receive alerts when risk thresholds are breached

---

## Non-Negotiables

| Rule | Why |
|---|---|
| Never fabricate financial data | Financial systems require factual, sourced outputs |
| Never bypass user approval for execution | Users must always authorize transactions |
| Never use floating point for monetary values | Precision loss causes silent financial bugs |
| Never skip the Policy Engine | Guardrails protect users from unauthorized actions |
| Always produce explainable AI outputs | No black-box financial decisions |
| Always use Gora Oracle prices during execution | Unverified prices cause incorrect transactions |

---

*CrestFlow — Financial intelligence layer for Algorand.*
