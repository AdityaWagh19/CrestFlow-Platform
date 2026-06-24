# CrestFlow — Project Context

> **Source of Truth**: This document is anchored to the finalized system architecture defined in `crestflow.png`.  
> All implementation decisions must align with that diagram.

---

## 1. What CrestFlow Is

CrestFlow is an **AI-native financial intelligence and portfolio orchestration layer** built on Algorand.

It is **not** another wallet, DEX, or DeFi dashboard. It is the **financial operating system** for on-chain users — transforming fragmented blockchain positions into:

- Actionable portfolio intelligence
- Automated recommendations
- Autonomous financial execution (Phase 3)

CrestFlow acts as a **financial copilot** capable of:
- Understanding a user's entire on-chain financial state
- Analyzing risk across protocols
- Discovering yield opportunities
- Generating strategies
- Executing actions through integrated protocols

---

## 2. What CrestFlow Is Not

| Not | Instead |
|---|---|
| A wallet | A financial intelligence layer |
| A DEX | A portfolio analytics platform |
| A lending protocol | An AI financial copilot |
| A portfolio tracker | A portfolio orchestration engine |
| A robo-advisor | Agent-accessible financial infrastructure |

---

## 3. Target Users

### Primary — Crypto-Native Investors (25–35)
- Already hold digital assets
- Want passive yield without manual management
- Use multiple Algorand protocols simultaneously
- Need unified portfolio visibility
- Seek better risk-adjusted returns

### Secondary — Advanced DeFi Users
- LP providers
- Active traders
- Yield optimizers
- Lending protocol users
- Portfolio managers

### Future — Institutional
- DAOs and treasury managers
- Family offices and funds
- Fintech applications

---

## 4. Core Product Philosophy

Every product and technical decision must optimize for:

1. **Simplicity** — Abstract DeFi complexity from users
2. **Transparency** — All recommendations are open-book
3. **Explainability** — AI must always explain its reasoning
4. **Risk Awareness** — Risk must be surfaced, never hidden
5. **Capital Efficiency** — Optimize yield relative to risk

### AI Constraint
AI is **allowed** to:
- Generate portfolio insights
- Explain risks and opportunities
- Recommend strategies
- Personalize based on user behavior

AI is **NOT allowed** to:
- Execute transactions without explicit user authorization
- Make unexplained recommendations
- Hide assumptions or model uncertainty

---

## 5. User Onboarding Flow (from crestflow.png)

```
User Onboarding
  ├── Google OAuth
  └── Mail/Password
        │
        ▼
Platform User Created & Authenticated
        │
        ▼
Turnkey User Created (Backend)
        │
        ▼
Embedded Algorand Wallet Created   ← *Priority for MVP*
        │
        ▼
Store Wallet Address Linked to User Gmail
        │
        ▼
[Optional for MVP — but is prod gate; all previous features are on/off map split]
KYC Infra
  ├── Use Veriff KYC provider (500 free checks)
  ├── Do Doc (Aadhaar/PAN etc) + Live + AML
  ├── Generate DID & Issue KYC VC
  ├── Link VC to DID
  └── DID connected to Wallet (wallet > did > vc)
        │
        ▼
Fund Wallet using existing DeFi wallet / Add money using UPI using On-Ramp
        │
        ▼
Portfolio State Analysis
(Existing Assets, Holdings, Positions)
*Base for all core engines*
```

**Key onboarding notes:**
- Embedded Algorand wallet via **Turnkey** is the MVP priority
- KYC via **Veriff** is optional for MVP but required for production gate
- **Verifiable Credentials** (DID + VC) are issued post-KYC and linked to the wallet
- On-ramp supports UPI funding

---

## 6. Core Services Architecture

> Each engine corresponds to a **bundled x402-enabled API**.  
> All engines are accessed via the **Copilot API** — the single public endpoint that routes internally.

### Copilot API
- Public API endpoint exposed for competition and external integrators
- Internally routes to 6 engines, each with x402-enabled endpoints
- Exposes Free APIs + x402 Paid APIs

---

### Engine 1 — Portfolio Intelligence Engine

**Purpose**: Convert raw on-chain positions into normalized portfolio intelligence.

| | Detail |
|---|---|
| **Input** | Holdings, Transactions, Positions |
| **Output** | Health Score, Diversification, Performance |
| **SOTA Methods** | Factor Analysis, Attribution Models |
| **Sample APIs** | `/analyze`, `/health`, `/performance` |

**Responsibilities:**
- Asset & position discovery
- Portfolio aggregation and allocation analysis
- Exposure and performance attribution
- Cost basis tracking
- Portfolio health scoring and insights
- **Canonical financial state output** — all downstream engines consume this

---

### Engine 2 — Risk Intelligence Engine

**Purpose**: Measure and monitor portfolio risk.

| | Detail |
|---|---|
| **Input** | Portfolio, Market Data, Protocol Data |
| **Output** | Risk Score, VaR, CVaR, Liquidation Risk |
| **SOTA Methods** | Monte Carlo, Bayesian, Regime Models |
| **Sample APIs** | `/risk/stress-test`, `/liquidation` |

**Responsibilities:**
- Risk scoring and concentration analysis
- Protocol risk analysis
- Liquidity analysis
- Stress testing and drawdown analysis
- Scenario modeling

---

### Engine 3 — Strategy & Optimization Engine

**Purpose**: Generate portfolio strategies.

| | Detail |
|---|---|
| **Input** | Goals, Risk Profile, Portfolio |
| **Output** | Allocation, Rebalance, Strategy Plan |
| **SOTA Methods** | Black-Litterman, HRP, Risk Parity |
| **Sample APIs** | `/strategy/allocation`, `/rebalance` |

**Responsibilities:**
- Asset allocation recommendations
- Rebalancing recommendations
- Goal-based strategies
- Risk-adjusted optimization

---

### Engine 4 — Yield & Opportunity Engine

**Purpose**: Discover and evaluate yield opportunities.

| | Detail |
|---|---|
| **Input** | APYs, TVL, Liquidity, Protocol Metrics |
| **Output** | Best Opportunities, Yield Rankings |
| **SOTA Methods** | Risk-Adjusted Yield Scoring |
| **Sample APIs** | `/opportunities`, `/rankings`, `/optimize-yield` |

**Responsibilities:**
- Yield discovery and APY aggregation
- Opportunity ranking
- Yield sustainability analysis
- Risk-adjusted yield scoring

---

### Engine 5 — User Intelligence Engine

**Purpose**: Build and maintain a dynamic investor profile for each user.

| | Detail |
|---|---|
| **Input** | Behavior, Goals, Preferences |
| **Output** | Investor Persona, Dynamic Risk Profile |
| **SOTA Methods** | Behavioral Finance, Preference Learning |
| **Sample APIs** | `/profile`, `/preferences`, `/persona` |

**Responsibilities:**
- Investor persona modeling
- Dynamic risk profile updates
- Behavioral analytics
- Personalization for other engines

---

### Engine 6 — Autonomous Execution Engine

**Purpose**: Execute approved portfolio actions.

| | Detail |
|---|---|
| **Input** | Strategy, Goals, Risk Limits |
| **Output** | Execution Plan, Transactions, Autopilot |
| **SOTA Methods** | Intent Routing, Agentic Execution |
| **Sample APIs** | `/execute`, `/execution-plan`, `/autopilot` |

**Responsibilities:**
- Protocol routing
- Transaction generation and simulation
- Position management
- Autopilot execution (Phase 3)

---

## 7. Financial Knowledge Layer

A shared data foundation consumed by all engines:

- Existing heuristics and live market data
- Protocol data (TVL, APYs, liquidity)
- Historical data and research data
- Token data and risk data

---

## 8. Orchestration & Execution Layer (from crestflow.png)

```
Copilot API
    │
    ├── x402 Payment Settled & Tracked (via Goplus Facilitator)
    │
    ├── Policy Engine
    │     Checks: User Approval Rules, Transaction Policies,
    │             Risk Limits, Execution Limits
    │     *Helps approve valid txns and creates guardrails*
    │
    ├── Orchestrator / Planner
    │     Decides: POA (Plan of Action) and Order
    │
    └── Execution Coordinator
              │
              ▼
         Haystack Router
              │
              ├── Gora Oracle (price feeds, external data)
              │
              ├── Folks Finance (Lending pools)
              ├── Tinyman (DEX and LP)
              ├── Pact (DEX and LP)
              └── Future Protocols (Yield Protocols / RWAs)
                        │
                        ▼
              Wallet Transactions on Algorand Blockchain
              (Fully auditable, instant finality)
```

### Orchestration Roles

| Component | Role |
|---|---|
| **Policy Engine** | Enforces user approval rules, transaction policies, risk limits, execution limits. Acts as guardrail before any execution. |
| **Orchestrator / Planner** | Decides the Plan of Action (POA) and execution order across protocols |
| **Execution Coordinator** | Coordinates multi-step cross-protocol transactions |
| **Haystack Router** | Routes execution to the correct protocol |
| **Gora Oracle** | Provides verified price feeds and external data to engines |

---

## 9. Algorand Protocol Integrations

### Active (MVP)
| Protocol | Type |
|---|---|
| **Folks Finance** | Lending pools |
| **Tinyman** | DEX and LP positions |
| **Pact** | DEX and LP positions |

### Wallets
| Wallet | Status |
|---|---|
| **Embedded Smart Wallet** (Turnkey) | Built-in via onboarding — primary wallet for all x402 and execution flows |

> External wallet connections (Pera, Defly, Lute) are not supported. They cannot autonomously pay x402 fees and are not in the finalized architecture.

### Data Sources
| Source | Use |
|---|---|
| **Algorand Indexer** | On-chain data |
| **Gora Oracle** | Price feeds and verified data (execution-critical) |
| **CoinGecko** | Market pricing and token metadata |
| **Folks Finance API** | Lending/borrowing positions, pool APYs |
| **Tinyman API** | LP positions, swap rates, pool APYs |
| **Pact API** | LP positions, pool APYs |

> DefiLlama is not in the finalized architecture. Protocol data is sourced directly from protocol APIs.

### Future
- Additional lending markets
- Additional liquidity venues
- Yield protocols and RWAs

---

## 10. Identity & Compliance

### KYC (Optional for MVP, Required for Production)
- Provider: **Veriff** (500 free checks)
- Scope: Document verification (Aadhaar/PAN), Liveness check, AML screening

### Verifiable Credentials
- Provider: **GoPlausible**
- DID issuance linked to user wallet
- KYC VC issued post-verification
- Chain: `wallet > did > vc`

### Future
- Full institutional compliance layer
- Additional KYC provider options (TBD)

---

## 11. x402 Monetization Strategy

Every core intelligence module is a monetizable API endpoint.

### Payment Flow
```
API Request → x402 Payment Check → Goplus Facilitator tracks settlement → Engine executes
```

### Endpoint Categories

**Portfolio APIs**
- `GET /portfolio/overview`
- `GET /portfolio/allocation`
- `GET /portfolio/exposure`
- `GET /portfolio/performance`
- `GET /portfolio/health`

**Risk APIs**
- `GET /risk/score`
- `POST /risk/stress-test`
- `GET /risk/protocol-analysis`

**Yield APIs**
- `GET /yield/opportunities`
- `GET /yield/rankings`

**Strategy APIs**
- `GET /strategy/recommendations`
- `POST /strategy/rebalance`

**Execution APIs**
- `POST /execute`
- `POST /execution-plan`
- `POST /autopilot`

All premium endpoints support x402 micro-payments.

---

## 12. MCP Strategy

CrestFlow exposes all intelligence engines through MCP-compatible interfaces.

**Target integrations:**
- ChatGPT
- Claude
- Cursor / Windsurf
- External agent frameworks

**MCP-exposed capabilities:**
- Query portfolio state
- Analyze risk
- Discover yield opportunities
- Generate strategies
- Execute portfolio actions (with user authorization)

---

## 13. Technical Principles

| Principle | Requirement |
|---|---|
| **Modularity** | Every intelligence engine is independently deployable |
| **Event-driven** | Engines communicate via defined contracts, not internal dependencies |
| **API-first** | All capabilities exposed as APIs before UI |
| **MCP-compatible** | All engines accessible from external AI agents |
| **Multi-agent ready** | Architecture supports autonomous agent orchestration |
| **Protocol-agnostic** | Engine internals don't depend on specific protocol implementations |
| **No circular dependencies** | Engines communicate through defined output schemas only |

---

## 14. Phased Roadmap

### Phase 1 — Financial Intelligence Layer
- Portfolio analytics (Engine 1)
- Risk analytics (Engine 2)
- Yield discovery (Engine 4)
- User onboarding with embedded wallet + KYC
- Copilot API with x402 monetization

### Phase 2 — Portfolio Orchestration Layer
- Strategy generation (Engine 3)
- Automated recommendations
- Portfolio optimization
- Orchestrator + Policy Engine
- Execution Coordinator live

### Phase 3 — Autonomous Financial Layer
- Agent-driven portfolio management (Engine 6 fully live)
- Autonomous execution with autopilot
- Cross-protocol capital allocation
- Fully programmable financial operations
- MCP-native agent interfaces
- Institutional access layer

---

## 15. AI Copilot Layer

**Purpose**: Natural language interface over all six engines.

**Example queries:**
- *"Why is my portfolio risky?"* → Routes to Risk Intelligence Engine
- *"Find me safer yield."* → Routes to Yield & Opportunity Engine
- *"Rebalance my portfolio."* → Routes to Strategy Engine → Execution Engine
- *"Move idle USDC to the best opportunity."* → Full orchestration pipeline

**Constraints:**
- All outputs must be explainable
- Confidence levels and assumptions must be visible
- Execution requires explicit user approval via Policy Engine

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **POA** | Plan of Action — the execution plan generated by the Orchestrator |
| **VC** | Verifiable Credential — KYC credential linked to DID |
| **DID** | Decentralized Identifier — user identity on-chain |
| **HRP** | Hierarchical Risk Parity — portfolio optimization method |
| **VaR** | Value at Risk — risk measurement metric |
| **CVaR** | Conditional Value at Risk — tail risk measurement |
| **TVL** | Total Value Locked — protocol liquidity metric |
| **x402** | HTTP 402-based micropayment protocol for API monetization |
| **LP** | Liquidity Provider position |
| **AML** | Anti-Money Laundering screening |
| **MCP** | Model Context Protocol — standard for AI agent tool exposure |
