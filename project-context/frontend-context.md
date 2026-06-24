# CrestFlow — Frontend Context

> This file is updated after every backend integration to capture all frontend requirements for that feature.
> It serves as the source of truth for the dashboard build (Plan 8 and beyond).
> Format: newest sections at the top within each module.

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
