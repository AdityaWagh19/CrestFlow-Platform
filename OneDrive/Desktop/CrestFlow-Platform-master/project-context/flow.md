# CrestFlow — User & System Flows

**Version:** 1.0  
**Architecture Source of Truth:** `system-architecture.png`

---

## Flow Index

| # | Flow | Category |
|---|---|---|
| 1 | [User Onboarding Flow](#1-user-onboarding-flow) | Platform Entry |
| 2 | [Wallet Connection Flow](#2-wallet-connection-flow) | Platform Entry |
| 3 | [Portfolio Analysis Flow](#3-portfolio-analysis-flow) | Intelligence |
| 4 | [Risk Analysis Flow](#4-risk-analysis-flow) | Intelligence |
| 5 | [Yield Discovery Flow](#5-yield-discovery-flow) | Intelligence |
| 6 | [User Intelligence & Profiling Flow](#6-user-intelligence--profiling-flow) | Intelligence |
| 7 | [Portfolio Health Score Flow](#7-portfolio-health-score-flow) | Intelligence |
| 8 | [AI Insight Generation Flow](#8-ai-insight-generation-flow) | Intelligence |
| 9 | [Strategy Generation Flow](#9-strategy-generation-flow) | Orchestration |
| 10 | [Portfolio Rebalancing Flow](#10-portfolio-rebalancing-flow) | Orchestration |
| 11 | [Yield Optimization Flow](#11-yield-optimization-flow) | Orchestration |
| 12 | [Execution Flow](#12-execution-flow) | Execution |
| 13 | [AI Copilot Flow](#13-ai-copilot-flow) | Interface |
| 14 | [x402 API Payment Flow](#14-x402-api-payment-flow) | Monetization |
| 15 | [MCP Client Flow](#15-mcp-client-flow) | External Access |
| 16 | [Risk Alert & Monitoring Flow](#16-risk-alert--monitoring-flow) | Monitoring |
| 17 | [Market Opportunity Alert Flow](#17-market-opportunity-alert-flow) | Monitoring |
| 18 | [Goal-Based Planning Flow](#18-goal-based-planning-flow) | Planning |
| 19 | [Future — Autonomous Agent Flow](#19-future--autonomous-agent-flow) | Phase 3 |
| 20 | [Future — Multi-Agent Orchestration Flow](#20-future--multi-agent-orchestration-flow) | Phase 3 |
| — | [End-to-End Core User Journey](#end-to-end-core-user-journey) | Master Flow |

---

## 1. User Onboarding Flow

**Purpose:** Create user account, provision an embedded Algorand wallet, complete identity verification, fund the wallet, and initialize the platform with a full portfolio scan.

> ★ Turnkey embedded wallet creation is the MVP priority.  
> KYC is optional for MVP but is the production gate before execution features are enabled.

```
User Visits CrestFlow Platform
          │
          ▼
  ┌───────────────────┐
  │  Authentication   │
  │                   │
  │  Google OAuth     │
  │  (MVP only —      │
  │  Email/Password   │
  │  deferred)        │
  └───────────────────┘
          │
          ▼
Platform User Record Created & Authenticated
          │
          ▼
Turnkey User Created (Backend)
          │
          ▼
Embedded Algorand Wallet Created
(Non-custodial — user retains key ownership via Turnkey)
          │
          ▼
Wallet Address Stored & Linked to User Account
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│  KYC Infra  ← Configurable: Optional (MVP) / Required   │
│                                (Production Gate)         │
│                                                          │
│  Step 1: Veriff KYC initiated                            │
│  Step 2: Document verification (Aadhaar/PAN/equivalent)  │
│  Step 3: Liveness check                                  │
│  Step 4: AML screening                                   │
│  Step 5: KYC result received                             │
│  Step 6: DID generated via GoPlausible                   │
│  Step 7: KYC Verifiable Credential (VC) issued           │
│  Step 8: VC linked to DID                                │
│  Step 9: DID connected to wallet                         │
│          → wallet → did → vc (chain established)         │
└──────────────────────────────────────────────────────────┘
          │
          ▼
Fund Wallet
  └── UPI On-Ramp (fiat → ALGO/USDC)
          │
          ▼
Auto-Triggered Portfolio State Analysis
(Algorand Indexer scans all positions for connected wallets)
          │
          ▼
Engine Initialization
  ├── Engine 1: Portfolio Intelligence — generates initial snapshot
  ├── Engine 2: Risk Intelligence — generates initial risk score
  ├── Engine 4: Yield & Opportunity — scans initial opportunities
  └── Engine 5: User Intelligence — creates initial investor profile
          │
          ▼
User Dashboard (initial state ready)
```

**Outputs:**
- Authenticated user account
- Embedded Algorand wallet
- KYC status + DID + VC (if completed)
- Initial portfolio snapshot
- Initial health score
- Initial risk score
- Initial investor profile

---

## 2. Wallet Connection Flow

**Purpose:** Import on-chain financial state for the Turnkey embedded wallet.

```
Turnkey Embedded Wallet Address Retrieved
          │
          ▼
Algorand Indexer Query
  ├── Native ALGO balance
  ├── ASA holdings (all opted-in tokens)
  └── Full transaction history
          │
          ▼
Protocol Position Discovery (parallel)
  ├── Folks Finance: lending positions, borrowing positions
  ├── Tinyman: LP positions, staked liquidity
  └── Pact: LP positions
          │
          ▼
Asset Normalization
(All positions converted to unified asset record schema)
          │
          ▼
Portfolio Snapshot Generated & Stored
(Timestamped canonical state — consumed by all engines)
          │
          ▼
Engine 1 (Portfolio Intelligence) ingests snapshot
```

**Outputs:**
- Wallet address confirmed
- Normalized asset holdings
- Protocol positions (Folks Finance, Tinyman, Pact)
- Transaction history
- Portfolio snapshot (canonical state)

> External wallet connections (Pera, Defly, Lute) are not supported. CrestFlow uses the Turnkey embedded wallet exclusively. External wallets cannot autonomously pay x402 fees.

---

## 3. Portfolio Analysis Flow

**Purpose:** Transform raw on-chain positions into normalized portfolio intelligence (Engine 1).

```
Portfolio Snapshot (canonical financial state)
          │
          ▼
Asset Discovery
  ├── Native ALGO holdings
  ├── ASA token holdings
  ├── Folks Finance positions (supply/borrow)
  ├── Tinyman LP positions
  └── Pact LP positions
          │
          ▼
Asset Classification
  ├── Volatile assets
  ├── Stablecoins
  ├── LP tokens → decomposed to underlying assets
  └── Yield-bearing positions
          │
          ▼
Allocation Analysis
  ├── Asset allocation (% per token)
  ├── Category allocation (stable vs. volatile vs. LP)
  └── Protocol allocation (% in each protocol)
          │
          ▼
Exposure Analysis
  ├── Direct exposure: native holdings
  ├── Indirect exposure: decomposed LP tokens
  └── True exposure: final underlying asset breakdown
          │           (e.g., "72% indirect ALGO exposure")
          ▼
PnL Calculation
  ├── Realized PnL (from closed positions & swaps)
  ├── Unrealized PnL (open positions at current prices)
  ├── Yield earned (lending rewards, LP fees, staking)
  └── Fees paid (transaction fees, protocol fees)
          │
          ▼
Performance Analysis
  ├── Returns: 7D, 30D, 90D, All-Time
  ├── Performance attribution by asset
  └── Performance attribution by protocol
          │
          ▼
Portfolio Health Score Calculation
(See Flow 7 for full detail)
          │
          ▼
Portfolio Insights Generated
(Canonical output: consumed by Risk, Strategy, Yield engines)
```

**Outputs:**
- Allocation Report
- Exposure Report (direct + indirect)
- PnL Report
- Performance Metrics
- Portfolio Health Score (0–100)
- Portfolio Snapshot (updated canonical state)

**Data sources:** Algorand Indexer, Gora Oracle (pricing), CoinGecko, Folks Finance API, Tinyman API, Pact API

---

## 4. Risk Analysis Flow

**Purpose:** Measure, monitor, and explain all material portfolio risks (Engine 2).

```
Portfolio Snapshot (from Engine 1)
+
Market Data (from Financial Knowledge Layer)
+
Protocol Data (Folks Finance, Tinyman, Pact)
          │
          ▼
Asset Risk Analysis
  ├── Per-asset volatility scoring
  ├── Asset correlation analysis
  └── Market risk exposure
          │
          ▼
Protocol Risk Analysis
  ├── TVL health check per protocol
  ├── Smart contract risk scoring
  └── Protocol concentration (% of portfolio per protocol)
          │
          ▼
Liquidity Analysis
  ├── Market liquidity per asset
  ├── LP pool depth analysis
  └── Exit feasibility estimation (time + slippage cost)
          │
          ▼
Concentration Analysis
  ├── HHI (Herfindahl-Hirschman Index) calculation
  ├── Asset concentration flags (above threshold → alert)
  └── Protocol concentration flags
          │
          ▼
Drawdown Analysis
  ├── Maximum historical drawdown
  ├── Current drawdown from ATH
  └── Drawdown episode history
          │
          ▼
Liquidation Monitoring (Folks Finance positions)
  ├── Current collateral ratio
  ├── Liquidation threshold proximity
  └── Alert generation if within danger zone
          │
          ▼
Stress Testing (configurable scenarios)
  ├── Market Crash (e.g., ALGO −40%)
  ├── Stablecoin Depeg
  ├── Liquidity Shock
  └── Protocol Failure
          │
          ▼
Risk Score Calculation
  ├── Overall Risk Score (0–100)
  ├── Asset-level scores
  └── Protocol-level scores
          │
          ▼
Risk Insights & Alerts Generated
```

**Outputs:**
- Overall Risk Score (0–100)
- Asset-level + protocol-level scores
- Concentration Report
- Liquidity Score
- Drawdown Metrics
- Stress Test Scenario Reports
- Liquidation proximity indicator
- Risk Alerts (pushed to Alert Flow)

**SOTA methods (sample):** Monte Carlo simulation, Bayesian models, Regime models

---

## 5. Yield Discovery Flow

**Purpose:** Discover, evaluate, and rank yield opportunities across integrated Algorand protocols (Engine 4).

```
User Portfolio State (from Engine 1)
+
User Risk Profile (from Engine 5)
          │
          ▼
Protocol Scan (parallel)
  ├── Folks Finance: lending APYs, available pools
  ├── Tinyman: LP APYs, trading fee yields
  └── Pact: LP APYs, trading fee yields
          │
          ▼
Opportunity Collection
  ├── Lending opportunities (by asset)
  ├── LP opportunities (by pool)
  └── Staking opportunities (where available)
          │
          ▼
Idle Capital Detection
  └── Assets earning no yield → flagged with suggestions
          │
          ▼
Liquidity Evaluation
  ├── Pool depth per opportunity
  └── Entry/exit liquidity
          │
          ▼
Protocol Risk Evaluation
  └── Per-protocol risk score applied to each opportunity
          │
          ▼
Yield Sustainability Analysis
  ├── Reward dependency score (token emission vs. fee revenue)
  ├── Yield stability (historical APY variance)
  └── Sustainability rating per opportunity
          │
          ▼
Risk-Adjusted Yield Scoring
  └── Raw APY discounted by risk score and sustainability
          │
          ▼
Personalization Filter (Engine 5 input)
  └── Opportunities outside user's risk tolerance filtered/ranked down
          │
          ▼
Opportunity Ranking
  ├── Rank 1: Risk-Adjusted APY (default view)
  └── Rank 2: Raw APY (alternate view)
          │
          ▼
Opportunity Recommendations Generated
```

**Outputs:**
- Full opportunity list (all discovered)
- Ranked opportunity list (risk-adjusted, user-filtered)
- Idle capital alerts
- Sustainability ratings per opportunity

**Protocols scanned:** Folks Finance, Tinyman, Pact  
**Data sources:** Folks Finance API, Tinyman API, Pact API, Gora Oracle (pricing), CoinGecko

---

## 6. User Intelligence & Profiling Flow

**Purpose:** Build and continuously evolve a dynamic investor profile for each user (Engine 5). Personalizes all other engine outputs.

```
User Data Collection (multi-source)
  ├── Explicit: Onboarding questionnaire (goals, risk appetite)
  ├── Portfolio: Current allocation, asset choices, protocol usage
  ├── Behavioral: Recommendations accepted vs. rejected
  ├── Query patterns: What the user asks the Copilot
  └── Historical: Past portfolio decisions and changes
          │
          ▼
Behavior Analysis
  ├── Risk-seeking vs. risk-averse signal extraction
  ├── Preference patterns (yield focus vs. growth vs. preservation)
  └── Engagement patterns (active vs. passive user)
          │
          ▼
Investor Persona Classification
  ├── Conservative: Low volatility, stablecoins, capital preservation
  ├── Balanced: Moderate risk, mixed allocation
  ├── Growth: Higher volatility acceptable, long-term upside focus
  ├── Aggressive: Maximum upside, high risk tolerance
  └── Yield Seeker: Passive income optimization focus
          │
          ▼
Dynamic Risk Profile Assignment
  ├── Risk tolerance band (low / medium / high)
  ├── Maximum acceptable concentration thresholds
  └── Yield preference weighting
          │
          ▼
Goal Tracking
  ├── Stated goals: income, growth, preservation, balanced
  ├── Target yield / return tracking
  └── Progress-to-goal calculation
          │
          ▼
Profile Published to Other Engines
  ├── Engine 2 (Risk): personalizes risk alert thresholds
  ├── Engine 3 (Strategy): aligns strategies to persona + goals
  └── Engine 4 (Yield): filters opportunities by risk tolerance
          │
          ▼
Continuous Update Loop
  └── Every user action → signals feed back into profile
```

**Outputs:**
- Investor Persona (with label + explanation)
- Dynamic Risk Profile
- Goal progress metrics
- Personalization signals distributed to Engines 2, 3, 4

**SOTA methods (sample):** Behavioral Finance models, Preference Learning

---

## 7. Portfolio Health Score Flow

**Purpose:** Generate a single 0–100 composite metric representing overall portfolio quality.

```
Portfolio Snapshot (from Engine 1)
          │
          ▼
Component Analysis (parallel)

  ┌─────────────────────┬──────────────────────────────┐
  │ Component           │ Evaluation                   │
  ├─────────────────────┼──────────────────────────────┤
  │ Diversification     │ Asset spread, category mix   │
  │ Concentration Risk  │ HHI, single-asset dominance  │
  │ Liquidity Adequacy  │ Exit feasibility, pool depth │
  │ Risk-Adjusted Yield │ Yield relative to risk taken │
  │ Yield Sustainability│ Reward dependency, stability │
  │ Protocol Quality    │ TVL health, protocol scores  │
  └─────────────────────┴──────────────────────────────┘
          │
          ▼
Weighted Score Calculation → Health Score (0–100)
          │
          ▼
Component Breakdown Generated
  ├── Score per component
  ├── Top 3 strengths identified
  └── Top 3 weaknesses identified
          │
          ▼
Actionable Improvement Suggestions
  └── At least one specific action per weakness
          │
          ▼
Health Score Output (with full breakdown)
```

**Output:** Health Score (0–100) + component breakdown + strengths + weaknesses + improvement actions

---

## 8. AI Insight Generation Flow

**Purpose:** Generate proactive, explainable, AI-driven insights from multi-engine analysis.

```
Trigger
  ├── Post-portfolio scan (automatic)
  ├── Scheduled refresh
  └── User requests insights
          │
          ▼
Multi-Engine Data Pull (parallel)
  ├── Engine 1: Portfolio Snapshot, Allocation, Exposure
  ├── Engine 2: Risk Score, Alerts, Vulnerabilities
  ├── Engine 4: Yield Opportunities, Idle Capital
  └── Engine 5: User Profile, Goals, Persona
          │
          ▼
Insight Generation Layer
  │
  ├── Exposure Insights
  │     "72% of your portfolio is indirectly exposed to ALGO"
  │
  ├── Performance Insights
  │     "45% of your 30D returns came from Folks Finance rewards"
  │
  ├── Idle Capital Insights
  │     "$420 USDC is generating no yield — here's the best option"
  │
  ├── Risk Insights
  │     "Concentration in one protocol creates liquidation risk"
  │
  ├── Yield Improvement Insights
  │     "You can increase expected yield by 2.1% without increasing risk"
  │
  └── Diversification Insights
        "Your portfolio has minimal stablecoin hedge"
          │
          ▼
Insight Ranking
  ├── Priority: urgency × relevance to user persona × actionability
  └── High-priority insights surfaced first
          │
          ▼
Explainability Layer Applied to Each Insight
  ├── Observation (what)
  ├── Data behind it (why)
  ├── Implication (so what)
  └── Suggested action (what now — optional)
          │
          ▼
Insights Delivered to User Dashboard + Copilot
```

**Output:** Ranked, explainable insight list with observation, data, implication, and optional action

---

## 9. Strategy Generation Flow

**Purpose:** Generate explainable, data-driven portfolio strategies aligned to user goals (Engine 3).

```
Inputs (multi-engine)
  ├── Portfolio Snapshot (Engine 1)
  ├── Risk Score + Vulnerabilities (Engine 2)
  ├── Yield Opportunities (Engine 4)
  └── Investor Persona + Goals (Engine 5)
+
Market Data (Financial Knowledge Layer)
          │
          ▼
Portfolio Analysis
  └── Current state: allocation, exposure, yield, health
          │
          ▼
Gap Analysis
  └── Difference between current state and optimal state
          (given user's persona + goals)
          │
          ▼
Optimization Engine
  ├── Black-Litterman allocation (sample SOTA)
  ├── Hierarchical Risk Parity (HRP) (sample SOTA)
  └── Risk Parity (sample SOTA)
          │
          ▼
Strategy Generation
  ├── Rebalancing Plan: specific asset moves with quantities
  ├── Allocation Plan: target allocation by asset/category/protocol
  └── Yield Plan: optimal yield allocation given risk profile
          │
          ▼
Expected Outcome Estimation
  ├── Projected yield improvement
  ├── Projected risk score change
  └── Projected health score change
          │
          ▼
Recommendation Explainability (mandatory for every strategy)
  ├── Reason: why this recommendation exists (data-backed)
  ├── Expected Outcome: quantified projected improvement
  ├── Risks: what could go wrong
  ├── Confidence Score: model certainty level
  └── Assumptions: what the model assumed
          │
          ▼
Strategy Output Delivered
```

**Outputs:**
- Rebalancing Plan (specific, executable actions)
- Allocation Plan (target state)
- Yield Optimization Plan
- Expected outcome estimates
- Full explainability per recommendation

---

## 10. Portfolio Rebalancing Flow

**Purpose:** Improve portfolio allocation from current to target state through guided execution.

```
Strategy Engine Output (Rebalancing Plan)
          │
          ▼
Current Allocation vs. Target Allocation
          │
          ▼
Asset Movement Calculation
  ├── Which assets to reduce (and by how much)
  ├── Which assets to increase (and by how much)
  └── Protocol actions required (swap, supply, withdraw, LP)
          │
          ▼
Execution Plan (POA) Generated
  ├── Ordered list of steps
  ├── Estimated cost per step
  └── Estimated outcome per step
          │
          ▼
Transaction Simulation
  └── Each step simulated — results and fees estimated
          │
          ▼
User Review & Approval
  └── User sees full plan, estimated costs, expected outcome
          │
    ┌─────┴──────┐
  Approved     Rejected
    │              │
    ▼              └── User modifies or dismisses
Policy Engine Validation
(Approval rules, risk limits, execution limits checked)
    │
    ▼
Orchestrator / Planner
(Finalizes execution order)
    │
    ▼
Execution Coordinator
(Manages multi-step sequence)
    │
    ▼
Haystack Router → Protocol Adapters
    │
    ▼
Wallet Signature → Algorand Blockchain
    │
    ▼
Transaction Monitoring & Confirmation
    │
    ▼
Portfolio Refresh (Engine 1 re-runs)
    │
    ▼
Updated Allocation Confirmed
```

**Output:** Updated portfolio allocation conforming to target state

---

## 11. Yield Optimization Flow

**Purpose:** Move capital to better yield opportunities based on Engine 4 rankings.

```
Engine 4 Output (Ranked Opportunities)
+
Current Positions (Engine 1)
          │
          ▼
Gap Analysis
  └── Current yield vs. best available risk-adjusted yield
          │
          ▼
Capital Allocation Analysis
  ├── Identify idle capital (no yield)
  ├── Identify underperforming positions
  └── Identify reallocation targets
          │
          ▼
Optimization Recommendations
  ├── Specific capital movements with expected yield delta
  └── Risk impact of each movement
          │
          ▼
Execution Plan (POA) Generated
  └── Ordered protocol actions with cost estimates
          │
          ▼
Transaction Simulation
          │
          ▼
User Review & Approval
          │
    ┌─────┴──────┐
  Approved     Rejected
    │
    ▼
→ Execution Flow (see Flow 12)
    │
    ▼
Portfolio Refresh
    │
    ▼
Updated Yield Strategy Confirmed
```

**Output:** Capital reallocated to optimal yield positions per user risk profile

---

## 12. Execution Flow

**Purpose:** Execute a user-approved action through the full orchestration pipeline and onto the Algorand blockchain.

> This flow applies to ALL execution — rebalancing, yield moves, manual swaps, lending, LP management.  
> No transaction proceeds without passing through the Policy Engine.

```
User Action / Approved Strategy
          │
          ▼
Execution Request Submitted to Copilot API
          │
          ▼
x402 Payment Check (if API-originated request)
  └── GoPlausible Facilitator: settle & track payment
          │
          ▼
┌─────────────────────────────────────────────┐
│  POLICY ENGINE (mandatory guardrail)        │
│                                             │
│  ✓ User approval confirmed                  │
│  ✓ Transaction policy validated             │
│  ✓ Risk limits not breached                 │
│  ✓ Execution limits not exceeded            │
│  ✓ KYC status validated (if required)       │
│                                             │
│  FAIL → Request rejected, reason surfaced   │
└─────────────────────────────────────────────┘
          │
          ▼ (PASS)
Orchestrator / Planner
  └── Plan of Action (POA) finalized
      (execution order, protocol routing, parameters)
          │
          ▼
Execution Coordinator
  └── Multi-step sequence management
      (step N+1 waits for step N success)
          │
          ▼
Haystack Router
  └── Routes each action to correct protocol adapter

  ┌──────────┬────────────┬──────────┬───────────────────┐
  │ Gora     │ Folks      │ Tinyman  │ Pact              │
  │ Oracle   │ Finance    │ DEX + LP │ DEX + LP          │
  │ (prices) │ (lending)  │          │                   │
  └──────────┴────────────┴──────────┴───────────────────┘
          │
          ▼
Transaction Generation
  ├── Transaction payload constructed
  ├── Human-readable summary prepared
  └── Payload verified against simulation
          │
          ▼
Transaction Simulation
  ├── Expected result
  ├── Estimated fees
  └── Warnings (if any)
          │
    ┌─────┴──────────────────┐
 Result OK              Unexpected Result
    │                        │
    │                        └── Flag to user; halt step
    ▼
User Wallet Signature
  └── Embedded wallet (Turnkey): in-app signing
          │
          ▼
Transaction Submitted to Algorand Blockchain
          │
          ▼
Transaction Monitoring
  ├── Confirmation awaited (instant finality on Algorand)
  └── Result returned
          │
          ▼
Audit Log Entry Created
  └── Action, result, timestamp, txn ID recorded
          │
          ▼
Portfolio Refresh Triggered (Engine 1)
          │
          ▼
Updated Portfolio State Available
```

**Outputs:**
- Executed action confirmed on-chain
- Transaction result and txn ID
- Audit log entry
- Refreshed portfolio snapshot

**Supported action types:** Supply (lending), Borrow, Repay, Withdraw, Token Swap, LP Provision, LP Withdrawal

---

## 13. AI Copilot Flow

**Purpose:** Route natural language user queries to the appropriate engine(s) and return explainable, actionable responses.

```
User Types Natural Language Query
          │
          ▼
Intent Detection
  ├── Portfolio query → Engine 1
  ├── Risk query → Engine 2
  ├── Strategy query → Engine 3
  ├── Yield query → Engine 4
  ├── Profile query → Engine 5
  ├── Execution intent → Engine 6 + Orchestration
  └── Complex intent → Multi-engine pipeline
          │
          ▼
Context Retrieval
  ├── Current portfolio snapshot
  ├── User investor profile (Engine 5)
  └── Conversation history (multi-turn context)
          │
          ▼
Engine Routing (query-specific)

  ┌────────────────────────────────────────────────────────┐
  │  Example Routing Map                                   │
  │                                                        │
  │  "What is my allocation?"     → Engine 1               │
  │  "Why is my portfolio risky?" → Engine 2               │
  │  "How can I improve returns?" → Engine 3               │
  │  "Find safer yield"           → Engine 4               │
  │  "What's my risk profile?"    → Engine 5               │
  │  "Am I near liquidation?"     → Engine 2               │
  │  "Rebalance my portfolio"     → Engine 3 → Engine 6    │
  │  "Move idle USDC to best yield" → Engine 4 → Engine 6  │
  └────────────────────────────────────────────────────────┘
          │
          ▼
Engine Analysis Executed
          │
          ▼
Response Generation
          │
          ▼
Explainability Layer Applied (mandatory)
  ├── Direct answer to the query
  ├── Data and reasoning behind the answer
  ├── Confidence level (where estimation involved)
  ├── Assumptions surfaced
  └── Suggested next action (optional)
          │
          ▼
Response Delivered to User
          │
          ▼
If execution intent detected in response:
  └── "Would you like me to [action]?"
        │
        ├── YES → Execution Flow (Flow 12)
        └── NO  → Conversation continues
```

**AI constraints enforced in this flow:**
- Copilot never recommends execution without routing through Policy Engine
- Copilot never hides uncertainty — low confidence is flagged
- All recommendations include rationale, risk, and confidence

---

## 14. x402 API Payment Flow

**Purpose:** Monetize intelligence API calls through per-request micropayment settlement.

```
Client / Agent Sends API Request
  ├── Direct REST call to Copilot API
  └── MCP tool invocation from external agent
          │
          ▼
Endpoint Classification
  ├── Free endpoint → proceed directly
  └── Paid endpoint → x402 payment flow
          │
          ▼
x402 Payment Verification
  └── Client must include valid x402 payment header
          │
          ▼
GoPlausible Facilitator
  ├── Validates payment
  ├── Settles payment on Algorand
  └── Records transaction for usage tracking
          │
    ┌─────┴──────┐
  Payment OK   Payment Failed
    │              │
    │              └── HTTP 402 response returned to client
    ▼
Engine Request Authorized & Executed
  ├── Engine 1: Portfolio APIs
  ├── Engine 2: Risk APIs
  ├── Engine 3: Strategy APIs
  ├── Engine 4: Yield APIs
  ├── Engine 5: User Intelligence APIs
  └── Engine 6: Execution APIs
          │
          ▼
Response Generated & Returned to Client
          │
          ▼
Usage Record Created
  ├── Endpoint called
  ├── Client identity
  ├── Payment amount & txn ID
  └── Timestamp
```

**Payment method:** x402 (HTTP 402-based micropayment protocol)  
**Settlement:** GoPlausible Facilitator on Algorand  
**Free tier:** Basic portfolio health, rate-limited  
**Paid tier:** All intelligence APIs, full resolution

---

## 15. MCP Client Flow

**Purpose:** Enable external AI agents (Claude, ChatGPT, Cursor, agent frameworks) to access CrestFlow intelligence and execution capabilities.

```
External AI Agent
  ├── Claude
  ├── ChatGPT
  ├── Cursor / Windsurf
  └── Custom agent framework
          │
          ▼
MCP Tool Request
  ├── Tool: query_portfolio
  ├── Tool: analyze_risk
  ├── Tool: discover_yield
  ├── Tool: generate_strategy
  ├── Tool: create_execution_plan
  ├── Tool: execute_action
  └── Tool: get_user_profile
          │
          ▼
Authentication Verification
  └── Valid auth token + API key required
          │
          ▼
x402 Payment Check (if paid tool)
  └── GoPlausible Facilitator payment settled
          │
          ▼
Portfolio Context Retrieval
  └── Relevant portfolio snapshot fetched for wallet in context
          │
          ▼
Engine Execution
  └── Routed to appropriate engine(s) based on tool
          │
          ▼
For execution tools: → Policy Engine (mandatory)
  └── User authorization token validated before any action
          │
          ▼
Structured Response Generated
  └── Machine-readable output formatted for MCP protocol
          │
          ▼
MCP Response Returned to Agent
```

**MCP tool → engine mapping:**

| MCP Tool | Engine |
|---|---|
| `query_portfolio` | Engine 1 |
| `analyze_risk` | Engine 2 |
| `generate_strategy` | Engine 3 |
| `discover_yield` | Engine 4 |
| `get_user_profile` | Engine 5 |
| `create_execution_plan` | Engine 6 + Orchestration |
| `execute_action` | Engine 6 + Orchestration + Policy Engine |

---

## 16. Risk Alert & Monitoring Flow

**Purpose:** Proactively notify users when their portfolio enters a risk condition requiring attention.

```
Continuous Portfolio Monitoring
  └── Scheduled refresh of portfolio state + market data
          │
          ▼
Risk Trigger Evaluation (Engine 2)

  ┌────────────────────────────────────────────────────┐
  │  Trigger Conditions                                │
  │                                                    │
  │  • Concentration > configured threshold            │
  │  • Liquidity drop below minimum                    │
  │  • Health Score decline > N points                 │
  │  • Protocol risk score increase                    │
  │  • Liquidation proximity (Folks Finance)           │
  │  • Stablecoin depeg detected                       │
  └────────────────────────────────────────────────────┘
          │
          ▼
Alert Generated
  ├── Alert type classified (critical / warning / info)
  ├── Affected position identified
  └── Impact estimated
          │
          ▼
Alert Prioritization
  └── Ranked by: severity × portfolio impact × user urgency preference
          │
          ▼
Alert Enrichment
  ├── What triggered the alert
  ├── Current state vs. safe threshold
  ├── Estimated portfolio impact
  └── Recommended action
          │
          ▼
User Notification Delivered
  ├── In-app notification
  └── (Future) Push / email notification
          │
          ▼
User Response
  ├── Views alert + takes action → Execution Flow
  └── Dismisses alert → logged; monitoring continues
```

**Alert types:** Concentration Alert, Liquidity Alert, Health Score Alert, Protocol Risk Alert, Liquidation Alert, Stablecoin Alert

---

## 17. Market Opportunity Alert Flow

**Purpose:** Proactively notify users when a relevant yield or capital improvement opportunity is detected.

```
Continuous Market Monitoring
  └── Scheduled yield data refresh (Folks Finance API, Tinyman API, Pact API)
          │
          ▼
Opportunity Detection (Engine 4)

  ┌─────────────────────────────────────────────┐
  │  Trigger Conditions                         │
  │                                             │
  │  • APY increase above user threshold        │
  │  • New opportunity detected                 │
  │  • Better risk-adjusted yield available     │
  │  • Idle capital detected                    │
  │  • User's current position underperforming  │
  └─────────────────────────────────────────────┘
          │
          ▼
Relevance Scoring
  └── Score against user's investor profile (Engine 5):
      ├── Within user risk tolerance?
      ├── Aligned to user goals?
      └── Materially better than current position?
          │
          ▼
Notification Created
  ├── Opportunity summary
  ├── Estimated yield improvement
  ├── Risk delta vs. current position
  └── Suggested action
          │
          ▼
User Notification Delivered
          │
          ▼
User Response
  ├── Accepts → Yield Optimization Flow (Flow 11)
  └── Dismisses → logged; preference learning updated (Engine 5)
```

---

## 18. Goal-Based Planning Flow

**Purpose:** Create personalized portfolio strategies aligned to a specific user goal.

```
User Selects or Updates Financial Goal
  ├── Wealth Growth
  ├── Passive Income (yield maximization)
  ├── Capital Preservation
  └── Balanced Growth
          │
          ▼
Goal Parameters Captured
  ├── Target yield % (if income goal)
  ├── Target growth % (if growth goal)
  ├── Time horizon
  └── Maximum acceptable drawdown
          │
          ▼
Engine 5: Goal stored in user profile
          │
          ▼
Engine 3: Strategy aligned to goal

  ├── Capital Preservation → Low-risk, stablecoin-heavy, minimize volatility
  ├── Passive Income → Maximize sustainable risk-adjusted yield
  ├── Wealth Growth → Higher volatility tolerance, growth assets
  └── Balanced → Optimize risk-adjusted returns across all dimensions
          │
          ▼
Portfolio Gap Analysis
  └── Current allocation vs. goal-optimal allocation
          │
          ▼
Goal-Aligned Strategy Generated
  ├── Recommended target allocation
  ├── Specific rebalancing actions to reach target
  └── Expected progress toward goal per period
          │
          ▼
Strategy Explained
  ├── Why this allocation serves the goal
  ├── Expected return at target
  ├── Risk of not achieving goal
  └── Confidence score
          │
          ▼
User Reviews → Approves → Execution Flow (Flow 12)
          │
          ▼
Ongoing Goal Progress Tracking (Engine 5)
```

---

## 19. Future — Autonomous Agent Flow

**Purpose (Phase 3):** Enable pre-authorized, agent-driven portfolio management without per-action approval.

> Requires explicit user opt-in. All actions bounded by pre-set policy limits.

```
User Configures Autopilot Rules (one-time setup)
  ├── Maximum position size per protocol
  ├── Maximum risk score tolerance
  ├── Minimum yield threshold
  ├── Rebalancing trigger thresholds
  └── Daily execution limits
          │
          ▼
Policy Engine Stores Autopilot Ruleset
          │
          ▼
Continuous Portfolio Monitoring (Agent Loop)
          │
          ▼
Portfolio Event Detected
  ├── Drift from target allocation
  ├── Better yield opportunity detected
  ├── Risk score threshold breached
  └── Idle capital detected
          │
          ▼
Opportunity Analysis (Engines 2, 3, 4)
          │
          ▼
Risk Validation
  └── Does proposed action stay within Policy Engine rules?
          │
    ┌─────┴────────┐
  Within limits  Exceeds limits
    │                │
    │                └── Action blocked; user notified
    ▼
Strategy Generated (Engine 3)
          │
          ▼
Execution Plan Created (Engine 6)
          │
          ▼
Policy Engine Validates Against Autopilot Ruleset
          │
          ▼
Automated Execution (no per-action approval needed)
  └── Haystack Router → Protocol Adapters → Algorand
          │
          ▼
Audit Log Entry Created
          │
          ▼
User Notification (post-execution summary)
          │
          ▼
Feedback Loop
  └── Execution result feeds back into Engine 5 (preference learning)
```

**Phase 3 autopilot capabilities:** Auto Rebalancing, Yield Rotation, Risk Reduction, Capital Deployment

---

## 20. Future — Multi-Agent Orchestration Flow

**Purpose (Phase 3):** Coordinate specialized AI agents that each own a domain of financial intelligence, collaborating to manage a portfolio autonomously.

```
Portfolio Event / Trigger
  └── Market change, time-based, or threshold-triggered
          │
          ▼
Portfolio Agent (Engine 1 proxy)
  └── Analyzes current state; publishes normalized snapshot
          │
          ▼
Risk Agent (Engine 2 proxy)
  └── Evaluates risk; flags vulnerabilities; publishes risk signals
          │
          ▼
Yield Agent (Engine 4 proxy)
  └── Discovers opportunities; publishes ranked opportunity list
          │
          ▼
Strategy Agent (Engine 3 proxy)
  └── Synthesizes signals; generates multi-step strategy proposal
          │
          ▼
Execution Agent (Engine 6 proxy)
  └── Translates strategy into an executable Plan of Action (POA)
          │
          ▼
Policy Engine Validation
  └── All agents' proposed actions validated against user policy
          │
    ┌─────┴──────┐
  Approved    Rejected
    │              │
    │              └── Agents notified; strategy revised
    ▼
User Approval (or Autopilot execution if pre-authorized)
    │
    ▼
Execution Coordinator → Haystack Router → Algorand
    │
    ▼
All Agents Updated with New Portfolio State
    │
    ▼
Feedback Loop → Agents refine strategies
```

**Agent communication:** All agents communicate through defined portfolio state contracts — no direct engine coupling.

---

## End-to-End Core User Journey

**The complete journey from first visit to continuous portfolio intelligence and execution.**

```
User Visits CrestFlow
          │
          ▼
Auth + Embedded Wallet Created (Turnkey)
          │
          ▼
[Optional] KYC → DID → VC (GoPlausible)
          │
          ▼
Wallet Connected / On-Ramp Funded
          │
          ▼
Portfolio Imported (Algorand Indexer + Protocol APIs)
          │
          ▼
─────────── INTELLIGENCE LAYER ───────────
          │
          ├── Engine 1: Portfolio Intelligence Generated
          │     → Snapshot, Allocation, Exposure, Health Score
          │
          ├── Engine 2: Risk Analysis Generated
          │     → Risk Score, Alerts, Vulnerabilities
          │
          ├── Engine 4: Yield Opportunities Generated
          │     → Ranked opportunities, Idle capital detected
          │
          └── Engine 5: Investor Profile Built
                → Persona, Risk Profile, Goals
          │
          ▼
AI Insights Generated (multi-engine synthesis)
          │
          ▼
User Reviews Dashboard
  ├── Portfolio overview
  ├── Health score
  ├── Risk alerts
  ├── Yield opportunities
  └── AI insights
          │
          ▼
User Interacts with AI Copilot
  └── Natural language queries answered with explainability
          │
          ▼
─────────── ORCHESTRATION LAYER ───────────
          │
          ▼
Engine 3: Strategy Recommendations Generated
  └── Rebalancing plan, Yield optimization, Goal alignment
          │
          ▼
User Reviews & Approves Action
          │
          ▼
Policy Engine → Orchestrator → Execution Coordinator
  └── Haystack Router → Gora Oracle + Protocol Adapters
          │
          ▼
Wallet Signature → Algorand Blockchain
(Fully auditable, instant finality)
          │
          ▼
Portfolio Refreshed (Engine 1 re-runs)
          │
          ▼
─────────── MONITORING LAYER ───────────
          │
          ▼
Continuous Background Monitoring
  ├── Risk threshold alerts
  ├── Yield opportunity alerts
  └── Health score change alerts
          │
          ▼
New Alerts / Insights → User Notified
          │
          ▼
Repeat (continuous improvement loop)
```
