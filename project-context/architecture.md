# CrestFlow — Architecture

> This file evolves with the project.
> DB schemas are added and updated here as each domain is implemented.
> All schemas must align with the domain model defined in `system-architecture.png` and `instructions.md`.

---

## Schema Conventions

- All monetary values stored as `DECIMAL` or `TEXT` (never `FLOAT` or `DOUBLE`)
- All timestamps stored as `TIMESTAMPTZ` (UTC)
- All IDs use `UUID` unless a natural key exists
- All financial snapshots are immutable once committed — append-only
- Audit log tables are append-only — no deletes, no updates

---

## Domains

1. [Identity](#identity)
2. [Portfolio](#portfolio)
3. [Risk](#risk)
4. [Yield](#yield)
5. [Strategy](#strategy)
6. [Execution](#execution)
7. [User Intelligence](#user-intelligence)
8. [Audit](#audit)

---

## Identity

> Covers: user accounts, embedded wallets, KYC status, DID/VC linkage.
> **Plan:** `plans/01-auth-turnkey-onboarding.md`
> **Status:** Planned — not yet implemented.

```prisma
model User {
  id                  String    @id @default(uuid()) @db.Uuid
  email               String    @unique
  name                String?
  googleId            String?   @unique

  // Turnkey — embedded Algorand wallet
  turnkeySubOrgId     String?   @unique   // Turnkey sub-organization ID (one per user)
  walletId            String?   @unique   // Turnkey wallet ID — used for signing (Engine 6)
  algorandAddress     String?   @unique   // Algorand base32 public address — used for Indexer queries

  // KYC — managed in P1 KYC plan
  kycStatus           KycStatus @default(PENDING)
  didId               String?   @unique   // GoPlausible DID (P1)
  vcId                String?   @unique   // GoPlausible VC (P1)

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@map("users")
}

enum KycStatus {
  PENDING
  SUBMITTED
  VERIFIED
  REJECTED
}
```

**Notes:**
- `id` is UUID — never auto-increment integer
- `algorandAddress` is the Turnkey-derived address using `CURVE_ED25519` + `ADDRESS_FORMAT_ALGORAND` + path `m/44'/283'/0'/0/0`
- `walletId` is the Turnkey internal wallet identifier — stored for use by Engine 6 signing flow
- `turnkeySubOrgId` maps one sub-organization (isolated key vault) per CrestFlow user
- KYC fields (`didId`, `vcId`) remain null until P1 KYC plan is implemented

---

## Portfolio

> Covers: portfolio snapshots, asset holdings, protocol positions, performance records.
> **Plan:** `plans/03-engine1-portfolio-intelligence.md`
> **Status:** Planned — not yet implemented.

```prisma
model PortfolioSnapshot {
  id                    String          @id @default(uuid()) @db.Uuid
  userId                String          @db.Uuid
  snapshotAt            DateTime        // UTC timestamp of portfolio state — NOT createdAt
  trigger               SnapshotTrigger

  // Top-level value
  totalValueUsd         String          // DECIMAL string — never float
  previousValueUsd      String?
  changeValueUsd        String?
  changePercent         String?

  // Allocation (JSONB)
  assetAllocation       Json            // Record<symbol, { valueUsd, percent }>
  categoryAllocation    Json            // { volatile, stablecoin, lending }
  protocolAllocation    Json            // { native, folks, tinyman, pact }

  // Exposure (JSONB)
  directExposure        Json            // raw wallet holdings
  indirectExposure      Json            // LP-decomposed only
  trueExposure          Json            // direct + indirect

  // PnL
  unrealizedPnlUsd      String
  realizedPnlUsd        String
  yieldEarnedUsd        String
  feePaidUsd            String
  impermanentLossUsd    String          // aggregate IL across all LP positions

  // Performance
  return7dPercent       String?
  return30dPercent      String?
  return90dPercent      String?
  returnAllTimePercent  String?

  // Health Score
  healthScore           Int             // 0–100 integer
  healthComponents      Json            // { diversification, liquidity, yieldQuality, sustainability, protocolHealth }
  strengths             Json            // string[]
  weaknesses            Json            // string[]

  // Concentration
  hhi                   String          // DECIMAL 0–10000

  // Data Quality
  dataQuality           Json            // { indexer, folks, tinyman, pact } → 'ok' | 'failed'
  isPartial             Boolean         @default(false)

  // Full position data for audit + replay
  assetHoldings         Json            // AssetHolding[]
  protocolPositions     Json            // ProtocolPosition[]
  lpDecomposition       Json            // Record<lpTokenId, { asset1, asset2, ilPercent }>

  // Immutability: NO updatedAt. No soft-delete. INSERT only.
  createdAt             DateTime        @default(now())

  user                  User            @relation(fields: [userId], references: [id])

  @@index([userId, snapshotAt(sort: Desc)])
  @@map("portfolio_snapshots")
}

model AssetCostBasis {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @db.Uuid
  assetId         Int       // Algorand ASA ID (0 = native ALGO)
  symbol          String
  totalQuantity   String    // DECIMAL
  totalCostUsd    String    // DECIMAL
  avgCostUsd      String    // DECIMAL — weighted average cost per unit
  lastTxAt        DateTime?
  updatedAt       DateTime  @updatedAt

  user            User      @relation(fields: [userId], references: [id])

  @@unique([userId, assetId])
  @@map("asset_cost_basis")
}

enum SnapshotTrigger {
  ONBOARDING
  MANUAL
  POST_EXECUTION
  SCHEDULED
}
```

**Notes:**
- `portfolio_snapshots` is **INSERT-only** — DB role has no UPDATE/DELETE on this table
- All monetary fields are `DECIMAL STRING` — never `Float` or `Int`
- `snapshotAt` is the canonical time of portfolio state; `createdAt` is when the row was written
- Full `assetHoldings` + `protocolPositions` stored as JSONB for complete audit replay
- `lpDecomposition` records the ownership ratio and IL% per LP pool
- `assetCostBasis` is mutable — updated via weighted average cost on each new transaction

---

## Financial Knowledge Layer

> This module has **no DB tables** — it is a pure adapter and caching layer.
> **Plan:** `plans/02-financial-knowledge-layer.md`
> **Status:** Planned — not yet implemented.

**Redis cache namespaces (no SQL schema):**

| Namespace | TTL | Contents |
|---|---|---|
| `crestflow:price:*` | 60s | CoinGecko token prices |
| `crestflow:indexer:account:*` | 30s | Algorand account holdings |
| `crestflow:indexer:txns:*` | 30s | Transaction history |
| `crestflow:indexer:asa:*` | 3600s | ASA metadata (name, decimals) |
| `crestflow:folks:positions:*` | 30s | Folks Finance user positions |
| `crestflow:folks:pools:*` | 300s | Folks Finance pool APYs |
| `crestflow:tinyman:positions:*` | 30s | Tinyman LP positions |
| `crestflow:tinyman:pools:*` | 300s | Tinyman pool state |
| `crestflow:pact:pools:*` | 300s | Pact pool analytics |
| `crestflow:pact:positions:*` | 30s | Pact LP positions |

**Canonical output types (consumed by Engine 1+):**
- `AssetHolding` — normalized token holding with USD value
- `ProtocolPosition` — supply/borrow/LP position with APY
- `PriceData` — token price with 24h change and market cap
- `TransactionRecord` — normalized on-chain transaction

---

## Risk

> Covers: risk scores, concentration, liquidation monitoring, market risk metrics, alerts.
> **Plan:** `plans/04-engine2-risk-intelligence.md`
> **Status:** Planned — not yet implemented.

```prisma
model RiskSnapshot {
  id                    String    @id @default(uuid()) @db.Uuid
  userId                String    @db.Uuid
  portfolioSnapshotId   String    @db.Uuid
  analyzedAt            DateTime

  // Market Risk (CVaR-based)
  cvar95Percent         String?   // DECIMAL — null if insufficient history
  var95Percent          String?
  sortinoRatio          String?
  maxDrawdownPercent    String?
  calmarRatio           String?
  realizedVol7dPercent  String?
  realizedVol30dPercent String?
  snapshotsUsed         Int
  insufficientHistory   Boolean   @default(false)

  // Liquidation Risk
  liquidationPositions  Json?     // [{ marketId, healthFactor, distancePercent, status }]
  minHealthFactor       String?
  liquidationRiskScore  Int?

  // Concentration Risk
  hhi                   String
  assetHhi              String
  protocolHhi           String
  concentrationScore    Int

  // Protocol Risk
  protocolScores        Json      // { 'folks-finance': 88, 'tinyman': 82, 'pact': 72 }
  weightedProtocolScore String
  protocolRiskScore     Int

  // Liquidity/Exit Risk
  exitRiskPositions     Json
  maxExitImpactPercent  String
  liquidityRiskScore    Int

  // Composite
  riskScore             Int       // 0–100 (higher = more risk)
  riskLevel             RiskLevel
  scoreComponents       Json

  activeAlertCount      Int       @default(0)
  criticalAlertCount    Int       @default(0)

  // INSERT only
  createdAt             DateTime  @default(now())

  user                  User      @relation(fields: [userId], references: [id])

  @@index([userId, analyzedAt(sort: Desc)])
  @@map("risk_snapshots")
}

model RiskAlert {
  id              String        @id @default(uuid()) @db.Uuid
  userId          String        @db.Uuid
  alertType       AlertType
  severity        AlertSeverity
  status          AlertStatus   @default(ACTIVE)
  title           String
  message         String
  metadata        Json
  triggeredAt     DateTime
  resolvedAt      DateTime?
  dismissedAt     DateTime?
  lastSeenAt      DateTime
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  user            User          @relation(fields: [userId], references: [id])

  @@index([userId, status, severity])
  @@map("risk_alerts")
}

enum RiskLevel    { CRITICAL HIGH MEDIUM LOW }
enum AlertType    { LIQUIDATION_IMMINENT LIQUIDATION_WARNING HIGH_CONCENTRATION MODERATE_CONCENTRATION HIGH_VOLATILITY SIGNIFICANT_DRAWDOWN LOW_LIQUIDITY LOW_PROTOCOL_SCORE }
enum AlertSeverity { CRITICAL HIGH MEDIUM LOW }
enum AlertStatus  { ACTIVE RESOLVED DISMISSED }
```

**Notes:**
- `risk_snapshots` is **INSERT-only** — same immutability pattern as `portfolio_snapshots`
- `risk_alerts` is mutable — ACTIVE / RESOLVED / DISMISSED lifecycle
- Risk score 0–39 = LOW, 40–59 = MEDIUM, 60–79 = HIGH, 80–100 = CRITICAL

---

## Yield

> Covers: opportunities, rankings, sustainability scores, idle capital records.

*Schema to be added when Engine 4 is implemented.*

---

## Strategy

> Covers: recommendations, rebalancing plans, strategy records, expected outcomes.

*Schema to be added when Engine 3 is implemented.*

---

## Execution

> Covers: execution plans (POA), transaction records, simulation results, execution status.

*Schema to be added when Engine 6 is implemented.*

---

## User Intelligence

> Covers: investor profiles, personas, goals, behavioral signals, risk tolerance bands.

*Schema to be added when Engine 5 is implemented.*

---

## Audit

> Immutable, append-only. All financial actions must produce an audit entry.

*Schema to be added when execution pipeline is implemented.*
