# CrestFlow — Architecture

> This file evolves with the project.
> DB schemas are added and updated here as each domain is implemented.
> All schemas must align with the domain model defined in `system-architecture.png` and `instructions.md`.

---

## Infrastructure & Tooling (Plan 00)

> **Status:** Implemented — 2026-07-01

### Stack Decisions

| Component             | Decision                     | Rationale                                                                                                                                                          |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Monorepo**          | Turborepo + pnpm workspaces  | Incremental caching, zero-config for pnpm, TypeScript-native                                                                                                       |
| **Package Manager**   | pnpm 9.x                     | Fastest installs, strict hoisting, best workspace support                                                                                                          |
| **Node.js**           | 22 LTS                       | Native fetch, AbortController, crypto perf, supported until 2027                                                                                                   |
| **Backend Framework** | Fastify 5                    | 2-3x faster than Express, native Zod validation, TypeScript-first. Plans 01-11 reference Express patterns — adapted to Fastify hooks/plugins during implementation |
| **Database**          | PostgreSQL 16 via Prisma ORM | Connection pool: 25 (ADD-02). Schema owned by `apps/copilot-api/prisma/`                                                                                           |
| **Cache / Queues**    | Redis 7 (appendonly)         | Single instance for cache + BullMQ queues + Copilot sessions                                                                                                       |
| **Event Bus**         | BullMQ 5.x on Redis          | Durable jobs, exponential backoff (5s/10s/20s), 3 retries, dead-letter retention. 7 queues defined                                                                 |
| **Logger**            | Pino 9.x                     | Structured JSON logging, module-based child loggers. No `console.log` allowed                                                                                      |
| **Testing**           | Vitest 2.x                   | Native ESM, same API as Jest, coverage thresholds enforced                                                                                                         |
| **Linting**           | ESLint 9 flat config         | `@typescript-eslint/strict`, `parseFloat`/`Number()` bans for financial safety                                                                                     |
| **Frontend**          | Vite 6 + React 19            | TanStack Query for data fetching, Zustand for state                                                                                                                |
| **Smart Contracts**   | AlgoKit + Puya Python        | Stub workspace for x402 escrow (P1) and CREST token (Phase 3)                                                                                                      |

### BullMQ Queue Registry

| Queue          | Name                       | Consumer           |
| -------------- | -------------------------- | ------------------ |
| Portfolio scan | `crestflow:portfolio-scan` | Engine 1           |
| Risk analysis  | `crestflow:risk-analysis`  | Engine 2           |
| Strategy       | `crestflow:strategy`       | Engine 3           |
| Yield          | `crestflow:yield`          | Engine 4           |
| Execution      | `crestflow:execution`      | Engine 6           |
| Audit          | `crestflow:audit`          | Audit Layer        |
| Maintenance    | `crestflow:maintenance`    | Snapshot retention |

### Rate Limiting (ADD-03)

| Scope                        | Limit               | Window              |
| ---------------------------- | ------------------- | ------------------- |
| Global (per IP)              | 100 requests        | 1 minute            |
| Authenticated (per userId)   | 500 requests        | 1 minute            |
| Copilot queries (per userId) | 20 queries          | 1 minute            |
| x402-paid endpoints          | No additional limit | Payment is the gate |

### Middleware Stack (Fastify hooks, applied in order)

1. `request-id` — UUID injected into every request/response
2. `helmet` — Security headers
3. `cors` — CORS with `X-Payment` in allowedHeaders (ADD-05)
4. `authenticate` — JWT verification (Plan 01)
5. `rate-limit` — Redis-backed rate limiting (ADD-03)
6. `x402` — Payment gate for paid endpoints (Plan 11 implemented — 8 paid endpoints, $0.005-$0.10 USDC, Redis replay protection, Goplusfable facilitator, disabled in dev)
7. `error-handler` — Global error → standard response envelope

### Health Endpoints

| Endpoint            | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `GET /health`       | Liveness — returns `{ status: 'ok' }`                       |
| `GET /health/ready` | Readiness — checks PostgreSQL + Redis connectivity (ADD-07) |

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

> Covers: user accounts, embedded wallets, KYC status, DID/VC linkage, on-ramp and off-ramp transactions.
> **Plans:** `plans/00-monorepo-tooling-setup.md` (User baseline), `plans/01-auth-turnkey-onboarding.md` (Auth/Wallet), `plans/10-kyc-identity-p1.md` (KYC/DID/OnRamp/OffRamp)
> **Status:** Auth + Turnkey wallet implemented (Plan 01). KYC/DID/Ramp implemented (Plan 10 — 2026-07-04).
>
> **Plan 10 Note:** Veriff KYC (session creation, HMAC-SHA256 webhook verification), GoPlausible DID + KYC VC issuance, UPI on-ramp (INR → crypto) + off-ramp (crypto → INR) with UPI ID SHA-256 hashing. KYCApplication, IdentityRecord, OnRampTransaction, OffRampTransaction models. 9 API endpoints (3 KYC, 2 identity, 2 on-ramp, 2 off-ramp). KYC tier daily limits enforced by Engine 6 Policy Engine.
>
> **Note:** Plan 00 created User model + KYCStatus enum. Plan 01 added WalletProvisionRecord for idempotent wallet creation (GAP-08), Google OAuth verification, Turnkey sub-org + wallet provisioning, JWT auth with tokenVersion revocation (GAP-09), and 4 auth API endpoints. KYCApplication, IdentityRecord, OnRamp, OffRamp are added by Plan 10.

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

  // KYC & Identity — managed in Plan 10
  kycStatus           KycStatus @default(PENDING)
  didId               String?   @unique   // GoPlausible DID e.g. did:algo:mainnet:ABCD...
  vcId                String?   @unique   // GoPlausible KYC VC identifier

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  kycApplications     KYCApplication[]
  identityRecord      IdentityRecord?
  onRampTransactions  OnRampTransaction[]
  offRampTransactions OffRampTransaction[]

  @@map("users")
}

// ── KYC ─────────────────────────────────────────────────────────

model KYCApplication {
  id                String    @id @default(uuid()) @db.Uuid
  userId            String    @db.Uuid
  status            KYCStatus
  provider          String    @default("veriff")
  providerSessionId String?   @unique
  providerDecision  String?   // 'approved' | 'declined' | 'resubmission_requested'
  providerReason    String?
  attemptNumber     Int       @default(1)
  submittedAt       DateTime?
  decidedAt         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user              User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([providerSessionId])
  @@map("kyc_applications")
}

// ── Decentralised Identity ───────────────────────────────────────

model IdentityRecord {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @db.Uuid @unique
  did             String    @unique          // e.g. did:algo:mainnet:ABCD...
  vcId            String?   @unique
  vcJwt           String?                    // full VC JWT (stored encrypted)
  kycTier         KYCTier   @default(TIER_1)
  country         String?                    // ISO 3166-1 alpha-2
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User      @relation(fields: [userId], references: [id])

  @@map("identity_records")
}

// ── Fiat On-Ramp ─────────────────────────────────────────────────

model OnRampTransaction {
  id              String       @id @default(uuid()) @db.Uuid
  userId          String       @db.Uuid
  status          RampStatus
  provider        String       @default("transak")    // 'transak' | 'ramp'
  fiatAmountInr   String                              // DECIMAL — INR amount
  cryptoAmount    String?                             // DECIMAL — USDC or ALGO received
  cryptoAsset     String?                             // 'USDC' | 'ALGO'
  exchangeRate    String?                             // DECIMAL — rate at time of tx
  providerTxId    String?                             // Provider reference ID
  algorandTxId    String?                             // On-chain delivery txID
  initiatedAt     DateTime     @default(now())
  completedAt     DateTime?
  failureReason   String?

  user            User         @relation(fields: [userId], references: [id])

  @@index([userId, initiatedAt(sort: Desc)])
  @@map("onramp_transactions")
}

// ── Fiat Off-Ramp ────────────────────────────────────────────────

model OffRampTransaction {
  id              String       @id @default(uuid()) @db.Uuid
  userId          String       @db.Uuid
  status          RampStatus
  provider        String       @default("transak")    // 'transak' | 'ramp'
  cryptoAmount    String                              // DECIMAL — USDC or ALGO sent
  cryptoAsset     String                              // 'USDC' | 'ALGO'
  fiatAmountInr   String?                             // DECIMAL — INR expected/received
  exchangeRate    String?                             // DECIMAL — rate at time of tx
  upiId           String?                             // Destination UPI ID (hashed at rest)
  algorandTxId    String?                             // On-chain send txID (crypto → provider)
  providerTxId    String?                             // Provider transfer reference
  initiatedAt     DateTime     @default(now())
  completedAt     DateTime?
  failureReason   String?

  user            User         @relation(fields: [userId], references: [id])

  @@index([userId, initiatedAt(sort: Desc)])
  @@map("offramp_transactions")
}

// ── Enums ────────────────────────────────────────────────────────

enum KYCStatus {
  PENDING
  SUBMITTED
  APPROVED
  DECLINED
  RESUBMISSION_REQUESTED
  EXPIRED
}

enum KYCTier {
  TIER_1    // basic identity — $1,000/day execution limit
  TIER_2    // enhanced — $10,000/day execution limit
  TIER_3    // institutional — unlimited (manual review)
}

enum RampStatus {
  INITIATED
  PAYMENT_RECEIVED
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}
```

**Notes:**

- `id` is UUID — never auto-increment integer
- `algorandAddress` is the Turnkey-derived address using `CURVE_ED25519` + `ADDRESS_FORMAT_ALGORAND` + path `m/44'/283'/0'/0/0`
- `walletId` is the Turnkey internal wallet identifier — stored for use by Engine 6 signing flow
- `turnkeySubOrgId` maps one sub-organization (isolated key vault) per CrestFlow user
- KYC fields (`didId`, `vcId`) remain null until Plan 10 (KYC) is implemented
- `upiId` on OffRampTransaction is stored hashed — never plaintext PII at rest
- On-ramp and off-ramp use the **same provider** (Transak / Ramp Network) — both directions supported
- `RampStatus` enum is shared between `OnRampTransaction` and `OffRampTransaction`
- Off-ramp flow: user initiates crypto send → provider receives → provider pays INR to UPI ID
- Off-ramp requires `kycStatus === APPROVED` (same gate as Engine 6 execution)

---

## Portfolio

> Covers: portfolio snapshots, asset holdings, protocol positions, performance records.
> **Plan:** `plans/03-engine1-portfolio-intelligence.md`
> **Status:** Implemented — 2026-07-03
>
> **Note:** 7-step pipeline: parallel data fetch → LP decomposition → asset classification → allocation + exposure analysis → PnL calculation → health scoring → immutable snapshot write. Event bus (`lib/event-bus.ts`) emits `PortfolioSnapshotCreated` for downstream engines. PortfolioSnapshot is INSERT-only. AssetCostBasis uses UPSERT for weighted average cost tracking. 7 API endpoints under `/api/v1/portfolio/*`. Health score 0-100 with 5 decomposable components (diversification, liquidity, yieldQuality, sustainability, protocolHealth).

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
> **Status:** Implemented — 2026-07-03
>
> **Note:** 6 adapters (Algorand Indexer, Folks Finance, Tinyman, Pact, CoinGecko, Gora stub), Redis-backed TTL cache service, unified price service, asset/protocol/price normalizers, asset registry (6 core ASAs). Uses existing ioredis singleton from `lib/redis.ts` and algosdk v3 clients from `lib/algorand.ts`. All adapters produce raw types; normalizers convert to canonical types (`AssetHolding`, `ProtocolPosition`, `PriceData`). Gora Oracle returns null — CoinGecko used for all pricing. Knowledge module entry point at `modules/knowledge/knowledge.module.ts`.

**Redis cache namespaces (no SQL schema):**

| Namespace                       | TTL   | Contents                      |
| ------------------------------- | ----- | ----------------------------- |
| `crestflow:price:*`             | 60s   | CoinGecko token prices        |
| `crestflow:indexer:account:*`   | 30s   | Algorand account holdings     |
| `crestflow:indexer:txns:*`      | 30s   | Transaction history           |
| `crestflow:indexer:asa:*`       | 3600s | ASA metadata (name, decimals) |
| `crestflow:folks:positions:*`   | 30s   | Folks Finance user positions  |
| `crestflow:folks:pools:*`       | 300s  | Folks Finance pool APYs       |
| `crestflow:tinyman:positions:*` | 30s   | Tinyman LP positions          |
| `crestflow:tinyman:pools:*`     | 300s  | Tinyman pool state            |
| `crestflow:pact:pools:*`        | 300s  | Pact pool analytics           |
| `crestflow:pact:positions:*`    | 30s   | Pact LP positions             |

**Canonical output types (consumed by Engine 1+):**

- `AssetHolding` — normalized token holding with USD value
- `ProtocolPosition` — supply/borrow/LP position with APY
- `PriceData` — token price with 24h change and market cap
- `TransactionRecord` — normalized on-chain transaction

---

## Risk

> Covers: risk scores, concentration, liquidation monitoring, market risk metrics, alerts.
> **Plan:** `plans/04-engine2-risk-intelligence.md`
> **Status:** Implemented — 2026-07-03
>
> **Note:** 5 parallel analyzers (market risk with CVaR/Sortino/MDD/Calmar/volatility, liquidation via Folks HF monitoring, concentration via asset+protocol HHI, protocol safety scoring, liquidity exit impact). Composite scorer (0-100, weighted 5 components). Alert system with 8 alert types and ACTIVE/RESOLVED/DISMISSED lifecycle. Event-driven: subscribes to `PortfolioSnapshotCreated`, emits `RiskAnalysisCompleted`. RiskSnapshot is INSERT-only. 6 API endpoints under `/api/v1/risk/*`.

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
> **Plan:** `plans/06-engine4-yield-opportunity.md`
> **Status:** Implemented — 2026-07-04
>
> **Note:** TOPSIS multi-criteria ranking engine (5 criteria: netAPY, protocol safety, yield consistency, liquidity, IL risk; goal-profile-weighted). APY normalization (APR→APY, 30D TWAP, CV consistency scoring). IL-adjusted true yield for LP positions. Idle capital detection (IDLE/UNDERPERFORMING/SUBOPTIMAL tiers with USD/year opportunity cost). Sustainability tagging (ORGANIC/MIXED/INCENTIVIZED). TVL trend analysis. Portfolio fit scoring (70% TOPSIS + 30% fit). YieldOpportunitySnapshot INSERT-only, IdleCapitalSignal mutable for resolved flag. Event-driven: subscribes to `PortfolioSnapshotCreated`, emits `YieldOpportunitiesUpdated`. 5 API endpoints under `/api/v1/yield/*`.

```prisma
model YieldOpportunitySnapshot {
  id                      String            @id @default(uuid()) @db.Uuid
  userId                  String            @db.Uuid
  portfolioSnapshotId     String            @db.Uuid

  // Opportunity identity
  protocol                String            // 'folks-finance' | 'tinyman' | 'pact'
  opportunityType         OpportunityType   // LENDING | LP
  assetSymbol             String
  pairSymbol              String?           // secondary asset for LP (null for lending)
  marketId                String?           // protocol-specific pool/market ID

  // APY data (all DECIMAL strings)
  spotApyPercent          String
  twapApy30dPercent       String?           // null if < 7 data points
  organicApyPercent       String            // fee/spread only
  incentivizedApyPercent  String            // token reward portion
  netApyPercent           String            // IL-adjusted for LP; raw for lending
  excessYieldPercent      String            // net APY minus baseline APY

  // Yield quality
  apyCv                   String?           // Coefficient of Variation; null if < 7 points
  yieldConsistencyScore   Int               // 0-100
  sustainabilityTier      SustainabilityTier
  sustainabilityScore     Int               // 0-100

  // Protocol and liquidity
  tvlUsd                  String
  tvlChange7dPercent      String?
  tvlTrend                TvlTrend
  utilizationRatePercent  String?           // lending only
  protocolSafetyScore     Int               // from Engine 2
  liquidityScore          Int               // 0-100

  // LP-specific
  ilRiskTier              ILRiskTier?       // null for lending
  ilRiskScore             Int               @default(0)
  estimatedAnnualIlPercent String?          // DECIMAL, negative

  // TOPSIS ranking (goal-profile-specific)
  goalProfile             GoalProfile
  topsisClosenessCoeff    String            // DECIMAL 0-1
  topsisRank              Int
  portfolioFitScore       Int               // 0-100
  finalScore              String            // 0.7*topsis + 0.3*fit

  // INSERT only
  createdAt               DateTime          @default(now())

  user                    User              @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, goalProfile, topsisRank])
  @@map("yield_opportunity_snapshots")
}

model IdleCapitalSignal {
  id                          String      @id @default(uuid()) @db.Uuid
  userId                      String      @db.Uuid
  portfolioSnapshotId         String      @db.Uuid
  assetSymbol                 String
  currentProtocol             String
  currentApyPercent           String
  bestAvailableApyPercent     String
  bestOpportunitySnapshotId   String      @db.Uuid
  opportunityCostUsdPerYear   String      // DECIMAL
  tier                        IdleTier
  actionSuggestion            String
  positionValueUsd            String
  resolved                    Boolean     @default(false)
  createdAt                   DateTime    @default(now())

  user                        User        @relation(fields: [userId], references: [id])

  @@index([userId, resolved, tier])
  @@map("idle_capital_signals")
}

enum OpportunityType    { LENDING LP }
enum SustainabilityTier { ORGANIC MIXED INCENTIVIZED }
enum TvlTrend           { GROWING STABLE DECLINING DISTRESS }
enum ILRiskTier         { NEGLIGIBLE LOW MODERATE HIGH }
enum IdleTier           { IDLE UNDERPERFORMING SUBOPTIMAL }
```

**Notes:**

- `yield_opportunity_snapshots` is **INSERT-only** — no UPDATE/DELETE on this table
- `idle_capital_signals` is mutable for `resolved` flag only — no DELETE
- `netApyPercent` = IL-adjusted `trueYield` for LP positions; raw supply APY for lending
- TOPSIS ranking is goal-profile-specific — same opportunity ranked differently for CONSERVATIVE vs AGGRESSIVE user
- `excessYieldPercent` can be negative — opportunity pays less than the risk-free baseline
- Ranked every 4 hours OR on `PortfolioSnapshotCreated` event from Engine 1

**Progressive data quality:**

| Condition                     | Behavior                                              |
| ----------------------------- | ----------------------------------------------------- |
| < 7 APY history points        | Use spot APY; `yieldConsistencyScore = 50` (neutral)  |
| TWAP available                | Use 30D TWAP; compute CV and actual consistency score |
| Engine 2 protocol score stale | Use last known; flag `protocolScoreStale: true`       |

---

## Strategy

> Covers: target allocations, rebalancing actions, optimizer model tracking, user goal profiles.
> **Plan:** `plans/05-engine3-strategy-optimization.md`
> **Status:** Implemented — 2026-07-04
>
> **Note:** Progressive model selection (EQUAL_WEIGHT → INVERSE_VOL → HRP_CVAR, BL_HRP_CVAR stubbed for P2). Ledoit-Wolf covariance shrinkage, HRP hierarchical clustering + recursive bisection, Mean-CVaR gradient descent on simplex, 50/50 HRP+CVaR ensemble. Goal constraints (CONSERVATIVE/MODERATE/AGGRESSIVE), defensive risk override, momentum overlay (+/-2%), rebalancing action generator with vol-adjusted thresholds. Strategy explainer for plain-English rationale. StrategySnapshot INSERT-only, UserGoalProfile mutable. Event-driven: subscribes to `RiskAnalysisCompleted`, emits `StrategyPlanCreated`. 6 API endpoints under `/api/v1/strategy/*`.

```prisma
model StrategySnapshot {
  id                      String      @id @default(uuid()) @db.Uuid
  userId                  String      @db.Uuid
  portfolioSnapshotId     String      @db.Uuid    // FK to portfolio_snapshots
  riskSnapshotId          String      @db.Uuid    // FK to risk_snapshots

  // Model and context
  model                   ModelType   // which optimizer ran
  snapshotsUsed           Int         // data points available at compute time
  goalProfile             GoalProfile
  ledoitWolfAlpha         String?     // DECIMAL — shrinkage coefficient used
  defensiveMode           Boolean     @default(false)  // risk override triggered

  // Allocations (JSONB)
  targetAllocation        Json        // { ALGO: "0.45200000", USDC: "0.30100000", ... }
  currentAllocation       Json        // snapshot of current weights at compute time

  // Rebalancing (JSONB)
  rebalancingActions      Json        // RebalancingAction[]
  rebalanceRequired       Boolean
  maxDeviationPercent     String      // DECIMAL — worst single-asset drift

  // Strategy explanation (JSONB)
  modelExplanation        Json        // StrategyExplanation object

  // Momentum overlay
  momentumOverlayApplied  Boolean     @default(false)
  momentumSignals         Json?       // { ALGO: true, USDC: false, ... }

  // INSERT only — append-only, no UPDATE/DELETE
  createdAt               DateTime    @default(now())

  user                    User        @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("strategy_snapshots")
}

model UserGoalProfile {
  id           String      @id @default(uuid()) @db.Uuid
  userId       String      @db.Uuid @unique    // one per user
  goalProfile  GoalProfile @default(MODERATE)
  updatedAt    DateTime    @updatedAt
  createdAt    DateTime    @default(now())

  user         User        @relation(fields: [userId], references: [id])

  @@map("user_goal_profiles")
}

enum ModelType {
  EQUAL_WEIGHT    // 0–13 snapshots — seed model
  INVERSE_VOL     // 14–29 snapshots — naïve risk parity
  HRP_CVAR        // 30–89 snapshots — HRP + Mean-CVaR ensemble (Ledoit-Wolf)
  BL_HRP_CVAR     // 90+ snapshots — Black-Litterman views + HRP + CVaR (P2 stub)
}

enum GoalProfile {
  CONSERVATIVE    // max 25% volatile, min 65% stable, max risk score 35
  MODERATE        // max 55% volatile, min 25% stable, max risk score 60
  AGGRESSIVE      // max 85% volatile, min 5%  stable, max risk score 80
}
```

**Notes:**

- `strategy_snapshots` is **INSERT-only** — DB role has no UPDATE/DELETE on this table
- `user_goal_profiles` is mutable — user can change goal profile at any time
- `targetAllocation` and `currentAllocation` store weights as `decimal.js` string values (8 decimal places, sum = 1.0)
- `rebalancingActions` stores ordered `RebalancingAction[]` with urgency tiers (CRITICAL / HIGH / MEDIUM / LOW)
- `ledoitWolfAlpha` is null when `model = EQUAL_WEIGHT` or `INVERSE_VOL` (covariance not computed)
- `defensiveMode = true` means the user's risk score exceeded their goal profile cap — strategy shifted defensively
- Engine 3 triggers: `RiskAnalysisCompleted` event (auto) or `PUT /strategy/goal` / `POST /strategy/refresh` (on-demand)
- `StrategyPlanCreated` event is emitted after every write — consumed by Engine 6 (Execution) and Engine 5 (Copilot)

**Progressive model thresholds:**

| snapshotCount | Model            | Covariance              |
| ------------- | ---------------- | ----------------------- |
| 0–13          | EQUAL_WEIGHT     | N/A                     |
| 14–29         | INVERSE_VOL      | N/A (uses Engine 2 vol) |
| 30–89         | HRP_CVAR         | Ledoit-Wolf shrunk      |
| 90+           | BL_HRP_CVAR (P2) | Ledoit-Wolf + EWMA      |

---

## Execution

> Covers: execution plans (POA), transaction records, simulation results, execution status.
> **Plan:** `plans/08-engine6-autonomous-execution.md`
> **Status:** Implemented — 2026-07-04
>
> **Note:** 5-layer pipeline: POA builder (dependency resolution, atomic grouping) → Policy engine (per-profile limits, risk gate, protocol allowlist, slippage caps) → Simulation gate (MVP stub, production uses algod.simulateTransaction) → Signing (Turnkey TEE MVP stub) → Execution coordinator (broadcast + confirmation). 7 action types, 5 protocol builders (Haystack/Folks/Tinyman stubs, Pact P2 stub, Opt-in). ExecutionRecord (mutable status), ExecutionTransaction (INSERT-only audit), AutopilotConfig (Phase 3 stub). 6 API endpoints under `/api/v1/execute/*`.

```prisma
model ExecutionRecord {
  id                String          @id @db.Uuid    // = executionId from POA
  userId            String          @db.Uuid
  status            ExecutionStatus
  sourceEventType   String          // 'StrategyPlanCreated' | 'YieldOpportunitiesUpdated' | 'MANUAL'
  sourceEventId     String          @db.Uuid

  goalProfile       String
  totalValueUsd     String          // DECIMAL
  estimatedFeesAlgo String          // DECIMAL
  stepsJson         Json            // POAStep[] — full plan snapshot at execution time

  failureReason     String?
  confirmedAt       DateTime?
  durationMs        Int?

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  transactions      ExecutionTransaction[]
  user              User            @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, status])
  @@map("execution_records")
}

model ExecutionTransaction {
  id                  String    @id @default(uuid()) @db.Uuid
  executionRecordId   String    @db.Uuid
  groupIndex          Int
  txId                String    // Algorand txID — auditable on allo.info
  confirmed           Boolean
  confirmedRound      Int?
  error               String?
  createdAt           DateTime  @default(now())

  executionRecord     ExecutionRecord @relation(fields: [executionRecordId], references: [id])

  @@index([executionRecordId])
  @@index([txId])                    // fast lookup by txId for audit
  @@map("execution_transactions")
}

model AutopilotConfig {
  id            String    @id @default(uuid()) @db.Uuid
  userId        String    @db.Uuid @unique
  enabled       Boolean   @default(false)
  enabledAt     DateTime?
  disabledAt    DateTime?
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])

  @@map("autopilot_configs")
}

enum ExecutionStatus {
  PENDING
  POLICY_BLOCKED
  AWAITING_APPROVAL
  SIMULATION_FAILED
  SUBMITTED
  CONFIRMED
  FAILED
}
```

**Notes:**

- `execution_records` — mutable (status, confirmedAt, failureReason, durationMs fields)
- `execution_transactions` — **INSERT-only** (fully immutable audit log; DB-level UPDATE/DELETE revoked)
- Every `txId` in `ExecutionTransaction` is the Algorand transaction ID — independently verifiable on allo.info
- `stepsJson` stores the full POA snapshot at execution time — permanent record of exactly what was planned and executed
- `autopilot_configs` is mutable — user can toggle at any time

**7 POA Action Types:**

| ActionType      | Protocol           | Description                                                 |
| --------------- | ------------------ | ----------------------------------------------------------- |
| `SWAP`          | Haystack Router    | Token A → Token B (best price via Tinyman+Pact aggregation) |
| `LEND_DEPOSIT`  | Folks Finance      | Deposit asset to lending pool → receive fTokens             |
| `LEND_WITHDRAW` | Folks Finance      | Burn fTokens → withdraw underlying asset                    |
| `LP_ADD`        | Tinyman V2 or Pact | Add liquidity → receive LP tokens                           |
| `LP_REMOVE`     | Tinyman V2 or Pact | Burn LP tokens → receive both assets back                   |
| `OPT_IN`        | Algorand           | Opt account into ASA (auto-prepended when required)         |
| `NO_OP`         | —                  | No action (drift below rebalance threshold)                 |

**Policy Limits per Goal Profile:**

| Profile      | Max Single Txn | Daily Limit | Slippage Cap | LP Allowed |
| ------------ | -------------- | ----------- | ------------ | ---------- |
| CONSERVATIVE | $1,000         | $5,000      | 0.5%         | No         |
| MODERATE     | $5,000         | $25,000     | 1.0%         | Yes        |
| AGGRESSIVE   | $20,000        | $100,000    | 2.0%         | Yes        |

**Signing Stack:**

- All transactions signed via Turnkey TEE (`ACTIVITY_TYPE_SIGN_TRANSACTION_V2`)
- CrestFlow holds zero private keys
- `algod.simulateTransaction()` mandatory gate before any signing
- Algorand finality: ~3.3s (no MEV, no mempool)

**x402 Paid Endpoints:**

- `POST /execute/plan`, `POST /execute/submit`, `POST /execute/simulate`, `POST /execute/autopilot/enable`
- `POST /copilot/query`, `POST /copilot/query/stream` (Engine 5)
- Payment via USDC on Algorand, verified by Goplusfable Facilitator

---

## User Intelligence

> Covers: investor profiles, personas, goals, behavioral signals, copilot query logs.
> **Plan:** `plans/07-engine5-user-intelligence.md`
> **Status:** Implemented — 2026-07-04
>
> **Note:** Part A: Onboarding questionnaire (7 questions, weighted scoring), 5 investor personas (CONSERVATIVE/BALANCED/GROWTH/AGGRESSIVE/YIELD_SEEKER), persona-to-GoalProfile mapping, behavioral drift scoring (7 signal types, 30D rolling window). Part B: AI Copilot with keyword-first intent classification (6 intents), parallel 4-engine context assembly, system prompt builder with guardrails, LLM client (gpt-4.1-mini primary, Gemini fallback), Zod response schema validation, Redis-backed 10-turn sliding window session, CopilotQueryLog audit trail. 7 API endpoints: 3 under `/api/v1/user/*`, 3 under `/api/v1/copilot/*`.

```prisma
model UserProfile {
  id                    String          @id @default(uuid()) @db.Uuid
  userId                String          @db.Uuid @unique
  investorPersona       InvestorPersona @default(BALANCED)
  goalProfile           GoalProfile     @default(MODERATE)
  onboardingScore       Int?            // 0-100 normalized score from questionnaire
  onboardingAnswers     Json?           // raw questionnaire answers
  behavioralDriftScore  Int             @default(0)  // +ve = more aggressive, -ve = more conservative
  onboardingCompleted   Boolean         @default(false)
  profileVersion        Int             @default(1)  // increments on each update
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  user                  User            @relation(fields: [userId], references: [id])

  @@map("user_profiles")
}

model BehavioralSignal {
  id          String                @id @default(uuid()) @db.Uuid
  userId      String                @db.Uuid
  signalType  BehavioralSignalType
  occurredAt  DateTime
  metadata    Json?                 // optional context (e.g. which alert was dismissed)
  createdAt   DateTime              @default(now())

  user        User                  @relation(fields: [userId], references: [id])

  @@index([userId, occurredAt(sort: Desc)])
  @@map("behavioral_signals")
}

model CopilotQueryLog {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @db.Uuid
  query           String
  intent          String    // 'PORTFOLIO_QUERY' | 'RISK_QUERY' | 'STRATEGY_QUERY' | 'YIELD_QUERY' | 'GOAL_CHANGE' | 'GENERAL'
  responseAnswer  String
  confidence      String    // 'HIGH' | 'MEDIUM' | 'LOW'
  model           String    // 'gpt-4.1-mini' | 'gemini-3.5-flash'
  fallbackUsed    Boolean   @default(false)
  tokensUsed      Int?
  durationMs      Int?
  sessionTurn     Int
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("copilot_query_logs")
}

enum InvestorPersona {
  CONSERVATIVE   // 0-19: capital preservation, lending-only
  BALANCED       // 20-39: steady growth, stable LP + lending
  GROWTH         // 40-59: growth-oriented, full lending + select LP
  AGGRESSIVE     // 60-79: high-risk, all opportunity types
  YIELD_SEEKER   // 80-100: maximum yield focus
}

enum BehavioralSignalType {
  ACTED_ON_REBALANCE
  IGNORED_CRITICAL_ALERT
  IGNORES_YIELD_SUGGESTIONS
  HIGH_ENGAGEMENT
  GOAL_ESCALATION
  GOAL_DE_ESCALATION
  RISK_INACTION
}
```

**Notes:**

- `user_profiles` is mutable — updated on every questionnaire submission or goal profile change
- `behavioral_signals` is **INSERT-only** — append-only behavioral event log
- `copilot_query_logs` is **INSERT-only** — full audit trail of every copilot interaction
- `behavioralDriftScore` is recomputed on every new signal write from last 30 days of signals
- `profileVersion` increments on each update — used for optimistic concurrency
- `goalProfile` enum is shared with Engine 3 (`UserGoalProfile`) and Engine 4 (TOPSIS weights)

**LLM Stack:**

| Role     | Model                       | Trigger          |
| -------- | --------------------------- | ---------------- |
| Primary  | `gpt-4.1-mini` (OpenAI)     | All requests     |
| Fallback | `gemini-3.5-flash` (Google) | OpenAI 429 / 5xx |

**Session State (Redis, not in PostgreSQL):**

| Key                                  | TTL    | Contents                                    |
| ------------------------------------ | ------ | ------------------------------------------- |
| `crestflow:copilot:session:{userId}` | 30 min | Last 10 conversation turns (sliding window) |

---

## Audit

> Immutable, append-only. All financial actions must produce an audit entry.

```prisma
model AuditEntry {
  id              String          @id @default(uuid()) @db.Uuid
  userId          String?         @db.Uuid       // null for SYSTEM entries
  category        AuditCategory
  action          String          // e.g. 'portfolio_scanned', 'execution_confirmed', 'goal_profile_changed'
  status          AuditStatus     @default(SUCCESS)

  // Contextual references (all optional — set where relevant)
  sourceEngine    String?         // 'engine1' | 'engine2' | ... | 'engine6' | 'auth' | 'system'
  relatedEntityId String?         @db.Uuid       // e.g. executionId, snapshotId, strategyId
  relatedTxId     String?         // Algorand txID (execution entries only)

  // Financial summary (for execution entries)
  valueUsd        String?         // DECIMAL — financial value of the action
  assetSymbol     String?         // primary asset involved
  protocol        String?         // 'folks-finance' | 'tinyman' | 'pact' | 'haystack'

  // Metadata — structured, queryable
  metadata        Json            // full payload snapshot (engine-specific)
  ipAddress       String?
  userAgent       String?

  // KYC/compliance linkage
  kycStatus       String?         // snapshot of user's kycStatus at time of action
  algorandAddress String?         // snapshot of wallet address at time of action

  // INSERT-only — no updates, no deletes
  createdAt       DateTime        @default(now())

  user            User?           @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([category, createdAt(sort: Desc)])
  @@index([relatedTxId])          // direct lookup by Algorand txID
  @@index([relatedEntityId])
  @@map("audit_entries")
}

enum AuditCategory {
  AUTH
  PORTFOLIO_SCAN
  RISK_ANALYSIS
  RISK_ALERT
  STRATEGY_UPDATE
  YIELD_SCAN
  PROFILE_CHANGE
  COPILOT_QUERY
  EXECUTION
  SYSTEM
}

enum AuditStatus {
  SUCCESS
  FAILURE
  BLOCKED
  PENDING
}
```

**Immutability enforcement:**

```sql
REVOKE UPDATE, DELETE ON audit_entries FROM crestflow_app;
```

_AuditEntry schema sourced from Plan 09 — Audit Layer. Addresses NEW-01 from architecture_audit_v2.md._

> **Status:** Implemented — 2026-07-04
>
> **Note:** INSERT-only AuditEntry model with 10 categories. AuditService with fail-silent write() + writeBatch(). Passive event listeners registered on the event bus for all engine events (PortfolioSnapshotCreated, RiskAnalysisCompleted, StrategyPlanCreated, YieldOpportunitiesUpdated, ExecutionConfirmed/Failed/Blocked, OnboardingCompleted, GoalProfileChanged). 4 API endpoints under `/api/v1/audit/*` (log, log/:id, execution/:executionId, export). Algorand txID indexed for direct explorer lookup.
