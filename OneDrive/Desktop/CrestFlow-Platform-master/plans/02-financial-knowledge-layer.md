# Plan 02 — Financial Knowledge Layer

**Status:** Draft — Awaiting approval  
**Priority:** P0  
**Depends on:** Plan 00 — Monorepo + Tooling Setup  
**Feeds into:** Plan 03 — Engine 1 (Portfolio Intelligence), all downstream engines

---

## Objective

Build the shared **data adapter layer** — all external data clients, a Redis-backed cache, a unified price service, and canonical normalized output types. This is pure infrastructure with zero business logic. No engine may call external APIs directly — all data flows through this module.

> **Rule from `instructions.md`:** Engine 1 is the sole blockchain data consumer. The adapters in this plan are the implementation of that boundary. Engines 2–6 receive Engine 1 outputs — they never call these adapters themselves.

---

## Architecture Decisions

### Redis for Caching
- **`ioredis`** — the canonical Node.js Redis client (TypeScript types built-in)
- Runs as a Docker Compose service alongside PostgreSQL (added to `docker-compose.yml`)
- Cache key namespace: `crestflow:{module}:{key}` — prevents collisions
- Graceful degradation: if Redis is unreachable, adapters bypass cache and fetch live (log a warning, never crash)
- Persistence: `appendonly yes` — survives container restart

### Gora Oracle — Stub (Production-deferred)
- A `GoraOracleAdapter` with a `getPrice(assetId)` interface is defined and reserved now
- Returns `null` for all assets in this plan
- Clearly marked `// GORA_TODO: implement in Engine 6 / Execution plan`
- Reason: Gora feeds are on-chain state in specific Algorand app accounts. Reading them requires knowing the per-asset app IDs for each price feed. CoinGecko (60s refresh, free demo tier) is completely adequate for portfolio analysis (Engines 1–4). Gora price verification is mandatory only at transaction execution time (Engine 6).

### Node Endpoints — Nodely
AlgoNode has been rebranded as **Nodely**. Free public endpoints:
- **Algod:** `https://mainnet-api.4160.nodely.dev`
- **Indexer:** `https://mainnet-idx.4160.nodely.dev`
- No API token required for free tier

### No New DB Tables
This is a pure service layer. All data is fetched live (from external APIs + blockchain) and cached in Redis. Data is only persisted to PostgreSQL when Engine 1 writes a portfolio snapshot (Engine 1 plan).

### One Canonical Type Set
All adapters produce raw types. The normalizer converts these to canonical types (`AssetHolding`, `ProtocolPosition`, `PriceData`, `TransactionRecord`). These canonical types are the **only** data shapes that engines see — engines never import raw adapter types.

---

## Module File Structure

```
apps/copilot-api/src/modules/knowledge/
├── adapters/
│   ├── algorand-indexer.adapter.ts   ← account holdings, ASA metadata, transactions
│   ├── folks-finance.adapter.ts       ← lending/borrowing positions, pool APYs
│   ├── tinyman.adapter.ts             ← LP positions, pool state (computed APY)
│   ├── pact.adapter.ts                ← LP positions, pool analytics
│   ├── coingecko.adapter.ts           ← token prices, market data
│   └── gora-oracle.adapter.ts         ← stub — returns null (Engine 6 TODO)
├── services/
│   ├── cache.service.ts               ← generic Redis-backed TTL cache
│   └── price.service.ts               ← unified pricing (CoinGecko primary)
├── normalizer/
│   ├── asset.normalizer.ts            ← raw ASA → AssetHolding[]
│   ├── protocol.normalizer.ts         ← raw positions → ProtocolPosition[]
│   └── price.normalizer.ts            ← raw price response → PriceData[]
├── types/
│   └── knowledge.types.ts             ← all canonical types exported from one place
├── constants/
│   └── asset-registry.ts              ← ASA ID ↔ CoinGecko ID + metadata mapping
└── knowledge.module.ts                ← single entry point, exports all public services
```

---

## Canonical Data Types

**File:** `src/modules/knowledge/types/knowledge.types.ts`

All monetary amounts use `bigint` (raw on-chain micro-units) until they reach the normalizer. After normalization, all human-readable values are `string` (never `number` or `float`).

```typescript
// All engines import from here — never from individual adapter files

export interface AssetHolding {
  assetId: number;           // 0 = native ALGO
  amount: bigint;            // raw on-chain amount (microALGO or ASA base units)
  decimals: number;          // for ALGO = 6, for USDC = 6, etc.
  unitName: string;          // e.g. "ALGO", "USDC"
  name: string;              // e.g. "Algorand", "USD Coin"
  priceUsd: string;          // DECIMAL string — never float
  valueUsd: string;          // amount (human) * priceUsd — DECIMAL string
  priceSource: 'coingecko' | 'gora' | 'unknown';
  priceUpdatedAt: string;    // ISO8601 UTC
}

export interface ProtocolPosition {
  protocol: 'folks-finance' | 'tinyman' | 'pact';
  positionType: 'supply' | 'borrow' | 'lp';
  assetId: number;           // primary asset
  assetId2?: number;         // LP only: second asset in pair
  amount: bigint;            // raw on-chain amount
  decimals: number;
  unitName: string;
  apyPercent?: string;       // DECIMAL string e.g. "8.42"
  // Folks Finance borrow position fields
  collateralFactor?: string; // DECIMAL string
  liquidationThreshold?: string;
  healthFactor?: string;
  // LP position fields
  poolAddress?: string;
  lpTokenBalance?: bigint;
  priceUsd: string;
  valueUsd: string;
}

export interface PriceData {
  assetId: number;
  coinGeckoId: string;
  symbol: string;
  priceUsd: string;          // DECIMAL string
  change24hPercent: string;  // DECIMAL string (can be negative)
  marketCapUsd: string;      // DECIMAL string
  volume24hUsd: string;      // DECIMAL string
  lastUpdatedAt: string;     // ISO8601 UTC
  source: 'coingecko' | 'gora';
}

export interface TransactionRecord {
  txId: string;
  blockRound: number;
  timestamp: string;         // ISO8601 UTC
  type: 'pay' | 'axfer' | 'appl' | 'acfg' | 'afrz';
  sender: string;
  receiver?: string;
  amount?: bigint;           // raw
  assetId?: number;
  fee: bigint;               // raw microALGO
  note?: string;             // decoded UTF-8 if valid
}

// Raw types from adapters — NOT exported outside the knowledge module
export interface _RawAlgorandAccount {
  address: string;
  amount: number;            // microALGO — converted to bigint by normalizer
  assets: Array<{ 'asset-id': number; amount: number }>;
}

export interface _RawFolksPosition {
  protocol: 'folks-finance';
  marketId: number;
  depositBalance: bigint;
  borrowBalance: bigint;
  depositInterestRate: string;
  borrowInterestRate: string;
  healthFactor?: string;
}

export interface _RawTinymanPool {
  address: string;
  asset1Id: number;
  asset2Id: number;
  asset1Reserves: bigint;
  asset2Reserves: bigint;
  issuedLiquidity: bigint;
  totalFeeShare: string;
}

export interface _RawPactPool {
  poolId: number;
  primaryAssetId: number;
  secondaryAssetId: number;
  tvlUsd: string;
  apr7d: string;
  volume24h: string;
}
```

---

## Asset Registry

**File:** `src/modules/knowledge/constants/asset-registry.ts`

Maps Algorand ASA IDs to CoinGecko IDs and metadata. Used by price service to batch-fetch prices and by normalizer to enrich holdings.

```typescript
export interface AssetMeta {
  assetId: number;
  coinGeckoId: string | null;  // null = not on CoinGecko (use on-chain price or mark as unknown)
  symbol: string;
  name: string;
  decimals: number;
}

// Core Algorand ecosystem assets
export const ASSET_REGISTRY: Record<number, AssetMeta> = {
  0: { assetId: 0, coinGeckoId: 'algorand', symbol: 'ALGO', name: 'Algorand', decimals: 6 },
  31566704: { assetId: 31566704, coinGeckoId: 'usd-coin', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  312769:   { assetId: 312769, coinGeckoId: 'tether', symbol: 'USDt', name: 'Tether USDt', decimals: 6 },
  386195940: { assetId: 386195940, coinGeckoId: 'ethereum', symbol: 'goETH', name: 'goETH', decimals: 8 },
  386192725: { assetId: 386192725, coinGeckoId: 'bitcoin', symbol: 'goBTC', name: 'goBTC', decimals: 8 },
  793124631: { assetId: 793124631, coinGeckoId: 'wrapped-bitcoin', symbol: 'wBTC', name: 'Wrapped BTC', decimals: 8 },
};

// Returns metadata for known assets, or a generic stub for unknown ones
export function getAssetMeta(assetId: number): AssetMeta {
  return ASSET_REGISTRY[assetId] ?? {
    assetId,
    coinGeckoId: null,
    symbol: `ASA-${assetId}`,
    name: `Unknown ASA ${assetId}`,
    decimals: 0,  // fetched dynamically from Indexer if unknown
  };
}
```

---

## Cache Service

**File:** `src/modules/knowledge/services/cache.service.ts`

```typescript
// Uses: ioredis
// Namespace all keys under crestflow: prefix

import Redis from 'ioredis';

let redisClient: Redis | null = null;

function getClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    redisClient.on('error', (err) => {
      // Log but don't crash — adapters degrade gracefully
      console.error('[cache] Redis error:', err.message);
    });
  }
  return redisClient;
}

const KEY_PREFIX = 'crestflow';

export const CacheService = {
  async get<T>(namespace: string, key: string): Promise<T | null> {
    try {
      const raw = await getClient().get(`${KEY_PREFIX}:${namespace}:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;  // graceful degradation — cache miss on error
    }
  },

  async set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await getClient().setex(
        `${KEY_PREFIX}:${namespace}:${key}`,
        ttlSeconds,
        JSON.stringify(value)
      );
    } catch {
      // Cache write failure is non-fatal — log and continue
    }
  },

  async del(namespace: string, key: string): Promise<void> {
    try {
      await getClient().del(`${KEY_PREFIX}:${namespace}:${key}`);
    } catch { /* non-fatal */ }
  },

  async invalidateNamespace(namespace: string): Promise<void> {
    try {
      const keys = await getClient().keys(`${KEY_PREFIX}:${namespace}:*`);
      if (keys.length) await getClient().del(...keys);
    } catch { /* non-fatal */ }
  },
};

// TTL constants — single source of truth for all cache durations
export const CacheTTL = {
  PRICE:              60,        // 60s — matches CoinGecko free tier refresh
  POOL_APYS:          300,       // 5 min — pool rates change slowly
  ACCOUNT_HOLDINGS:   30,        // 30s — near real-time portfolio accuracy
  ASA_METADATA:       3600,      // 1 hour — ASA names/decimals rarely change
  PROTOCOL_POSITIONS: 30,        // 30s — same as account holdings
} as const;
```

---

## Adapters

### 1. Algorand Indexer Adapter

**File:** `src/modules/knowledge/adapters/algorand-indexer.adapter.ts`

```typescript
import algosdk from 'algosdk';
import { CacheService, CacheTTL } from '../services/cache.service';
import type { _RawAlgorandAccount, TransactionRecord } from '../types/knowledge.types';

const indexer = new algosdk.Indexer(
  process.env.ALGORAND_INDEXER_TOKEN ?? '',
  process.env.ALGORAND_INDEXER_URL!,
  ''   // port is embedded in the URL for Nodely
);

const algod = new algosdk.Algodv2(
  process.env.ALGORAND_ALGOD_TOKEN ?? '',
  process.env.ALGORAND_ALGOD_URL!,
  ''
);

export const AlgorandIndexerAdapter = {
  // Returns ALGO balance + all ASA holdings for an address
  async getAccountHoldings(address: string): Promise<_RawAlgorandAccount> {
    const cacheKey = address;
    const cached = await CacheService.get<_RawAlgorandAccount>('indexer:account', cacheKey);
    if (cached) return cached;

    const result = await indexer.lookupAccountByID(address).do();
    const data: _RawAlgorandAccount = result.account;
    await CacheService.set('indexer:account', cacheKey, data, CacheTTL.ACCOUNT_HOLDINGS);
    return data;
  },

  // Returns paginated transaction history
  async getTransactionHistory(
    address: string,
    limit = 100
  ): Promise<TransactionRecord[]> {
    const cacheKey = `${address}:${limit}`;
    const cached = await CacheService.get<TransactionRecord[]>('indexer:txns', cacheKey);
    if (cached) return cached;

    const result = await indexer
      .lookupAccountTransactions(address)
      .limit(limit)
      .do();

    const records: TransactionRecord[] = result.transactions.map((tx: any) => ({
      txId: tx.id,
      blockRound: tx['confirmed-round'],
      timestamp: new Date(tx['round-time'] * 1000).toISOString(),
      type: tx['tx-type'],
      sender: tx.sender,
      receiver: tx['payment-transaction']?.receiver,
      amount: tx['payment-transaction']?.amount !== undefined
        ? BigInt(tx['payment-transaction'].amount)
        : undefined,
      assetId: tx['asset-transfer-transaction']?.['asset-id'],
      fee: BigInt(tx.fee),
      note: tx.note ? Buffer.from(tx.note, 'base64').toString('utf8') : undefined,
    }));

    await CacheService.set('indexer:txns', cacheKey, records, CacheTTL.ACCOUNT_HOLDINGS);
    return records;
  },

  // Fetch ASA metadata — cached for 1 hour
  async getAssetMetadata(assetId: number): Promise<{ decimals: number; unitName: string; name: string }> {
    const cacheKey = String(assetId);
    const cached = await CacheService.get<{ decimals: number; unitName: string; name: string }>(
      'indexer:asa', cacheKey
    );
    if (cached) return cached;

    const result = await indexer.lookupAssetByID(assetId).do();
    const params = result.asset.params;
    const meta = {
      decimals: params.decimals ?? 0,
      unitName: params['unit-name'] ?? `ASA-${assetId}`,
      name: params.name ?? `Unknown ASA ${assetId}`,
    };
    await CacheService.set('indexer:asa', cacheKey, meta, CacheTTL.ASA_METADATA);
    return meta;
  },
};
```

---

### 2. Folks Finance Adapter

**File:** `src/modules/knowledge/adapters/folks-finance.adapter.ts`

```typescript
// Uses: @folks-finance/algorand-sdk
// Provides: supply positions, borrow positions, pool APYs

import { CacheService, CacheTTL } from '../services/cache.service';
import type { _RawFolksPosition } from '../types/knowledge.types';

// Folks Finance SDK initialization — algod and indexer clients passed in
// Full initialization depends on network config from @folks-finance/algorand-sdk
// Concrete initialization is done at module startup (knowledge.module.ts)

export const FolksFinanceAdapter = {
  // Returns all supply + borrow positions for an Algorand address
  async getUserPositions(
    address: string,
    folksClient: any  // typed properly once SDK is installed
  ): Promise<_RawFolksPosition[]> {
    const cacheKey = address;
    const cached = await CacheService.get<_RawFolksPosition[]>('folks:positions', cacheKey);
    if (cached) return cached;

    // SDK call: fetches user's local state across all Folks market app accounts
    const positions: _RawFolksPosition[] = await folksClient.getUserPositions(address);
    await CacheService.set('folks:positions', cacheKey, positions, CacheTTL.PROTOCOL_POSITIONS);
    return positions;
  },

  // Returns all pool market configs including supply/borrow APYs
  async getPoolData(folksClient: any): Promise<Record<number, { supplyApy: string; borrowApy: string; tvl: string }>> {
    const cacheKey = 'all';
    const cached = await CacheService.get<Record<number, any>>('folks:pools', cacheKey);
    if (cached) return cached;

    const pools = await folksClient.getMarketPools();
    await CacheService.set('folks:pools', cacheKey, pools, CacheTTL.POOL_APYS);
    return pools;
  },
};
```

---

### 3. Tinyman Adapter

**File:** `src/modules/knowledge/adapters/tinyman.adapter.ts`

```typescript
// Uses: @tinymanorg/tinyman-js-sdk
// No public REST analytics API — all data is on-chain via algod/indexer

import { CacheService, CacheTTL } from '../services/cache.service';
import type { _RawTinymanPool } from '../types/knowledge.types';

export const TinymanAdapter = {
  // Detects LP token holdings from wallet ASA list, then fetches corresponding pool state
  async getUserLpPositions(
    address: string,
    asaHoldings: Array<{ assetId: number; amount: bigint }>,
    tinymanClient: any
  ): Promise<_RawTinymanPool[]> {
    const cacheKey = address;
    const cached = await CacheService.get<_RawTinymanPool[]>('tinyman:positions', cacheKey);
    if (cached) return cached;

    // LP tokens are just ASAs — we detect them by checking if the assetId
    // corresponds to a known Tinyman pool LP token address
    const lpTokenIds = asaHoldings
      .map((h) => h.assetId)
      .filter((id) => tinymanClient.isLpToken(id));

    const positions: _RawTinymanPool[] = await Promise.all(
      lpTokenIds.map((lpId) => tinymanClient.fetchPoolByLpTokenId(lpId))
    );

    await CacheService.set('tinyman:positions', cacheKey, positions, CacheTTL.PROTOCOL_POSITIONS);
    return positions;
  },

  // Fetch all active pools (used by Engine 4 for yield discovery)
  async getAllPools(tinymanClient: any): Promise<_RawTinymanPool[]> {
    const cacheKey = 'all';
    const cached = await CacheService.get<_RawTinymanPool[]>('tinyman:pools', cacheKey);
    if (cached) return cached;

    const pools = await tinymanClient.fetchPools();
    await CacheService.set('tinyman:pools', cacheKey, pools, CacheTTL.POOL_APYS);
    return pools;
  },
};
```

---

### 4. Pact Adapter

**File:** `src/modules/knowledge/adapters/pact.adapter.ts`

```typescript
// Uses: pactsdk
// Pact has a list_pools() method with aggregated APY/TVL data

import { CacheService, CacheTTL } from '../services/cache.service';
import type { _RawPactPool } from '../types/knowledge.types';

export const PactAdapter = {
  // Returns all Pact pools with TVL, APY, volume data
  async getAllPools(pactClient: any): Promise<_RawPactPool[]> {
    const cacheKey = 'all';
    const cached = await CacheService.get<_RawPactPool[]>('pact:pools', cacheKey);
    if (cached) return cached;

    const pools = await pactClient.listPools();
    const normalized: _RawPactPool[] = pools.map((p: any) => ({
      poolId: p.appId,
      primaryAssetId: p.primaryAsset.index,
      secondaryAssetId: p.secondaryAsset.index,
      tvlUsd: String(p.tvlUsd ?? '0'),
      apr7d: String(p.apr7d ?? '0'),
      volume24h: String(p.volume24h ?? '0'),
    }));

    await CacheService.set('pact:pools', cacheKey, normalized, CacheTTL.POOL_APYS);
    return normalized;
  },

  // Returns LP positions for a specific wallet (LP token balance → pool mapping)
  async getUserLpPositions(
    address: string,
    asaHoldings: Array<{ assetId: number; amount: bigint }>,
    pactClient: any
  ): Promise<_RawPactPool[]> {
    const cacheKey = address;
    const cached = await CacheService.get<_RawPactPool[]>('pact:positions', cacheKey);
    if (cached) return cached;

    const allPools = await PactAdapter.getAllPools(pactClient);
    // Filter to pools where the user holds LP tokens
    const userPools = allPools.filter((pool) =>
      asaHoldings.some((h) => h.assetId === pool.poolId)
    );

    await CacheService.set('pact:positions', cacheKey, userPools, CacheTTL.PROTOCOL_POSITIONS);
    return userPools;
  },
};
```

---

### 5. CoinGecko Adapter

**File:** `src/modules/knowledge/adapters/coingecko.adapter.ts`

```typescript
// Uses: native fetch (Node 18+)
// Free demo tier: 100 calls/min, 10k calls/month, 60s data refresh

import { CacheService, CacheTTL } from '../services/cache.service';
import type { PriceData } from '../types/knowledge.types';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function cgFetch(path: string): Promise<any> {
  const resp = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      'x-cg-demo-api-key': process.env.COINGECKO_API_KEY!,
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(`CoinGecko fetch failed: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export const CoinGeckoAdapter = {
  // Batch fetch prices for multiple CoinGecko IDs in one request
  async getPrices(coinGeckoIds: string[]): Promise<Record<string, PriceData>> {
    if (!coinGeckoIds.length) return {};
    const cacheKey = coinGeckoIds.sort().join(',');
    const cached = await CacheService.get<Record<string, PriceData>>('cg:prices', cacheKey);
    if (cached) return cached;

    const ids = coinGeckoIds.join(',');
    const data = await cgFetch(
      `/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
    );

    const result: Record<string, PriceData> = {};
    for (const [cgId, raw] of Object.entries(data as Record<string, any>)) {
      result[cgId] = {
        assetId: -1,       // filled in by price.service.ts via asset-registry lookup
        coinGeckoId: cgId,
        symbol: cgId,      // overwritten by asset-registry
        priceUsd: String(raw.usd ?? '0'),
        change24hPercent: String(raw.usd_24h_change ?? '0'),
        marketCapUsd: String(raw.usd_market_cap ?? '0'),
        volume24hUsd: String(raw.usd_24h_vol ?? '0'),
        lastUpdatedAt: new Date((raw.last_updated_at ?? 0) * 1000).toISOString(),
        source: 'coingecko',
      };
    }

    await CacheService.set('cg:prices', cacheKey, result, CacheTTL.PRICE);
    return result;
  },
};
```

---

### 6. Gora Oracle Adapter (Stub)

**File:** `src/modules/knowledge/adapters/gora-oracle.adapter.ts`

```typescript
// GORA_TODO: Full implementation deferred to Engine 6 / Execution Plan.
//
// Gora is a decentralized oracle on Algorand. Price feeds are delivered
// on-chain into specific Algorand app global state by Gora validator nodes.
// Reading them requires:
//   1. Knowing the per-asset Gora feed app IDs
//   2. Querying the app global state via algod
//   3. Decoding the ABI-encoded price value
//
// For Engines 1–4, CoinGecko pricing (60s refresh) is sufficient.
// Gora price verification is mandatory at execution time (Engine 6)
// to ensure prices are not stale before any on-chain transaction.

export const GoraOracleAdapter = {
  // Returns null — Gora not wired in this plan
  async getPrice(_assetId: number): Promise<{ priceUsd: string; confidence: string } | null> {
    // GORA_TODO: implement in Engine 6 / Execution Plan
    // Will query Gora feed app global state via algod.getApplicationByID()
    return null;
  },

  // Returns null for all assets
  async getPrices(_assetIds: number[]): Promise<Record<number, { priceUsd: string } | null>> {
    // GORA_TODO: batch query multiple Gora feeds
    return {};
  },
};
```

---

## Price Service (Unified)

**File:** `src/modules/knowledge/services/price.service.ts`

The single source of pricing for all engines. Tries Gora first (for execution-safe prices), falls back to CoinGecko. In this plan, Gora always returns null so CoinGecko is always used.

```typescript
import { CoinGeckoAdapter } from '../adapters/coingecko.adapter';
import { GoraOracleAdapter } from '../adapters/gora-oracle.adapter';
import { ASSET_REGISTRY, getAssetMeta } from '../constants/asset-registry';
import type { PriceData } from '../types/knowledge.types';

export const PriceService = {
  // Primary method: fetch prices for a list of ASA IDs
  // Tries Gora (null currently), falls back to CoinGecko
  async getPricesForAssets(assetIds: number[]): Promise<Record<number, PriceData>> {
    const result: Record<number, PriceData> = {};

    // Collect CoinGecko IDs for known assets
    const cgIdToAssetId: Record<string, number> = {};
    const unknownAssets: number[] = [];

    for (const id of assetIds) {
      const meta = getAssetMeta(id);
      if (meta.coinGeckoId) {
        cgIdToAssetId[meta.coinGeckoId] = id;
      } else {
        unknownAssets.push(id);
      }
    }

    // Fetch from CoinGecko in one batched call
    const cgPrices = await CoinGeckoAdapter.getPrices(Object.keys(cgIdToAssetId));

    for (const [cgId, priceData] of Object.entries(cgPrices)) {
      const assetId = cgIdToAssetId[cgId];
      const meta = getAssetMeta(assetId);
      result[assetId] = {
        ...priceData,
        assetId,
        symbol: meta.symbol,
        coinGeckoId: cgId,
      };
    }

    // Unknown assets — no price available
    for (const id of unknownAssets) {
      result[id] = {
        assetId: id,
        coinGeckoId: '',
        symbol: getAssetMeta(id).symbol,
        priceUsd: '0',
        change24hPercent: '0',
        marketCapUsd: '0',
        volume24hUsd: '0',
        lastUpdatedAt: new Date().toISOString(),
        source: 'coingecko',
      };
    }

    return result;
  },
};
```

---

## Knowledge Module Entry Point

**File:** `src/modules/knowledge/knowledge.module.ts`

This is the **only** file engines import from. It initializes all clients once at startup and exports a clean API surface.

```typescript
import algosdk from 'algosdk';
import { AlgorandIndexerAdapter } from './adapters/algorand-indexer.adapter';
import { FolksFinanceAdapter } from './adapters/folks-finance.adapter';
import { TinymanAdapter } from './adapters/tinyman.adapter';
import { PactAdapter } from './adapters/pact.adapter';
import { PriceService } from './services/price.service';
import { CacheService } from './services/cache.service';

// Singleton clients — initialized once at server startup
const algodClient = new algosdk.Algodv2(
  process.env.ALGORAND_ALGOD_TOKEN ?? '',
  process.env.ALGORAND_ALGOD_URL!,
  ''
);

const indexerClient = new algosdk.Indexer(
  process.env.ALGORAND_INDEXER_TOKEN ?? '',
  process.env.ALGORAND_INDEXER_URL!,
  ''
);

// Protocol SDK clients initialized here
// (folks, tinyman, pact clients initialized with algodClient + indexerClient)
// Placeholder — filled in during implementation once SDK APIs are confirmed

export {
  AlgorandIndexerAdapter,
  FolksFinanceAdapter,
  TinymanAdapter,
  PactAdapter,
  PriceService,
  CacheService,
  algodClient,
  indexerClient,
};

// Re-export canonical types so engines only need one import
export type { AssetHolding, ProtocolPosition, PriceData, TransactionRecord } from './types/knowledge.types';
```

---

## Docker Compose — Add Redis

**File:** `docker-compose.yml` (update — add Redis service to existing PostgreSQL setup)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: crestflow_postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: crestflow
      POSTGRES_PASSWORD: crestflow
      POSTGRES_DB: crestflow_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: crestflow_redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes   # AOF persistence — survives restart
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Environment Variables

**Additions to `apps/copilot-api/.env.example`:**

```bash
# ─── Algorand Node (Nodely — formerly AlgoNode) ──────
ALGORAND_ALGOD_URL=https://mainnet-api.4160.nodely.dev
ALGORAND_ALGOD_TOKEN=
ALGORAND_INDEXER_URL=https://mainnet-idx.4160.nodely.dev
ALGORAND_INDEXER_TOKEN=

# ─── CoinGecko (Free Demo Key) ───────────────────────
COINGECKO_API_KEY=your_coingecko_demo_api_key

# ─── Redis ───────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Packages Required

**`apps/copilot-api/package.json` additions:**

```json
{
  "dependencies": {
    "algosdk": "^2.x",
    "ioredis": "^5.x",
    "@folks-finance/algorand-sdk": "latest",
    "@tinymanorg/tinyman-js-sdk": "latest",
    "pactsdk": "latest"
  }
}
```

> **Note:** `algosdk` v2 is current stable. v3 is in active development with TypeScript-first contracts but v2 is correct for indexer/algod client usage.

---

## TTL Reference Table

| Cache Namespace | TTL | Rationale |
|---|---|---|
| `crestflow:price:*` | 60s | Matches CoinGecko free tier 60s refresh |
| `crestflow:cg:prices:*` | 60s | Same — CoinGecko batch response |
| `crestflow:indexer:account:*` | 30s | Near real-time holdings accuracy |
| `crestflow:indexer:txns:*` | 30s | Transaction history near real-time |
| `crestflow:indexer:asa:*` | 3600s | ASA metadata rarely changes |
| `crestflow:folks:positions:*` | 30s | Borrow health factor is time-sensitive |
| `crestflow:folks:pools:*` | 300s | Pool APYs move slowly |
| `crestflow:tinyman:positions:*` | 30s | LP value is account-specific |
| `crestflow:tinyman:pools:*` | 300s | Pool reserves move slowly |
| `crestflow:pact:pools:*` | 300s | Pool analytics update slowly |
| `crestflow:pact:positions:*` | 30s | Account-specific, near real-time |

---

## Logging Requirements

Structured JSON logs, same format as Plan 01 (`service`, `module`, `requestId`, `level`, `message`).

Events to log:
- `DEBUG` — cache hit (namespace, key)
- `DEBUG` — cache miss, fetching live (namespace, key)
- `WARN` — Redis unreachable, bypassing cache
- `WARN` — CoinGecko rate limit hit (429 response)
- `ERROR` — Indexer fetch failed (include address, error code)
- `ERROR` — Folks Finance SDK error
- `INFO` — Knowledge module initialized (list of adapters ready)

Never log: full API response bodies, private keys, wallet addresses in plain text (hash them in logs)

---

## Testing Requirements

Coverage target: 80% overall. Adapters are tested with mocked external SDKs and Redis.

### Unit Tests

**`cache.service.test.ts`** (mock ioredis)
- `get` returns parsed JSON on hit
- `get` returns null on miss
- `get` returns null when Redis throws (graceful degradation)
- `set` writes with correct TTL
- `set` is non-fatal when Redis throws
- Key format: `crestflow:{namespace}:{key}` verified

**`coingecko.adapter.test.ts`** (mock fetch)
- Batch price request for multiple IDs → correct PriceData map returned
- 429 response → throws with `CoinGecko rate limit` message
- Cache hit → no fetch call made
- Cache miss → fetch called, result cached

**`price.service.test.ts`**
- Known ASA IDs → correct CoinGecko IDs resolved via asset registry
- Unknown ASA IDs → price returned as `"0"` with `source: 'coingecko'`
- Gora always returns null → CoinGecko used for all assets

**`algorand-indexer.adapter.test.ts`** (mock algosdk.Indexer)
- `getAccountHoldings` → correct `_RawAlgorandAccount` shape returned
- `getTransactionHistory` → transactions mapped to `TransactionRecord` correctly
- `getAssetMetadata` → cached for 1 hour
- Cache hit → no indexer call made

**`asset-registry.test.ts`**
- Known ASA IDs return correct metadata (ALGO=0, USDC=31566704, etc.)
- Unknown ASA ID → returns generic stub with `coinGeckoId: null`

### Integration Tests

**`knowledge.module.integration.test.ts`** (real Redis in Docker, mocked Algorand/protocol APIs)
- Full round-trip: fetch account holdings → cache → second call returns cached value
- Cache eviction after TTL → next call re-fetches
- Redis down → adapters still return data (bypass cache)

---

## Handoff to Engine 1

Engine 1 (Portfolio Intelligence) imports exclusively from `knowledge.module.ts`:

```typescript
import {
  AlgorandIndexerAdapter,
  FolksFinanceAdapter,
  TinymanAdapter,
  PactAdapter,
  PriceService,
  type AssetHolding,
  type ProtocolPosition,
  type PriceData,
} from '@/modules/knowledge';
```

Engine 1 uses these adapters to:
1. Fetch raw account holdings via `AlgorandIndexerAdapter.getAccountHoldings(algorandAddress)`
2. Fetch protocol positions in parallel via `FolksFinanceAdapter.getUserPositions()`, `TinymanAdapter.getUserLpPositions()`, `PactAdapter.getUserLpPositions()`
3. Fetch prices for all detected assets via `PriceService.getPricesForAssets(assetIds)`
4. Pass all raw data to normalizers → produce canonical `AssetHolding[]` and `ProtocolPosition[]`
5. Generate the Portfolio Snapshot (persisted to DB — defined in Engine 1 plan)

---

## Progress Tracking

When implemented, update:
- `project-context/progress.md` → Algorand Indexer, CoinGecko, Folks Finance API, Tinyman API all → Complete
- `project-context/tasks.md` → Financial Knowledge Layer tasks → [x]
- `project-context/architecture.md` → Note that this module is schema-free (no DB tables — pure adapter layer)

---

## Open Items (Deferred)

| Item | Deferred To |
|---|---|
| Gora Oracle price feed reading | Engine 6 / Execution Plan |
| Redis authentication (password/TLS) | Hardening — before production |
| CoinGecko Pro tier upgrade | When call volume exceeds 10k/month |
| Pact API breaking change handling | Pact SDK version pinning strategy |
| Historical price data (for PnL) | Engine 1 plan (uses transaction + price history) |
| Websocket price streaming | P2 — real-time dashboard updates |
