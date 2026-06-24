# CrestFlow — Frontend Context

> This file is updated after every backend integration to capture all frontend requirements for that feature.
> It serves as the source of truth for the dashboard build (Plan 8 and beyond).
> Format: newest sections at the top within each module.

---

## Module: Engine 3 — Strategy & Optimization

**Backend Plan:** `plans/05-engine3-strategy-optimization.md`
**Depends on:** Engine 1 + Engine 2 running, at least 1 portfolio + risk snapshot written
**API Base:** `GET|POST|PUT /api/v1/strategy/*`

### Screens / Components Required

#### 1. Goal Profile Selector
- 3-button toggle: **CONSERVATIVE** / **MODERATE** / **AGGRESSIVE**
- Each button shows a 1-line description:
  - Conservative: "Capital preservation — max 25% volatile"
  - Moderate: "Balanced growth — max 55% volatile"
  - Aggressive: "Max yield — up to 85% volatile"
- Changing a goal shows a **simulation preview** (side-by-side comparison) BEFORE saving
- Simulation preview: projected risk score delta, allocation delta per asset
- "Confirm" saves via `PUT /api/v1/strategy/goal` and triggers recompute
- "Cancel" reverts — no API call made
- Current active profile highlighted with colored border

#### 2. Strategy Allocation Card
- Two donut charts side-by-side:
  - Left: **Current Allocation** (from `currentAllocation`)
  - Right: **Target Allocation** (from `targetAllocation`)
- Assets colored consistently across both charts
- Below charts: model badge — "Powered by **HRP + CVaR**" with tooltip
- Tooltip content: plain-English description ("Uses hierarchical clustering and tail-risk minimization to build a diversified allocation")
- `EQUAL_WEIGHT` model → grey badge + "Building your profile — 14+ days of data needed"
- `defensiveMode: true` → amber banner: "Defensive mode active — risk score exceeds your MODERATE profile cap"
- "Computed X minutes ago" timestamp

#### 3. Rebalancing Action List
- Ordered cards (largest drift first)
- Per action card:
  - **Asset symbol** + direction arrow (↑ INCREASE / ↓ DECREASE)
  - **Urgency badge**: CRITICAL (red pulsing), HIGH (red), MEDIUM (amber), LOW (grey)
  - Current % → Target % with animated transition arrow
  - Delta % (e.g. -22.22%)
  - Estimated USD impact (e.g. ~-$3,241.98)
  - "Learn Why" accordion → opens strategy explainer content for this specific asset
- Empty state: "Your portfolio is already well-aligned with your target allocation ✓"
- High-vol mode notice: "Wider rebalancing threshold applied (8%) — market volatility is elevated"

#### 4. Strategy Simulation Panel
- Accessible from Goal Profile Selector (auto-opens on goal change)
- Also accessible via standalone "Simulate" button
- Inputs: select goal profile (dropdown)
- Output (side-by-side):
  - Left column: Current strategy (model, goal, projected risk score, top 3 actions)
  - Right column: Simulated strategy (same fields under new profile)
- Delta badge between columns: "Risk score: 52 → 28 (↓24)" in green/red
- "Apply this strategy" button → triggers `PUT /strategy/goal` with selected profile

#### 5. Strategy Explainer Panel
- Expandable section on the strategy page
- Pulled from `GET /api/v1/strategy/explain`
- Renders:
  - Model used (human label, not enum)
  - Data points badge: "Based on 42 snapshots"
  - Goal profile badge
  - Risk context line
  - Reason cards (1 card per reason in the `reasons[]` array)
  - Disclaimer in muted small text
- Opens in a slide-in drawer on mobile; inline section on desktop

#### 6. Strategy History Chart
- Stacked area chart: target allocation % per asset over time
- X-axis: date, Y-axis: allocation %
- Each asset a distinct color band
- Hovering a point shows: date, model used, goalProfile, rebalanceRequired badge
- Toggle: "Current" vs "History" view
- Sourced from `GET /api/v1/strategy/history`

#### 7. Refresh Button
- Same pattern as Engine 1 — `POST /api/v1/strategy/refresh`
- Button → "Recalculating…" spinner → on new snapshot, update all components

### State Added
- `strategy.allocation` — target + current allocation weights
- `strategy.model` — ModelType enum + human label
- `strategy.goalProfile` — active goal profile
- `strategy.defensiveMode` — boolean flag
- `strategy.rebalancingActions` — ordered action list
- `strategy.rebalanceRequired` — boolean
- `strategy.explain` — StrategyExplanation object
- `strategy.history` — paginated snapshot list
- `strategy.simulation` — simulated output for a given goal profile
- `strategy.computedAt` — ISO8601 timestamp

### API Calls

| Trigger | Method | Endpoint |
|---|---|---|
| Strategy tab load | GET | `/api/v1/strategy/allocation` |
| Rebalance tab | GET | `/api/v1/strategy/rebalance` |
| "Learn Why" expand | GET | `/api/v1/strategy/explain` |
| Goal change (preview) | POST | `/api/v1/strategy/simulate` |
| Goal change (confirm) | PUT | `/api/v1/strategy/goal` |
| Refresh button | POST | `/api/v1/strategy/refresh` |
| History chart | GET | `/api/v1/strategy/history` |

### UX Rules
- Goal change → simulation preview FIRST, confirm saves. No instant writes.
- Defensive mode banner always at the very top of the strategy page if active
- CRITICAL urgency action → red card with slow pulsing border animation
- All deltas shown as both % AND estimated USD (never % alone)
- Model badge tooltip uses plain English — no math notation in UI
- `EQUAL_WEIGHT` → grey badge + progress indicator showing days until next model upgrade
- Simulation panel is read-only — clearly labeled "Preview only — not yet applied"
- "Learn Why" drawer cites specific Engine 2 signals that drove the recommendation

---

## Module: Engine 2 — Risk Intelligence

**Backend Plan:** `plans/04-engine2-risk-intelligence.md`  
**Depends on:** Engine 1 snapshot written, Engine 2 backend running  
**API Base:** `GET /api/v1/risk/*`, `PATCH /api/v1/risk/alerts/:id/dismiss`

### Screens / Components Required

#### 1. Risk Score Card
- Large 0–100 dial (animated sweep on load)
- Color-coded: 0–39 green, 40–59 amber, 60–79 red, 80–100 flashing red
- Risk level badge: LOW / MEDIUM / HIGH / CRITICAL
- "Last analyzed" timestamp
- Alert count badge (e.g. "2 active alerts")

#### 2. Risk Component Breakdown
- 5 horizontal bars with labels and scores:
  - Market Risk (CVaR-based)
  - Liquidation Risk
  - Concentration Risk
  - Protocol Risk
  - Exit Liquidity Risk
- Each bar: 0–100 fill, color matching severity

#### 3. Market Risk Section
- CVaR card: "In the worst 5% of days, your portfolio loses **X%** on average"
  - Shown in plain English — not as raw decimal
- Sortino Ratio: labelled "Risk-Adjusted Returns" with positive/negative indicator
- Max Drawdown: "Worst decline from peak: X%"
- Calmar Ratio: "Return per unit of drawdown risk: X"
- Volatility strip: 7D and 30D annualized volatility (% badges)
- `insufficientHistory: true` → show "Building risk profile — X more days of data needed" grey card instead of metrics

#### 4. Liquidation Monitor
- Only shown if `hasActiveBorrows: true`
- Per-position row: asset symbol, health factor (large), distance % to liquidation, status badge
- Color coding: SAFE = green, MODERATE = amber, WARNING = orange, CRITICAL = red
- If no borrows → "No active borrow positions — liquidation risk is zero"

#### 5. Alerts Panel
- List of active alerts, sorted by severity (CRITICAL → HIGH → MEDIUM → LOW)
- Each alert: severity badge, title, message, "X ago" timestamp
- "Dismiss" button per alert → `PATCH /api/v1/risk/alerts/:id/dismiss`
- Dismissed alerts move to collapsed "Dismissed" accordion
- Empty state: "No active risk alerts — your portfolio looks clean"
- New alerts since last visit → highlight with pulsing border

#### 6. Concentration Heatmap
- Two side-by-side donut charts:
  - Asset HHI: biggest asset slices labeled (ALGO 67%, USDC 24%...)
  - Protocol HHI: protocol slices (Folks 45%, native 35%, Tinyman 15%, Pact 5%)
- Below: "Concentration Index: X / 10,000 — [Unconcentrated / Moderate / High]"

### State Added
- `risk.score` — composite risk score + level
- `risk.components` — 5 component scores
- `risk.market` — CVaR, Sortino, MDD, Calmar, volatility
- `risk.liquidation` — positions + minHealthFactor
- `risk.concentration` — asset HHI + protocol HHI
- `risk.alerts` — active alert list
- `risk.insufficientHistory` — boolean flag

### API Calls

| Trigger | Method | Endpoint |
|---|---|---|
| Risk tab load | GET | `/api/v1/risk/score` |
| Market sub-tab | GET | `/api/v1/risk/market` |
| Liquidation sub-tab | GET | `/api/v1/risk/liquidation` |
| Concentration sub-tab | GET | `/api/v1/risk/concentration` |
| Alert panel load | GET | `/api/v1/risk/alerts?status=ACTIVE` |
| Dismiss button | PATCH | `/api/v1/risk/alerts/:id/dismiss` |

### UX Rules
- Risk score 0–39 = green, 40–59 = amber, 60–79 = red, 80–100 = pulsing red
- CVaR must always be shown in plain English ("you lose X% on average"), never as "-0.08421"
- `insufficientHistory: true` → grey placeholder cards with explanation, no empty states
- Liquidation section hidden entirely when no borrow positions
- CRITICAL alert severity → full-width banner at top of risk page
- Alert dismiss is immediate (optimistic UI) — API call fires async

---

## Module: Engine 1 — Portfolio Intelligence


**Backend Plan:** `plans/03-engine1-portfolio-intelligence.md`  
**Depends on:** Auth module (JWT), Engine 1 backend running and snapshot written  
**API Base:** `GET /api/v1/portfolio/*`, `POST /api/v1/portfolio/refresh`

### Screens / Components Required

#### 1. Portfolio Overview Card
- Total value in USD (large, primary)
- 24h change: `+$631.50 (+4.44%)` — green if positive, red if negative
- Health score badge: color-coded (0–40 red, 41–70 amber, 71–100 green)
- Last updated timestamp + "Refresh" button
- Loading skeleton while `POST /refresh` is processing

#### 2. Allocation Section (3 tabs)
- **By Asset** — pie chart + table: symbol, value, %
- **By Category** — donut chart: volatile / stablecoin / lending
- **By Protocol** — donut chart: native / Folks / Tinyman / Pact

#### 3. Exposure Section
- Toggle: Direct / Indirect / True exposure
- Per-asset bar chart showing direct vs indirect stacked
- Callout card: "Your true ALGO exposure is 67.4% — higher than it appears due to LP positions"
- IL warning row per LP pool: "ALGO/USDC LP — IL: -0.82% (-$42.18)"

#### 4. Performance Section (4 tabs)
- **7D / 30D / 90D / All-time** tabs
- Line chart: portfolio value over time (built from snapshot history)
- Return % and return USD for selected period
- Below chart: PnL breakdown grid (unrealized / realized / yield / fees / net)

#### 5. Health Score Section
- Circular dial 0–100 (animated fill on load)
- 5 sub-bars: Diversification / Liquidity / Yield Quality / Sustainability / Protocol Health
- Strengths list (green checkmarks)
- Weaknesses list (amber/red warnings)
- HHI displayed as "Concentration Index: 2841 / 10,000 — Moderate"

#### 6. Positions List
- All native holdings: symbol, amount, price, value
- All protocol positions: protocol tag, type (Supply/Borrow/LP), asset pair, value, APY
- LP positions show decomposed view (toggle): "ALGO + USDC underlying"
- Sort by: Value (default) / APY / Protocol

#### 7. Refresh Button Flow
- Button triggers `POST /api/v1/portfolio/refresh` → 202 Accepted
- Button becomes "Refreshing…" with spinner
- Poll `GET /api/v1/portfolio/overview` every 5s until `snapshotAt` changes
- On new snapshot: update all sections without full page reload

#### 8. Empty State (first-time user)
- Shown if no snapshot exists yet
- Message: "Your portfolio is being scanned for the first time…"
- Progress indicator (indeterminate)

### State Added
- `portfolio.overview` — overview card data
- `portfolio.allocation` — allocation breakdown
- `portfolio.exposure` — direct/indirect/true exposure + IL
- `portfolio.performance` — returns + PnL by period
- `portfolio.health` — score + components + insights
- `portfolio.positions` — full positions list
- `portfolio.loading` — scan in progress flag
- `portfolio.lastSnapshotAt` — ISO8601 timestamp

### API Calls

| Trigger | Method | Endpoint |
|---|---|---|
| Dashboard load | GET | `/api/v1/portfolio/overview` |
| Allocation tab | GET | `/api/v1/portfolio/allocation` |
| Exposure tab | GET | `/api/v1/portfolio/exposure` |
| Performance tab | GET | `/api/v1/portfolio/performance` |
| Health tab | GET | `/api/v1/portfolio/health` |
| Refresh button | POST | `/api/v1/portfolio/refresh` |

### UX Rules
- All monetary values displayed with 2 decimal places (e.g., `$14,832.50`)
- All percentages displayed with 2 decimal places (e.g., `4.44%`)
- IL is always shown as negative: `-0.82%` — never hidden
- Health score changes animate (count up/down) when refreshed
- `isPartial: true` snapshot → show amber banner "Some data sources unavailable — partial view"
- Empty exposure tab while loading → skeleton bars, not blank

---



## How to Read This File

Each section maps to a backend integration that has been planned or completed.
For each integration, this file documents:
- What screens/views the frontend needs
- What API calls each screen makes
- What state it manages
- UX behaviour and flows
- Data shapes the frontend consumes

---

## Module: Auth + Turnkey Wallet (Onboarding)

**Backend Plan:** `plans/01-auth-turnkey-onboarding.md`  
**API Base:** `POST /api/v1/auth/google`, `GET /api/v1/auth/me`

### Screens Required

#### 1. Landing / Login Screen
- "Sign in with Google" button — triggers Google OAuth popup
- On success: frontend receives Google `id_token`, sends to `POST /api/v1/auth/google`
- On response: stores returned `accessToken` (httpOnly cookie or secure localStorage)
- Redirect to Dashboard after successful auth

#### 2. Onboarding Loading State
- Shown between first Google sign-in and dashboard load
- Message: "Setting up your CrestFlow account and Algorand wallet..."
- Displayed while backend creates Turnkey sub-org + wallet + triggers portfolio scan
- Should not be skippable

#### 3. Wallet Ready State (inline in Dashboard)
- Shows Algorand address (truncated, copyable)
- Shows "Wallet active" badge
- Turnkey logo/attribution

### State to Manage
- `user.id`, `user.email`, `user.name`
- `user.algorandAddress` — shown in header/sidebar
- `user.walletId` — stored for signing flow (Engine 6)
- `user.kycStatus` — controls visibility of execution features
- `accessToken` — JWT for all subsequent API calls

### API Calls

| Trigger | Method | Endpoint | Payload |
|---|---|---|---|
| Google sign-in success | POST | `/api/v1/auth/google` | `{ idToken: string }` |
| Page load / token refresh | GET | `/api/v1/auth/me` | — (JWT in header) |

### Response Shapes

**POST /api/v1/auth/google**
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Aditya",
      "algorandAddress": "ALGO...",
      "kycStatus": "PENDING",
      "isNewUser": true
    }
  }
}
```

**GET /api/v1/auth/me**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Aditya",
    "algorandAddress": "ALGO...",
    "kycStatus": "PENDING"
  }
}
```

### UX Rules
- Google button only — no email/password fields on this screen
- If user is already authenticated (valid JWT), skip login and go to dashboard directly
- Show a spinner/loading screen while wallet is being provisioned (first sign-in only)
- `isNewUser: true` in response = show onboarding loading state before dashboard
- `isNewUser: false` = go directly to dashboard
- Algorand address should be truncated on display: `ABCD...WXYZ`
- Never show wallet ID or sub-org ID in the UI

---

*More sections will be added here as each backend integration plan is written.*
