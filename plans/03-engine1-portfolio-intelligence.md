# Plan 03 — Engine 1: Portfolio Intelligence

**Status:** Approved  
**Priority:** P0  
**Depends on:** Plan 01 (Auth — `PortfolioScanTriggered` event), Plan 02 (Financial Knowledge Layer — all adapters)  
**Feeds into:** Engine 2 (Risk Analysis), Engine 4 (Yield Discovery), Engine 5 (User Intelligence / Copilot)

---

## Objective

Engine 1 is the canonical financial state engine. It is the **only engine that directly calls Knowledge Layer adapters**. It:

1. Listens for `PortfolioScanTriggered` events
2. Fetches all on-chain and protocol data in parallel via Plan 02 adapters
3. Decomposes LP tokens into underlying assets
4. Computes allocation, true exposure, PnL, Impermanent Loss, and Health Score
5. Writes an immutable `PortfolioSnapshot` to PostgreSQL
6. Emits `PortfolioSnapshotCreated` — the primary event consumed by all downstream engines

**No other engine reads the blockchain or calls adapters directly. This is the single source of truth.**

---

## Architecture Decisions

### Deterministic computation only — no ML
Engine 1 uses rigorous financial math. Its accuracy and reproducibility are non-negotiable. The outputs of this engine feed into the AI layers (Engines 2, 3, 5) — the AI cannot reason correctly if the inputs are wrong.

### `decimal.js` for all arithmetic
Never `Number`, never `parseFloat`, never raw division on financial values.
- All values initialized from strings: `new Decimal("123.456")`
- All stored values are `.toString()` or `.toFixed(8)`
- `Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })`

### Parallel data fetch — single scan = one network roundtrip window
All five adapter calls are fired with `Promise.allSettled`. If one protocol adapter fails, the scan continues with partial data — the snapshot is written with a `dataQuality` field marking which sources succeeded/failed.

### Immutable snapshots — insert-only
`portfolio_snapshots` is insert-only. No UPDATE, no DELETE. The DB role used by the app has `INSERT` permission only on this table. A new snapshot is written on every scan. Historical snapshots are never modified.

### Event-driven handoff
Engine 1 does not call Engine 2/4/5 directly. It emits `PortfolioSnapshotCreated` on the internal EventEmitter (MVP). Engines subscribe independently. This decouples them so each engine can be replaced without touching Engine 1.

---

## 7-Step Processing Pipeline

```
PortfolioScanTriggered { userId, algorandAddress, trigger }
    │
    ▼
[Step 1] Parallel data fetch (Promise.allSettled)
    ├── AlgorandIndexerAdapter.getAccountHoldings(address)
    ├── AlgorandIndexerAdapter.getTransactionHistory(address)
    ├── FolksFinanceAdapter.getUserPositions(address)
    ├── TinymanAdapter.getUserLpPositions(address, holdings)
    └── PactAdapter.getUserLpPositions(address, holdings)
    │
    ▼
[Step 2] LP Decomposition
    ├── For each Tinyman LP position → compute asset1Amount, asset2Amount via ownership ratio
    ├── For each Pact LP position   → compute asset1Amount, asset2Amount via ownership ratio
    └── Impermanent Loss per LP position (requires entry price from tx history)
    │
    ▼
[Step 3] Asset Classification
    ├── Volatile: ALGO, goETH, goBTC, governance tokens
    ├── Stablecoin: USDC, USDt, goUSD
    └── Lending: Folks Finance supply/borrow positions
    │
    ▼
[Step 4] Price Fetch
    └── PriceService.getPricesForAssets(all detected assetIds)
    │
    ▼
[Step 5] Allocation + Exposure Analysis
    ├── totalValueUsd = sum of all positions at current prices
    ├── Asset allocation % (per symbol, using true exposure)
    ├── Category allocation % (volatile / stablecoin / lending)
    ├── Protocol allocation % (native / folks / tinyman / pact)
    ├── Direct exposure (raw wallet holdings only)
    ├── Indirect exposure (LP-decomposed only)
    └── True exposure = direct + indirect per asset
    │
    ▼
[Step 6] PnL + Health Score
    ├── Cost basis lookup → unrealized PnL, realized PnL
    ├── Yield earned (Folks interest + LP fee accrual)
    ├── Performance returns (7D, 30D, 90D vs historical snapshots)
    ├── HHI concentration index (on true exposure)
    └── Health Score (weighted composite, 0–100)
    │
    ▼
[Step 7] Write + Emit
    ├── prisma.portfolioSnapshot.create(...)   ← immutable INSERT
    ├── prisma.assetCostBasis.upsert(...)      ← mutable, update WAC
    └── emit PortfolioSnapshotCreated { snapshotId, userId, totalValueUsd, healthScore }
```

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions to existing schema)

```prisma
model PortfolioSnapshot {
  id                    String          @id @default(uuid()) @db.Uuid
  userId                String          @db.Uuid
  snapshotAt            DateTime        // UTC timestamp of portfolio state — NOT createdAt
  trigger               SnapshotTrigger

  // ── Top-level value ──────────────────────────────────────────────────
  totalValueUsd         String          // DECIMAL string — never float
  previousValueUsd      String?         // from most recent prior snapshot
  changeValueUsd        String?         // totalValueUsd - previousValueUsd
  changePercent         String?         // DECIMAL string

  // ── Allocation (JSONB) ───────────────────────────────────────────────
  // Record<symbol, { valueUsd: string, percent: string }>
  assetAllocation       Json
  // { volatile: string, stablecoin: string, lending: string }
  categoryAllocation    Json
  // { native: string, folks: string, tinyman: string, pact: string }
  protocolAllocation    Json

  // ── Exposure (JSONB) ─────────────────────────────────────────────────
  // Record<symbol, { valueUsd: string, percent: string }>
  directExposure        Json
  indirectExposure      Json            // LP-decomposed only
  trueExposure          Json            // direct + indirect

  // ── PnL ─────────────────────────────────────────────────────────────
  unrealizedPnlUsd      String          // DECIMAL
  realizedPnlUsd        String          // DECIMAL (closed positions / swaps)
  yieldEarnedUsd        String          // DECIMAL (Folks interest + LP fees)
  feePaidUsd            String          // DECIMAL (Algorand tx fees paid)
  impermanentLossUsd    String          // DECIMAL (aggregate IL across all LP positions)

  // ── Performance ──────────────────────────────────────────────────────
  return7dPercent       String?         // DECIMAL — null if insufficient history
  return30dPercent      String?
  return90dPercent      String?
  returnAllTimePercent  String?

  // ── Health Score ─────────────────────────────────────────────────────
  healthScore           Int             // 0–100 integer
  // { diversification: int, liquidity: int, yieldQuality: int, sustainability: int, protocolHealth: int }
  healthComponents      Json
  strengths             Json            // string[] — generated descriptive insights
  weaknesses            Json            // string[] — generated descriptive insights

  // ── Concentration ────────────────────────────────────────────────────
  hhi                   String          // DECIMAL 0–10000

  // ── Data Quality ─────────────────────────────────────────────────────
  dataQuality           Json            // { indexer: 'ok'|'failed', folks: 'ok'|'failed', ... }
  isPartial             Boolean         @default(false) // true if any adapter failed

  // ── Full Position Data (for audit + replay) ──────────────────────────
  assetHoldings         Json            // AssetHolding[] — snapshot of raw holdings
  protocolPositions     Json            // ProtocolPosition[] — snapshot of all protocol positions
  lpDecomposition       Json            // Record<lpTokenId, { asset1, asset2, ilPercent }>

  // ── Immutability: NO updatedAt. No soft-delete. Insert-only. ─────────
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
  totalQuantity   String    // DECIMAL — total units held historically
  totalCostUsd    String    // DECIMAL — total USD spent
  avgCostUsd      String    // DECIMAL — weighted average cost per unit
  lastTxAt        DateTime? // timestamp of last transaction that updated this
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

**Immutability enforcement (raw SQL in migration):**
```sql
-- Applied after migration — restricts app DB role from modifying snapshots
REVOKE UPDATE, DELETE ON portfolio_snapshots FROM crestflow_app;
```

---

## Module File Structure

```
apps/copilot-api/src/modules/portfolio/
├── portfolio.controller.ts          ← thin HTTP handlers, no business logic
├── portfolio.routes.ts              ← Express router for /api/v1/portfolio/*
├── portfolio.service.ts             ← orchestrates full pipeline (Steps 1–7)
├── pipeline/
│   ├── 01-data-fetcher.ts           ← parallel fetch via Knowledge Layer
│   ├── 02-lp-decomposer.ts          ← LP token → underlying + IL calculation
│   ├── 03-asset-classifier.ts       ← volatile / stablecoin / lending
│   ├── 04-allocation-analyzer.ts    ← allocation + exposure analysis
│   ├── 05-pnl-calculator.ts         ← cost basis, unrealized/realized PnL, yield
│   ├── 06-health-scorer.ts          ← health score weighted composite
│   └── 07-snapshot-writer.ts        ← DB write + event emit
├── repositories/
│   ├── snapshot.repository.ts       ← INSERT only — getLatest, getHistory
│   └── cost-basis.repository.ts     ← UPSERT cost basis per user+asset
└── events/
    └── portfolio.events.ts          ← PortfolioSnapshotCreated payload type
```

---

## Pipeline Implementation Detail

### Step 1 — Parallel Data Fetcher

**File:** `pipeline/01-data-fetcher.ts`

```typescript
import { AlgorandIndexerAdapter, FolksFinanceAdapter, TinymanAdapter, PactAdapter } from '@/modules/knowledge';

export interface RawPortfolioData {
  account: _RawAlgorandAccount | null;
  transactions: TransactionRecord[];
  folksPositions: _RawFolksPosition[];
  tinymanPools: _RawTinymanPool[];
  pactPools: _RawPactPool[];
  failedSources: string[];
}

export async function fetchPortfolioData(address: string): Promise<RawPortfolioData> {
  const [accountResult, txResult, folksResult, tinymanResult, pactResult] =
    await Promise.allSettled([
      AlgorandIndexerAdapter.getAccountHoldings(address),
      AlgorandIndexerAdapter.getTransactionHistory(address, 200),
      FolksFinanceAdapter.getUserPositions(address, folksClient),
      TinymanAdapter.getUserLpPositions(address, [], tinymanClient),
      PactAdapter.getUserLpPositions(address, [], pactClient),
    ]);

  const failedSources: string[] = [];
  const get = <T>(result: PromiseSettledResult<T>, name: string, fallback: T): T => {
    if (result.status === 'rejected') {
      failedSources.push(name);
      return fallback;
    }
    return result.value;
  };

  return {
    account:          get(accountResult, 'indexer', null),
    transactions:     get(txResult, 'transactions', []),
    folksPositions:   get(folksResult, 'folks', []),
    tinymanPools:     get(tinymanResult, 'tinyman', []),
    pactPools:        get(pactResult, 'pact', []),
    failedSources,
  };
}
```

---

### Step 2 — LP Decomposer + Impermanent Loss

**File:** `pipeline/02-lp-decomposer.ts`

```typescript
import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface LpDecomposition {
  lpTokenId: number;
  protocol: 'tinyman' | 'pact';
  asset1Id: number;
  asset2Id: number;
  asset1Amount: string;   // DECIMAL string — underlying asset1 amount
  asset2Amount: string;   // DECIMAL string — underlying asset2 amount
  ilPercent: string;      // DECIMAL string — impermanent loss % (negative = loss)
  ilUsd: string;          // DECIMAL string — IL in USD
}

export function decomposeLpPosition(pool: _RawTinymanPool | _RawPactPool, userLpBalance: bigint, protocol: 'tinyman' | 'pact'): LpDecomposition {
  const ownershipRatio = new Decimal(userLpBalance.toString())
    .div(new Decimal(pool.issuedLiquidity.toString()));

  const asset1Amount = new Decimal(pool.asset1Reserves.toString())
    .mul(ownershipRatio);
  const asset2Amount = new Decimal(pool.asset2Reserves.toString())
    .mul(ownershipRatio);

  return {
    lpTokenId: pool.address ? 0 : 0, // resolved from pool config
    protocol,
    asset1Id: pool.asset1Id,
    asset2Id: pool.asset2Id,
    asset1Amount: asset1Amount.toString(),
    asset2Amount: asset2Amount.toString(),
    ilPercent: '0',   // calculated below if entry price available
    ilUsd: '0',
  };
}

/**
 * Impermanent Loss Formula:
 *   IL = 2√k / (1 + k) − 1
 *   where k = (currentAsset1Price / currentAsset2Price) / (entryAsset1Price / entryAsset2Price)
 *
 * IL = 0 means no loss. IL = -0.05 means 5% loss vs holding.
 */
export function calculateImpermanentLoss(
  currentPriceRatio: string,   // currentP1/currentP2
  entryPriceRatio: string,     // entryP1/entryP2 — from tx history
): string {
  const current = new Decimal(currentPriceRatio);
  const entry = new Decimal(entryPriceRatio);
  const k = current.div(entry);

  // IL = 2 * sqrt(k) / (1 + k) - 1
  const sqrtK = k.sqrt();
  const il = sqrtK.mul(2).div(k.plus(1)).minus(1);
  return il.toFixed(8);  // e.g. "-0.00623411" = -0.62% IL
}
```

---

### Step 4 — Allocation + Exposure Analyzer

**File:** `pipeline/04-allocation-analyzer.ts`

```typescript
import Decimal from 'decimal.js';

export interface AllocationResult {
  totalValueUsd: string;
  assetAllocation: Record<string, { valueUsd: string; percent: string }>;
  categoryAllocation: { volatile: string; stablecoin: string; lending: string };
  protocolAllocation: { native: string; folks: string; tinyman: string; pact: string };
  directExposure: Record<string, { valueUsd: string; percent: string }>;
  indirectExposure: Record<string, { valueUsd: string; percent: string }>;
  trueExposure: Record<string, { valueUsd: string; percent: string }>;
  hhi: string;
}

export function analyzeAllocation(
  holdings: AssetHolding[],
  positions: ProtocolPosition[],
  decompositions: LpDecomposition[],
  prices: Record<number, PriceData>,
): AllocationResult {
  // 1. Compute total value
  const total = holdings.reduce(
    (sum, h) => sum.plus(new Decimal(h.valueUsd)), new Decimal('0')
  );

  // 2. Direct exposure (raw wallet holdings only)
  const direct: Record<string, Decimal> = {};
  for (const h of holdings) {
    direct[h.unitName] = (direct[h.unitName] ?? new Decimal('0')).plus(h.valueUsd);
  }

  // 3. Indirect exposure (from LP decomposition only)
  const indirect: Record<string, Decimal> = {};
  for (const lp of decompositions) {
    const p1 = prices[lp.asset1Id];
    const p2 = prices[lp.asset2Id];
    if (p1) {
      const val1 = new Decimal(lp.asset1Amount).mul(p1.priceUsd);
      indirect[p1.symbol] = (indirect[p1.symbol] ?? new Decimal('0')).plus(val1);
    }
    if (p2) {
      const val2 = new Decimal(lp.asset2Amount).mul(p2.priceUsd);
      indirect[p2.symbol] = (indirect[p2.symbol] ?? new Decimal('0')).plus(val2);
    }
  }

  // 4. True exposure = direct + indirect
  const trueExp: Record<string, Decimal> = { ...direct };
  for (const [symbol, val] of Object.entries(indirect)) {
    trueExp[symbol] = (trueExp[symbol] ?? new Decimal('0')).plus(val);
  }

  // 5. HHI on true exposure weights
  const weights = Object.values(trueExp).map(v =>
    v.div(total).mul(100)
  );
  const hhi = weights.reduce(
    (sum, w) => sum.plus(w.pow(2)), new Decimal('0')
  );

  // Helper: convert Decimal map → percent map
  const toPercentMap = (map: Record<string, Decimal>) =>
    Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, {
        valueUsd: v.toFixed(8),
        percent: v.div(total).mul(100).toFixed(4),
      }])
    );

  return {
    totalValueUsd: total.toFixed(8),
    assetAllocation: toPercentMap(direct),
    categoryAllocation: categorizeSplit(holdings, positions, total),
    protocolAllocation: protocolSplit(holdings, positions, total),
    directExposure: toPercentMap(direct),
    indirectExposure: toPercentMap(indirect),
    trueExposure: toPercentMap(trueExp),
    hhi: hhi.toFixed(4),
  };
}
```

---

### Step 6 — Health Scorer

**File:** `pipeline/06-health-scorer.ts`

```typescript
import Decimal from 'decimal.js';

export interface HealthScoreResult {
  score: number;           // 0–100 integer
  components: {
    diversification: number;   // 0–30 (from HHI)
    liquidity: number;         // 0–20
    yieldQuality: number;      // 0–20
    sustainability: number;    // 0–15
    protocolHealth: number;    // 0–15
  };
  strengths: string[];
  weaknesses: string[];
}

export function calculateHealthScore(
  hhi: string,
  allocation: AllocationResult,
  positions: ProtocolPosition[],
): HealthScoreResult {
  const hhiDecimal = new Decimal(hhi);

  // ── Component 1: Diversification (0–30) ───────────────────────────────
  // Lower HHI = better score. HHI 0 = 30pts, HHI 10000 = 0pts
  const diversification = Math.round(
    new Decimal(30).mul(
      new Decimal(1).minus(hhiDecimal.div(10000))
    ).toNumber()
  );

  // ── Component 2: Liquidity Adequacy (0–20) ────────────────────────────
  // % of portfolio in immediately liquid assets (ALGO + stablecoins)
  const stablePercent = new Decimal(allocation.categoryAllocation.stablecoin);
  const algoPercent = new Decimal(allocation.assetAllocation['ALGO']?.percent ?? '0');
  const liquidPercent = stablePercent.plus(algoPercent);
  // 20pts if >40% liquid, scaled linearly
  const liquidity = Math.min(20, Math.round(liquidPercent.div(40).mul(20).toNumber()));

  // ── Component 3: Risk-Adjusted Yield Quality (0–20) ───────────────────
  // Average APY weighted by position size, penalized by risk tier
  const avgApy = positions.reduce((sum, p) => {
    const apy = new Decimal(p.apyPercent ?? '0');
    return sum.plus(apy.mul(p.valueUsd).div(allocation.totalValueUsd));
  }, new Decimal('0'));
  // 20pts at 20%+ APY (DeFi benchmark), scaled, capped
  const yieldQuality = Math.min(20, Math.round(avgApy.div(20).mul(20).toNumber()));

  // ── Component 4: Yield Sustainability (0–15) ──────────────────────────
  // % of yield from fees vs token emissions (heuristic: Folks/stablecoin APY is sustainable)
  const folksShare = new Decimal(allocation.protocolAllocation.folks);
  const sustainability = Math.min(15, Math.round(folksShare.div(100).mul(15).toNumber()));

  // ── Component 5: Protocol Health (0–15) ───────────────────────────────
  // Heuristic: known protocols (Folks, Tinyman, Pact) = full score
  // Unknown protocol interactions = penalised
  const knownProtocolShare = new Decimal(allocation.protocolAllocation.folks)
    .plus(allocation.protocolAllocation.tinyman)
    .plus(allocation.protocolAllocation.pact)
    .plus(allocation.protocolAllocation.native);
  const protocolHealth = Math.min(15, Math.round(knownProtocolShare.div(100).mul(15).toNumber()));

  const score = Math.min(100, diversification + liquidity + yieldQuality + sustainability + protocolHealth);

  // ── Descriptive insights ──────────────────────────────────────────────
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (diversification >= 24) strengths.push('Well-diversified portfolio with low concentration risk');
  if (diversification < 10)  weaknesses.push(`High concentration risk — HHI ${Math.round(hhiDecimal.toNumber())} indicates over-exposure to single assets`);
  if (liquidity >= 16)       strengths.push('Strong liquidity buffer in stable and native assets');
  if (liquidity < 6)         weaknesses.push('Low liquidity — majority of assets are locked in illiquid positions');
  if (yieldQuality >= 15)    strengths.push('Portfolio generating above-benchmark DeFi yields');
  if (new Decimal(allocation.protocolAllocation.folks).gt(60))
    strengths.push('Significant allocation to audited lending protocol (Folks Finance)');

  return {
    score,
    components: { diversification, liquidity, yieldQuality, sustainability, protocolHealth },
    strengths,
    weaknesses,
  };
}
```

---

### Step 7 — Snapshot Writer

**File:** `pipeline/07-snapshot-writer.ts`

```typescript
import { prisma } from '@crestflow/shared';
import { PortfolioEvents, PortfolioSnapshotCreatedPayload } from '../events/portfolio.events';
import { eventBus } from '@/lib/event-bus';

export async function writeSnapshotAndEmit(
  userId: string,
  trigger: SnapshotTrigger,
  allocation: AllocationResult,
  pnl: PnlResult,
  performance: PerformanceResult,
  health: HealthScoreResult,
  rawData: RawPortfolioData,
  decompositions: LpDecomposition[],
): Promise<string> {

  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      userId,
      snapshotAt: new Date(),
      trigger,
      totalValueUsd:        allocation.totalValueUsd,
      previousValueUsd:     performance.previousValueUsd,
      changeValueUsd:       performance.changeValueUsd,
      changePercent:        performance.changePercent,
      assetAllocation:      allocation.assetAllocation,
      categoryAllocation:   allocation.categoryAllocation,
      protocolAllocation:   allocation.protocolAllocation,
      directExposure:       allocation.directExposure,
      indirectExposure:     allocation.indirectExposure,
      trueExposure:         allocation.trueExposure,
      unrealizedPnlUsd:     pnl.unrealizedPnlUsd,
      realizedPnlUsd:       pnl.realizedPnlUsd,
      yieldEarnedUsd:       pnl.yieldEarnedUsd,
      feePaidUsd:           pnl.feePaidUsd,
      impermanentLossUsd:   pnl.impermanentLossUsd,
      return7dPercent:      performance.return7d,
      return30dPercent:     performance.return30d,
      return90dPercent:     performance.return90d,
      returnAllTimePercent: performance.returnAllTime,
      healthScore:          health.score,
      healthComponents:     health.components,
      strengths:            health.strengths,
      weaknesses:           health.weaknesses,
      hhi:                  allocation.hhi,
      dataQuality:          { failedSources: rawData.failedSources },
      isPartial:            rawData.failedSources.length > 0,
      assetHoldings:        rawData.account?.assets ?? [],
      protocolPositions:    [...rawData.folksPositions, ...rawData.tinymanPools, ...rawData.pactPools],
      lpDecomposition:      decompositions,
    },
  });

  const payload: PortfolioSnapshotCreatedPayload = {
    snapshotId:     snapshot.id,
    userId,
    totalValueUsd:  allocation.totalValueUsd,
    healthScore:    health.score,
    hhi:            allocation.hhi,
    isPartial:      rawData.failedSources.length > 0,
    timestamp:      snapshot.snapshotAt.toISOString(),
  };

  eventBus.emit(PortfolioEvents.PORTFOLIO_SNAPSHOT_CREATED, payload);
  return snapshot.id;
}
```

---

### Snapshot Repository

**File:** `repositories/snapshot.repository.ts`

```typescript
// INSERT only — no update, no delete methods exposed

import { prisma } from '@crestflow/shared';

export const SnapshotRepository = {
  // Get the most recent snapshot for a user
  async getLatest(userId: string) {
    return prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
    });
  },

  // Get snapshot from approximately N days ago (for performance calculation)
  async getSnapshotAtDaysAgo(userId: string, days: number) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    return prisma.portfolioSnapshot.findFirst({
      where: { userId, snapshotAt: { lte: targetDate } },
      orderBy: { snapshotAt: 'desc' },
    });
  },

  // Paginated history
  async getHistory(userId: string, page: number, pageSize = 20) {
    return prisma.portfolioSnapshot.findMany({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, snapshotAt: true, totalValueUsd: true,
        healthScore: true, trigger: true, isPartial: true,
      },
    });
  },
};
```

---

## API Endpoints

All routes are under `apps/copilot-api/src/modules/portfolio/portfolio.routes.ts`. All require `authenticate` middleware.

---

### GET /api/v1/portfolio/overview

**Purpose:** Latest snapshot summary — top-level numbers for the dashboard header card.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": "14832.50000000",
    "previousValueUsd": "14201.00000000",
    "changeValueUsd": "631.50000000",
    "changePercent": "4.44",
    "healthScore": 72,
    "hhi": "2841.3200",
    "isPartial": false,
    "snapshotAt": "2026-06-24T08:00:00Z",
    "trigger": "ONBOARDING"
  }
}
```

---

### GET /api/v1/portfolio/allocation

**Purpose:** Full allocation breakdown across assets, categories, and protocols.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "assets": {
      "ALGO": { "valueUsd": "8200.00", "percent": "55.29" },
      "USDC": { "valueUsd": "3000.00", "percent": "20.22" }
    },
    "categories": {
      "volatile": "55.29",
      "stablecoin": "20.22",
      "lending": "24.49"
    },
    "protocols": {
      "native": "55.29",
      "folks": "24.49",
      "tinyman": "15.11",
      "pact": "5.11"
    }
  }
}
```

---

### GET /api/v1/portfolio/exposure

**Purpose:** Direct, indirect, and true exposure breakdown — the key differentiated insight.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "direct": {
      "ALGO": { "valueUsd": "8200.00", "percent": "55.29" }
    },
    "indirect": {
      "ALGO": { "valueUsd": "1800.00", "percent": "12.13" },
      "USDC": { "valueUsd": "2240.00", "percent": "15.10" }
    },
    "true": {
      "ALGO": { "valueUsd": "10000.00", "percent": "67.42" },
      "USDC": { "valueUsd": "5240.00", "percent": "35.32" }
    },
    "impermanentLoss": {
      "totalUsd": "-42.18",
      "byPool": [
        { "pool": "ALGO/USDC (Tinyman)", "ilPercent": "-0.8241", "ilUsd": "-42.18" }
      ]
    }
  }
}
```

---

### GET /api/v1/portfolio/performance

**Response (200):**
```json
{
  "success": true,
  "data": {
    "7d":      { "returnPercent": "4.44",  "returnUsd": "631.50" },
    "30d":     { "returnPercent": "12.18", "returnUsd": "1621.00" },
    "90d":     { "returnPercent": "-3.21", "returnUsd": "-492.00" },
    "allTime": { "returnPercent": "28.50", "returnUsd": "3295.00" },
    "pnl": {
      "unrealizedUsd": "1295.00",
      "realizedUsd":   "842.00",
      "yieldEarnedUsd": "314.00",
      "feePaidUsd": "8.40",
      "netPnlUsd": "2442.60"
    }
  }
}
```

---

### GET /api/v1/portfolio/health

**Response (200):**
```json
{
  "success": true,
  "data": {
    "score": 72,
    "components": {
      "diversification": 18,
      "liquidity": 14,
      "yieldQuality": 16,
      "sustainability": 12,
      "protocolHealth": 12
    },
    "strengths": [
      "Portfolio generating above-benchmark DeFi yields",
      "Significant allocation to audited lending protocol (Folks Finance)"
    ],
    "weaknesses": [
      "High concentration risk — HHI 2841 indicates over-exposure to ALGO"
    ],
    "hhi": "2841.3200"
  }
}
```

---

### GET /api/v1/portfolio/snapshots

Paginated snapshot history. Query params: `page`, `pageSize`.

---

### POST /api/v1/portfolio/refresh

Manually triggers a new portfolio scan. Returns `202 Accepted` immediately — snapshot is written asynchronously.

**Response (202):**
```json
{
  "success": true,
  "data": { "message": "Portfolio scan triggered", "trigger": "MANUAL" }
}
```

---

## Events

**File:** `events/portfolio.events.ts`

```typescript
export const PortfolioEvents = {
  PORTFOLIO_SNAPSHOT_CREATED: 'PortfolioSnapshotCreated',
  HEALTH_SCORE_CALCULATED:    'HealthScoreCalculated',
} as const;

export interface PortfolioSnapshotCreatedPayload {
  snapshotId:    string;
  userId:        string;
  totalValueUsd: string;
  healthScore:   number;
  hhi:           string;
  isPartial:     boolean;
  timestamp:     string;   // ISO8601 UTC
}

// Subscribed by:
// - Engine 2 (Risk Analysis) — uses totalValueUsd + trueExposure
// - Engine 4 (Yield Discovery) — uses protocolPositions + allocation
// - Engine 5 (User Intelligence) — uses everything
```

---

## Environment Variables

No new env vars required. All adapters and clients initialized via Plan 01 + Plan 02 env vars.

---

## Packages Required

**`apps/copilot-api/package.json` additions:**
```json
{
  "dependencies": {
    "decimal.js": "^10.x"
  }
}
```

---

## Logging Requirements

Structured JSON logs, `module: "portfolio"`.

- `INFO` — scan started (userId, trigger, algorandAddress)
- `INFO` — data fetch complete (sources: ok/failed per adapter)
- `INFO` — snapshot written (snapshotId, totalValueUsd, healthScore, durationMs)
- `WARN` — partial scan (list of failedSources)
- `WARN` — IL calculation skipped (entry price not found in tx history)
- `ERROR` — snapshot write failed (retry logic: 3 attempts with exponential backoff)
- `ERROR` — all adapters failed (abort scan, do NOT write empty snapshot)

**Never log:** full JSONB payload (use snapshotId for tracing), raw price data, private keys

---

## Testing Requirements

Coverage target: 90%+ on pipeline steps (deterministic math must be verifiable).

### Unit Tests

**`02-lp-decomposer.test.ts`**
- Ownership ratio calculated correctly (bigint division)
- `calculateImpermanentLoss` with known price ratios returns expected IL%
  - k=1 (no price change) → IL = 0
  - k=4 (4x price change) → IL ≈ -5.72%
  - k=0.25 (price dropped 75%) → IL ≈ -5.72% (symmetric)
- Entry price missing → IL = "0" (not null, not crash)

**`04-allocation-analyzer.test.ts`**
- Single asset portfolio → 100% allocation to that asset
- LP decomposition adds to indirect exposure, not direct
- True exposure = direct + indirect per symbol
- HHI correct: 4-asset equal portfolio → HHI = 2500, monopoly → HHI = 10000
- All values are DECIMAL strings, never floats

**`06-health-scorer.test.ts`**
- Diversification: HHI 0 → 30pts, HHI 10000 → 0pts, HHI 5000 → 15pts
- Score bounded 0–100 in all edge cases
- Strengths/weaknesses generated correctly based on thresholds
- Score is integer (not float)

**`05-pnl-calculator.test.ts`**
- Unrealized PnL = (currentPrice - avgCostBasis) × quantity
- IL included in PnL when available
- Fee calculation from transaction history (sum of `fee` fields in TransactionRecord)

### Integration Tests

**`portfolio.service.integration.test.ts`** (real Redis, real Postgres, mocked adapters)
- Full pipeline: event received → snapshot written → event emitted
- Partial data (one adapter fails) → `isPartial: true`, snapshot still written
- All adapters fail → NO snapshot written, error logged
- Manual refresh → new snapshot created (old one unchanged)
- Immutability: attempt to update snapshot row → DB error (role restriction)

**`GET /api/v1/portfolio/overview`** integration
- No snapshot exists → 404 `SNAPSHOT_NOT_FOUND`
- Snapshot exists → 200 with correct shape
- Unauthenticated → 401

---

## Frontend Context Update

**Add to `project-context/frontend-context.md`** under new section `Module: Engine 1 — Portfolio Intelligence`:

### Screens Required
1. **Portfolio Overview Card** — total value, 24h change (green/red), health score badge
2. **Allocation Section** — 3 tabs: by asset / by category / by protocol — pie chart + table
3. **Exposure Section** — direct vs indirect vs true exposure per asset — toggleable view
4. **Performance Section** — 4 tabs: 7D / 30D / 90D / All-time — value + % return chart
5. **PnL Breakdown** — unrealized / realized / yield / fees / net — card grid
6. **Health Score Section** — dial (0–100) + expandable component breakdown + strengths/weaknesses
7. **Positions List** — all holdings + protocol positions with USD values, APY, protocol tag
8. **Refresh Button** — triggers `POST /api/v1/portfolio/refresh` → shows loading state

### State Added
- `portfolio.snapshot` — latest snapshot object
- `portfolio.loading` — scan in progress flag
- `portfolio.lastUpdated` — timestamp of latest snapshot

### API Calls Added

| Trigger | Method | Endpoint |
|---|---|---|
| Page load | GET | `/api/v1/portfolio/overview` |
| Allocation tab | GET | `/api/v1/portfolio/allocation` |
| Exposure tab | GET | `/api/v1/portfolio/exposure` |
| Performance tab | GET | `/api/v1/portfolio/performance` |
| Health tab | GET | `/api/v1/portfolio/health` |
| Refresh button | POST | `/api/v1/portfolio/refresh` |

---

## Progress Tracking

When implemented, update:

**`progress.md`** — Engine 1 → Complete  
**`tasks.md`** — All Engine 1 tasks → [x]  
**`architecture.md`** — Portfolio domain schema updated (both tables)  
**`test.md`** — Add Engine 1 specific test entries  
**`frontend-context.md`** — Add Engine 1 frontend section

---

## Open Items (Deferred)

| Item | Deferred To |
|---|---|
| TWR (Time-Weighted Return) — requires per-cash-flow sub-period tracking | P2 — after multiple snapshots accumulated |
| Scheduled scans (cron-based, e.g. every 6 hours) | After monorepo scheduler is set up |
| Multi-wallet aggregation | P2 (MVP is single embedded wallet) |
| Historical price data for accurate historical PnL | Requires CoinGecko Pro tier or on-chain TWAP storage |
| IL entry price tracking (requires parsing LP deposit txns) | Hardening — entry price parsing from tx history notes |
| x402 payment gating on `/portfolio/exposure` and `/portfolio/health` | Engine 7 / x402 plan |
