# Protocol Adapters — Full Testnet Fix + One-Click Network Switch

## Overview

Three things in one plan:
1. **Folks Finance** — replace dead REST API with official SDK (reads on-chain state)
2. **Tinyman** — URL is hardcoded to mainnet, make it network-aware
3. **Pact** — URL is hardcoded to mainnet, make it network-aware
4. **One-click network switch** — a single `ALGORAND_NETWORK=testnet|mainnet` flag that cascades to every protocol, every app ID, every asset ID, and the Algorand node URLs

---

## How the One-Click Switch Works

Currently `ALGORAND_NETWORK` exists in env but **nothing reads it** except a label. The plan makes it the **single source of truth** that all adapters, config defaults, and protocol constants derive from.

**Switching from testnet → mainnet in production:**
```env
# .env.local (testnet — current)
ALGORAND_NETWORK=testnet

# .env.production (mainnet — future)
ALGORAND_NETWORK=mainnet
```

That single line change will cascade to:
- Algorand node URLs
- USDC ASA ID (`10458941` testnet → `31566704` mainnet)
- Folks Finance pool/manager/deposit app IDs + oracle
- Tinyman analytics API URL
- Pact API URL
- GoPlausible facilitator address (if testnet/mainnet differ)

---

## Proposed Changes

---

### Component 1 — Network Constants Module

#### [NEW] `apps/copilot-api/src/lib/network.ts`

A single file that resolves all network-specific values from `config.ALGORAND_NETWORK`.
Imported by every adapter and anywhere a network-dependent value is needed.

```typescript
import { config } from '../config/env.js';
import {
  TestnetPoolManagerAppId, TestnetDepositsAppId,
  TestnetPools, TestnetOracle,
  MainnetPoolManagerAppId, MainnetDepositsAppId,
  MainnetPools, MainnetOracle,
} from '@folks-finance/algorand-sdk';

export const isTestnet = config.ALGORAND_NETWORK === 'testnet';

export const network = {
  isTestnet,

  // Algorand nodes (already set via env, exposed for convenience)
  algodUrl:    config.ALGORAND_ALGOD_URL,
  indexerUrl:  config.ALGORAND_INDEXER_URL,

  // USDC ASA
  usdcAsaId: isTestnet ? 10_458_941 : 31_566_704,

  // Folks Finance on-chain constants
  folks: {
    poolManagerAppId: isTestnet ? TestnetPoolManagerAppId : MainnetPoolManagerAppId,
    depositsAppId:    isTestnet ? TestnetDepositsAppId    : MainnetDepositsAppId,
    pools:            isTestnet ? TestnetPools            : MainnetPools,
    oracle:           isTestnet ? TestnetOracle           : MainnetOracle,
  },

  // Tinyman analytics API
  tinymanApiUrl: isTestnet
    ? 'https://testnet.analytics.tinyman.org'
    : 'https://mainnet.analytics.tinyman.org',

  // Pact API — single API, same URL for both networks
  // (their mainnet API covers testnet pools too)
  pactApiUrl: 'https://api.pact.fi',
};
```

> [!IMPORTANT]
> This module is the **only place** network values are resolved. Adapters import from here, not from `config` directly for anything network-dependent. Adding a new network-specific value in the future means adding it here only.

---

### Component 2 — Algorand Client Singleton

#### [NEW] `apps/copilot-api/src/lib/algorand.ts`

```typescript
import algosdk from 'algosdk';
import { config } from '../config/env.js';

export const algodClient = new algosdk.Algodv2(
  config.ALGORAND_ALGOD_TOKEN,
  config.ALGORAND_ALGOD_URL,
  '',
);

export const indexerClient = new algosdk.Indexer(
  config.ALGORAND_INDEXER_TOKEN,
  config.ALGORAND_INDEXER_URL,
  '',
);
```

These are already used implicitly (via fetch). This just exposes them as typed SDK clients for the Folks SDK.

---

### Component 3 — `env.ts` — Clean Up Hardcoded Defaults

#### [MODIFY] `apps/copilot-api/src/config/env.ts`

**Remove these fields** — they're replaced by `network.ts`:
```
FOLKS_FINANCE_API_URL   ← deleted (no REST API)
TINYMAN_API_URL         ← deleted (derived from ALGORAND_NETWORK)
PACT_API_URL            ← deleted (derived from ALGORAND_NETWORK)
```

**Update these defaults** so `ALGORAND_NETWORK=testnet` automatically flips the node URLs:
```typescript
// Before (hardcoded mainnet):
ALGORAND_ALGOD_URL: z.string().url().default('https://mainnet-api.4160.nodely.dev'),
ALGORAND_INDEXER_URL: z.string().url().default('https://mainnet-idx.4160.nodely.dev'),

// After (default stays mainnet, but .env.local overrides to testnet):
// No code change needed here — user sets these explicitly in .env.local
// The constants file handles the protocol-level switching
```

**Update X402 USDC ASA default** — currently hardcoded to mainnet `31566704`:
```typescript
// Before:
X402_USDC_ASA_ID: z.coerce.number().default(31566704),

// After — remove the default, derive it from network.ts at runtime:
// (or keep the field but the middleware reads from network.usdcAsaId instead)
```

---

### Component 4 — Folks Finance Adapter Rewrite

#### [MODIFY] `apps/copilot-api/src/modules/knowledge/adapters/folks-finance.adapter.ts`

**Remove:** `folksFetch()`, `FOLKS_API_BASE`, all REST calls

**Replace with SDK calls:**

```typescript
import {
  retrievePoolInfo,
  retrievePoolManagerInfo,
  retrieveUserDepositsFullInfo,
  retrieveUserLoansInfo,
} from '@folks-finance/algorand-sdk';
import { algodClient, indexerClient } from '../../../lib/algorand.js';
import { network } from '../../../lib/network.js';
```

**`getPoolData()` — reads on-chain state of each pool:**
```typescript
const { poolManagerAppId, pools } = network.folks;
await retrievePoolManagerInfo(algodClient, poolManagerAppId); // validates connection
const poolEntries = await Promise.all(
  Object.entries(pools).map(async ([_symbol, pool]) => {
    const info = await retrievePoolInfo(algodClient, pool);
    return mapPoolInfo(pool, info);        // maps to RawFolksPool
  })
);
```

**`getUserPositions()` — reads user's deposit + loan local state:**
```typescript
const { poolManagerAppId, depositsAppId, pools, oracle } = network.folks;
const deposits = await retrieveUserDepositsFullInfo(
  indexerClient, poolManagerAppId, depositsAppId, pools, oracle, address
);
// + retrieveUserLoansInfo for borrow side
```

**Output types unchanged** — still returns `RawFolksPosition[]` and `RawFolksPool[]`.  
Nothing downstream changes.

**Install needed:**
```bash
pnpm add @folks-finance/algorand-sdk @algorandfoundation/algokit-utils --filter copilot-api
```

---

### Component 5 — Tinyman Adapter

#### [MODIFY] `apps/copilot-api/src/modules/knowledge/adapters/tinyman.adapter.ts`

**Current problem:** `TINYMAN_API_BASE = config.TINYMAN_API_URL` is hardcoded to mainnet.

**Fix:** Remove `config.TINYMAN_API_URL` usage. Import from `network.ts`:

```typescript
// Before:
const TINYMAN_API_BASE = config.TINYMAN_API_URL;

// After:
import { network } from '../../../lib/network.js';
const TINYMAN_API_BASE = network.tinymanApiUrl;
// Resolves to:
//   testnet → https://testnet.analytics.tinyman.org
//   mainnet → https://mainnet.analytics.tinyman.org
```

No other changes to the adapter logic. The fetch path `/v1/pools/?limit=200` works on both.

---

### Component 6 — Pact Adapter

#### [MODIFY] `apps/copilot-api/src/modules/knowledge/adapters/pact.adapter.ts`

**Current problem:** `PACT_API_BASE = config.PACT_API_URL` is hardcoded to mainnet.

**Fix:** Import from `network.ts`:

```typescript
// Before:
const PACT_API_BASE = config.PACT_API_URL;

// After:
import { network } from '../../../lib/network.js';
const PACT_API_BASE = network.pactApiUrl;
// Both networks resolve to https://api.pact.fi (their API serves both)
```

> [!NOTE]
> Pact's `/api/pools` endpoint returns pools for all networks. In testnet mode there will be fewer pools with lower TVL — that's correct behavior. No URL difference needed.

---

### Component 7 — `.env.example` Cleanup

#### [MODIFY] `.env.example`

**Remove:**
```
FOLKS_FINANCE_API_URL=https://api.folks.finance
TINYMAN_API_URL=https://mainnet.analytics.tinyman.org
PACT_API_URL=https://api.pact.fi
```

**Add a prominent network switch comment block:**
```env
# ─── Network Switch (ONE CHANGE TO RULE THEM ALL) ───────────────────────────
# Set to 'testnet' for development, 'mainnet' for production.
# This single flag cascades to: Algorand nodes, USDC ASA ID,
# Folks Finance app IDs, Tinyman API URL, Pact pools.
ALGORAND_NETWORK=testnet

# Algorand nodes — must match ALGORAND_NETWORK
ALGORAND_ALGOD_URL=https://testnet-api.4160.nodely.dev     # mainnet: mainnet-api.4160.nodely.dev
ALGORAND_ALGOD_TOKEN=
ALGORAND_INDEXER_URL=https://testnet-idx.4160.nodely.dev   # mainnet: mainnet-idx.4160.nodely.dev
ALGORAND_INDEXER_TOKEN=

# ─── Algorand / x402 ────────────────────────────────────────────────────────
# X402_USDC_ASA_ID is auto-resolved from ALGORAND_NETWORK (no need to set)
# testnet: 10458941  |  mainnet: 31566704
```

---

### Component 8 — x402 Middleware

#### [MODIFY] `apps/copilot-api/src/middleware/x402.ts`

The middleware currently reads `config.X402_USDC_ASA_ID` directly. After this change:

```typescript
// Before:
const usdcAsaId = config.X402_USDC_ASA_ID;

// After:
import { network } from '../lib/network.js';
const usdcAsaId = network.usdcAsaId;
// testnet → 10458941, mainnet → 31566704 — automatic
```

`X402_USDC_ASA_ID` can be removed from `env.ts` entirely.

---

## Summary of File Changes

| File | Action | Why |
|------|--------|-----|
| `src/lib/network.ts` | **NEW** | Single source of truth for all network values |
| `src/lib/algorand.ts` | **NEW** | Typed algod + indexer clients for Folks SDK |
| `src/config/env.ts` | **MODIFY** | Remove 3 dead env vars, remove `X402_USDC_ASA_ID` |
| `adapters/folks-finance.adapter.ts` | **MODIFY** | Replace REST calls with SDK on-chain reads |
| `adapters/tinyman.adapter.ts` | **MODIFY** | Use `network.tinymanApiUrl` instead of env |
| `adapters/pact.adapter.ts` | **MODIFY** | Use `network.pactApiUrl` instead of env |
| `middleware/x402.ts` | **MODIFY** | Use `network.usdcAsaId` instead of env |
| `.env.example` | **MODIFY** | Remove dead vars, add network switch docs |
| `.env.local` | **MODIFY** | Remove 3 dead vars |
| `package.json` (copilot-api) | **MODIFY** | Add `@folks-finance/algorand-sdk`, `@algorandfoundation/algokit-utils` |

---

## Mainnet Switch Checklist (future reference)

When moving to production, the **only things to change** are:
```env
ALGORAND_NETWORK=mainnet
ALGORAND_ALGOD_URL=https://mainnet-api.4160.nodely.dev
ALGORAND_INDEXER_URL=https://mainnet-idx.4160.nodely.dev
GOPLAUSIBLE_FACILITATOR_ADDRESS=<mainnet facilitator address>
```

Everything else — USDC ASA ID, Folks app IDs, Tinyman URL — auto-derives.

---

## Verification Plan

1. `pnpm build --filter copilot-api` — TypeScript must compile clean
2. Start dev server, check logs for "Tinyman / Pact / Folks" adapter initialisation
3. `GET /api/v1/portfolio/summary` for the testnet wallet — verify:
   - Tinyman pool list is not empty (testnet pools exist)
   - Pact pool list is not empty
   - Folks pool data shows ALGO/USDC/USDt pools with APY values
4. Change `ALGORAND_NETWORK=mainnet` temporarily, restart, verify mainnet pool counts are higher (smoke test the switch works)
