# CrestFlow — External Integrations Implementation Plan

**Date:** 2026-07-06
**Scope:** All external dependencies identified in audit_report.md

---

## Overview

The integrations are ordered by dependency chain. Some integrations unlock others
(Veriff must pass before GoPlausible can issue a DID).

| Track | Integration | Type | Effort | Blocks |
|-------|-------------|------|--------|--------|
| A | OpenAI + Gemini LLM | API key only | 1 hour | Copilot live |
| B | Veriff KYC | API key + account | 1 day | GoPlausible, Transak |
| C | GoPlausible DID/VC | API key + account | 1 day | x402 facilitator |
| D | Transak On-Ramp/Off-Ramp | API key + partner approval | 2-3 days | Fiat flows |
| E | Algorand Protocol SDKs | npm packages only | 2-3 days | Real execution |
| F | Turnkey Transaction Signing | SDK extension | 1 day | Real execution |
| G | Gora Oracle | On-chain app IDs (P2) | 1-2 days | Execution price verification |

---

## Track A — OpenAI + Gemini LLM (Copilot)

### Current State

`llm.client.ts` is fully implemented with dual-provider fallback. No code changes needed.
The client checks `config.OPENAI_API_KEY` and `config.GOOGLE_AI_API_KEY`.
If empty, LLM calls fail at runtime.

### Step 1 — Obtain OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key" — name it `crestflow-production`
3. Copy the key (shown once only)
4. Add billing at https://platform.openai.com/settings/billing (minimum $5)
5. Model `gpt-4.1-mini` is available on Pay-As-You-Go

### Step 2 — Obtain Google AI (Gemini) API Key

1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API key"
3. Select or create a Google Cloud project
4. Copy the key

### Step 3 — Configure Environment

Add to `.env.local` (never commit this file):

```env
OPENAI_API_KEY=sk-proj-...your-key-here...
GOOGLE_AI_API_KEY=AIza...your-key-here...
```

### Step 4 — Verify

No code changes needed. Start the server and test:

```bash
POST /api/v1/copilot/query
Authorization: Bearer <your-jwt>
{ "message": "What is my portfolio risk score?", "sessionId": "test-1" }
```

Expect a real LLM response.

### Cost Estimate

- OpenAI gpt-4.1-mini: ~$0.0004 per 1K input tokens
- Gemini 2.5-flash: Free tier (1M tokens/day)

---

## Track B — Veriff KYC

### Current State

`veriff.client.ts` is complete with two code paths:
- No API key: returns mock session URL
- API key set: makes real REST call to Veriff

No code changes needed. Only credential configuration and webhook registration.

**File:** `apps/copilot-api/src/modules/kyc/veriff.client.ts`

### Step 1 — Create Veriff Account

1. Go to https://developers.veriff.com or https://veriff.com/contact-sales
2. Sign up for a Sandbox account (free, instant access)
3. Navigate: Dashboard > Settings > Integrations > API Keys
4. Copy the API Key and API Secret

### Step 2 — Configure Environment

```env
VERIFF_API_KEY=your-veriff-api-key
VERIFF_API_SECRET=your-veriff-api-secret
VERIFF_API_URL=https://stationapi.veriff.com/v1
VERIFF_WEBHOOK_SECRET=your-veriff-webhook-hmac-secret
```

### Step 3 — Register Webhook URL

In Veriff Dashboard > Settings > Webhooks:
1. Add: `https://your-domain.com/api/v1/kyc/webhook/veriff`
2. Select event: `DECISION_MADE`
3. Copy the webhook secret into `VERIFF_WEBHOOK_SECRET`

For local testing with ngrok:
```bash
ngrok http 3000
# Use: https://xxxx.ngrok.io/api/v1/kyc/webhook/veriff
```

### Step 4 — Test End-to-End

```bash
# 1. Initiate KYC
POST /api/v1/kyc/initiate
Authorization: Bearer <jwt>

# 2. Open returned sessionUrl in browser and complete verification
# 3. Veriff sends webhook — check DB: user.kycStatus should be 'APPROVED'
```

### Step 5 — Production Checklist

- [ ] Switch to production Veriff account (requires compliance review)
- [ ] Complete Veriff compliance questionnaire
- [ ] The `verifyWebhookSignature()` in `veriff.client.ts` is already implemented — just needs the secret set

---

## Track C — GoPlausible DID/VC + x402 Facilitator

### Current State

`goplausible.client.ts` is complete with two code paths:
- No API key: returns mock DID and mock VC JWT
- API key set: makes real REST calls

No code changes needed in `goplausible.client.ts`.
However, x402 middleware wiring (internal gap) must also be fixed.

### Step 1 — Create GoPlausible Account

1. Go to https://goplausible.com or https://docs.goplausible.com
2. Sign up for a developer account
3. Obtain: API Key + Facilitator Algorand Address

> GoPlausible is an Algorand Foundation grantee. If docs are limited, contact them via Algorand developer Discord.

### Step 2 — Configure Environment

```env
GOPLAUSIBLE_API_URL=https://api.goplausible.com
GOPLAUSIBLE_API_KEY=your-goplausible-api-key
GOPLAUSIBLE_FACILITATOR_ADDRESS=your-algorand-facilitator-address
X402_ENABLED=true
```

### Step 3 — Wire x402 Middleware to Routes (Internal Fix Required)

This is an internal gap that must be fixed alongside the GoPlausible credentials.

In `apps/copilot-api/src/modules/execution/execution.routes.ts`:
```typescript
import { x402Gate } from '../../middleware/x402.js';

// Change paid routes from:
const opts = { preHandler: [authenticate] };
// To:
const opts = { preHandler: [authenticate, x402Gate] };
```

Apply the same change in:
- `copilot.routes.ts` — for `POST /api/v1/copilot/query`
- `portfolio.routes.ts` — for `POST /api/v1/portfolio/refresh`
- `audit.routes.ts` — for `GET /api/v1/audit/export`

### Step 4 — Verify DID/VC Issuance

DID and VC are auto-issued after Veriff KYC approval (Track B must complete first).
After a user gets KYC approved, check:

```bash
GET /api/v1/kyc/did
Authorization: Bearer <jwt>
# Expect: { "did": "did:algo:mainnet:...", "kycTier": "TIER_1" }
```

---

## Track D — Transak On-Ramp / Off-Ramp

### Current State

`kyc.service.ts` line 185 has a hardcoded stub:
```typescript
return { transactionId: tx.id, paymentUrl: `https://global.transak.com/?orderId=${tx.id}` };
```

This needs a real Transak widget URL built with your partner API key.

### Step 1 — Create Transak Partner Account

1. Go to https://transak.com/integrate
2. Click "Get Started" — requires business registration
3. Transak reviews and provides: Partner API Key, API Secret, Webhook Secret

For development, use Transak staging:
- Dashboard: https://dashboard.transak.com (select Staging mode)
- Base URL: `https://staging-global.transak.com`

### Step 2 — Configure Environment

```env
TRANSAK_API_KEY=your-transak-api-key
TRANSAK_API_SECRET=your-transak-api-secret
TRANSAK_WEBHOOK_SECRET=your-transak-webhook-secret
```

### Step 3 — Implement Real On-Ramp

In `kyc.service.ts` `initiateOnRamp()`, replace line 183-185:

```typescript
// Replace this:
return { transactionId: tx.id, paymentUrl: `https://global.transak.com/?orderId=${tx.id}` };

// With this:
const transakBase = config.NODE_ENV === 'production'
  ? 'https://global.transak.com'
  : 'https://staging-global.transak.com';

const params = new URLSearchParams({
  apiKey: config.TRANSAK_API_KEY,
  network: 'algorand',
  cryptoCurrencyCode: targetAsset.toUpperCase(),
  walletAddress: user.algorandAddress ?? '',
  fiatAmount: fiatAmountInr,
  fiatCurrency: 'INR',
  partnerOrderId: tx.id,
  partnerCustomerId: userId,
  redirectURL: `${config.FRONTEND_URL}/portfolio?onramp=complete`,
});

return { transactionId: tx.id, paymentUrl: `${transakBase}/?${params.toString()}` };
```

### Step 4 — Add Transak Webhook Signature Verification

In `kyc.routes.ts`, add HMAC verification before processing the webhook:

```typescript
import crypto from 'node:crypto';

// Add before handling the webhook body:
const signature = req.headers['x-transak-signature'] as string;
const payload = JSON.stringify(req.body);
const expected = crypto
  .createHmac('sha256', config.TRANSAK_WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  return reply.status(401).send({ error: 'Invalid webhook signature' });
}
```

### Step 5 — Register Transak Webhook

In Transak Dashboard > Webhooks:
1. URL: `https://your-domain.com/api/v1/kyc/webhook/transak`
2. Events: `ORDER_COMPLETED`, `ORDER_FAILED`

---

## Track E — Algorand Protocol SDKs (Execution Builders)

### Current State

Three builder files return mock strings instead of real transaction bytes:
- `haystack.builder.ts` — needs `@txnlab/deflex`
- `folks.builder.ts` — needs `@folks-finance/algorand-js-sdk`
- `tinyman.builder.ts` — needs `@tinymanorg/tinyman-js-sdk`

No API keys required — these are npm packages only.

### Step 1 — Install SDKs

```bash
cd apps/copilot-api
pnpm add algosdk @folks-finance/algorand-js-sdk @tinymanorg/tinyman-js-sdk @txnlab/deflex
```

> Verify package names before installing:
> - https://www.npmjs.com/package/@folks-finance/algorand-js-sdk
> - https://www.npmjs.com/package/@tinymanorg/tinyman-js-sdk
> - https://www.npmjs.com/package/@txnlab/deflex (may be under a different name)

### Step 2 — Implement Folks Finance Builder

Replace `apps/copilot-api/src/modules/execution/builders/folks.builder.ts`:

```typescript
import { FolksLend } from '@folks-finance/algorand-js-sdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders:folks');

export async function buildLendDepositTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): Promise<Uint8Array[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns = await FolksLend.prepareDepositTransactions({
    assetId: params.assetId,
    amount: BigInt(params.amountMicro),
    marketAppId: Number(params.marketId),
    sender: params.sender,
    suggestedParams,
  });
  logger.info({ assetId: params.assetId, amount: params.amountMicro }, 'Folks deposit txns built');
  return txns;
}

export async function buildLendWithdrawTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): Promise<Uint8Array[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns = await FolksLend.prepareWithdrawTransactions({
    assetId: params.assetId,
    amount: BigInt(params.amountMicro),
    marketAppId: Number(params.marketId),
    sender: params.sender,
    suggestedParams,
  });
  logger.info({ assetId: params.assetId }, 'Folks withdraw txns built');
  return txns;
}
```

> Verify exact SDK API at: https://github.com/folks-finance/folks-finance-js-sdk

### Step 3 — Implement Tinyman Builder

Replace `apps/copilot-api/src/modules/execution/builders/tinyman.builder.ts`:

```typescript
import { TinymanMainnetPoolClient } from '@tinymanorg/tinyman-js-sdk';
import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders:tinyman');

export async function buildLpAddTxns(params: {
  asset1Id: number;
  asset2Id: number;
  asset1AmountMicro: string;
  asset2AmountMicro: string;
  sender: string;
  slippagePct: number;
}): Promise<Uint8Array[]> {
  const poolClient = await TinymanMainnetPoolClient.init({
    client: algodClient,
    asset1: { id: params.asset1Id },
    asset2: { id: params.asset2Id },
  });
  const txGroup = await poolClient.prepareAddLiquidityTransactions({
    initiatorAddr: params.sender,
    asset1In: BigInt(params.asset1AmountMicro),
    asset2In: BigInt(params.asset2AmountMicro),
    slippage: params.slippagePct / 100,
  });
  logger.info({ asset1: params.asset1Id, asset2: params.asset2Id }, 'Tinyman LP add txns built');
  return txGroup.transactions.map((t) => algosdk.encodeUnsignedTransaction(t));
}
```

> Verify exact SDK API at: https://github.com/tinymanorg/tinyman-js-sdk

### Step 4 — Implement Haystack (deflex) Builder

Replace `apps/copilot-api/src/modules/execution/builders/haystack.builder.ts`:

```typescript
import Deflex from '@txnlab/deflex';
import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders:haystack');

export async function buildSwapTxns(params: {
  fromAssetId: number;
  toAssetId: number;
  fromAmountMicro: string;
  sender: string;
  slippagePct: number;
}): Promise<Uint8Array[]> {
  const quote = await Deflex.getSwapQuote({
    client: algodClient,
    assetInID: params.fromAssetId,
    assetOutID: params.toAssetId,
    amount: BigInt(params.fromAmountMicro),
    isFixedInput: true,
    slippage: params.slippagePct / 100,
  });
  const txGroup = await Deflex.prepareSwapTransactions({
    client: algodClient,
    quote,
    initiatorAddr: params.sender,
  });
  logger.info(
    { from: params.fromAssetId, to: params.toAssetId },
    'Haystack swap txns built',
  );
  return txGroup.transactions.map((t) => algosdk.encodeUnsignedTransaction(t));
}
```

> Verify at: https://github.com/tinymanorg/deflex or https://docs.tinymanprotocol.com/deflex

### Step 5 — Update Return Types

After implementing real builders, update the return type throughout the execution pipeline
from `string[]` (mock IDs) to `Uint8Array[]` (unsigned transaction bytes).
This affects `poa.builder.ts`, `execution.service.ts`, and `simulation.gate.ts`.

---

## Track F — Turnkey Transaction Signing

### Current State

`turnkey.service.ts` provisions wallets. The `Turnkey` client is already instantiated.
`execution.service.ts` writes `mock-txn-{uuid}` instead of real signed transactions.
No new environment variables needed — uses existing `TURNKEY_*` vars.

### Step 1 — Add signTransactions to turnkey.service.ts

Add this function to `apps/copilot-api/src/modules/identity/turnkey.service.ts`:

```typescript
export async function signTransactions(
  subOrgId: string,
  walletId: string,
  unsignedTxns: Uint8Array[],
): Promise<Uint8Array[]> {
  try {
    const subOrgClient = turnkey.apiClient().withOrganizationId(subOrgId);
    const signedTxns: Uint8Array[] = [];

    for (const unsignedTxnBytes of unsignedTxns) {
      const txnBase64 = Buffer.from(unsignedTxnBytes).toString('base64');

      const result = await subOrgClient.signRawPayload({
        organizationId: subOrgId,
        signWith: walletId,
        payload: txnBase64,
        encoding: 'PAYLOAD_ENCODING_BASE64',
        hashFunction: 'HASH_FUNCTION_NOT_APPLICABLE',
      });

      const decoded = algosdk.decodeUnsignedTransaction(unsignedTxnBytes);
      const signatureBytes = Buffer.from(result.r + result.s, 'hex');
      const signedTxn = decoded.attachSignature(
        decoded.from.publicKey,
        new Uint8Array(signatureBytes),
      );
      signedTxns.push(algosdk.encodeSignedTransaction(signedTxn));
    }

    logger.info({ subOrgId, txCount: signedTxns.length }, 'Transactions signed via Turnkey');
    return signedTxns;
  } catch (err) {
    logger.error({ err, subOrgId }, 'Turnkey signing failed');
    throw new AppError('Transaction signing failed', 500, 'SIGNING_FAILED');
  }
}
```

> Verify `signRawPayload` parameters for Ed25519/Algorand at:
> https://docs.turnkey.com/api-reference/activities/sign-raw-payload

### Step 2 — Add broadcastTransactions to algorand.ts

Add to `apps/copilot-api/src/lib/algorand.ts`:

```typescript
export async function broadcastTransactions(signedTxns: Uint8Array[]): Promise<string> {
  const result = await algodClient.sendRawTransaction(signedTxns).do();
  return result.txId;
}

export async function waitForConfirmation(txId: string, maxRounds = 5): Promise<unknown> {
  return algosdk.waitForConfirmation(algodClient, txId, maxRounds);
}
```

### Step 3 — Implement Real Simulation Gate

Replace the stub in `apps/copilot-api/src/modules/execution/simulation.gate.ts`:

```typescript
import { algodClient } from '../../lib/algorand.js';
import algosdk from 'algosdk';

export async function simulateTransactions(
  unsignedTxns: Uint8Array[],
): Promise<{ passed: boolean; reason?: string }> {
  try {
    const request = new algosdk.modelsv2.SimulateRequest({
      txnGroups: [
        new algosdk.modelsv2.SimulateRequestTransactionGroup({
          txns: unsignedTxns.map((t) => algosdk.decodeUnsignedTransaction(t)),
        }),
      ],
      allowEmptySignatures: true,
      allowMoreLogging: false,
    });

    const result = await algodClient.simulateTransactions(request).do();
    const failed = result.txnGroups[0]?.failureMessage;
    if (failed) return { passed: false, reason: failed };
    return { passed: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { passed: false, reason: `Simulation error: ${msg}` };
  }
}
```

### Step 4 — Wire into execution.service.ts

Replace the mock block in `submitExecution()`:

```typescript
import { signTransactions } from '../identity/turnkey.service.js';
import { broadcastTransactions, waitForConfirmation } from '../../lib/algorand.js';

// Get user wallet credentials
const wallet = await prisma.walletProvisionRecord.findUnique({
  where: { userId },
  select: { turnkeySubOrgId: true, turnkeyWalletId: true },
});

// Build real unsigned txns from POA (Track E)
const unsignedTxns = await buildTransactionsFromPOA(execution.planOfAction);

// Simulate
const { passed, reason } = await simulateTransactions(unsignedTxns);
if (!passed) throw new AppError(`Simulation failed: ${reason}`, 400, 'SIMULATION_FAILED');

// Sign via Turnkey
const signedTxns = await signTransactions(
  wallet.turnkeySubOrgId,
  wallet.turnkeyWalletId,
  unsignedTxns,
);

// Broadcast
const txId = await broadcastTransactions(signedTxns);
await waitForConfirmation(txId, 5);

// Update DB with real transaction ID
await prisma.executionRecord.update({
  where: { id: executionId },
  data: { status: 'CONFIRMED', algorandTxId: txId, confirmedAt: new Date() },
});
```

---

## Track G — Gora Oracle (P2)

### Current State

`gora-oracle.adapter.ts` always returns `null`. Required only at execution time for price
verification. Not blocking for analytics (Engines 1-5).

### Step 1 — Confirm Gora Feed App IDs

Contact Gora team for confirmed mainnet feed app IDs:
- Discord: https://discord.gg/gora
- GitHub: https://github.com/GoraNetwork
- Docs: https://docs.gora.io

You need the on-chain Algorand app ID for each price feed (ALGO/USD, USDC/USD, gALGO/USD, etc.)

### Step 2 — Configure Environment

```env
GORA_ORACLE_APP_ID=<primary-gora-app-id>
GORA_ORACLE_ENABLED=true
```

### Step 3 — Implement Gora Adapter

Replace `apps/copilot-api/src/modules/knowledge/adapters/gora-oracle.adapter.ts`:

```typescript
import { algodClient } from '../../../lib/algorand.js';
import { config } from '../../../config/env.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('knowledge:gora');

// Map ASA IDs to Gora feed app IDs — update with confirmed values from Gora team
const GORA_FEED_APP_IDS: Record<number, number> = {
  0: Number(config.GORA_ORACLE_APP_ID),  // ALGO/USD
  31566704: 0,                            // USDC/USD — update with real app ID
  793124631: 0,                           // gALGO/USD — update with real app ID
};

export const GoraOracleAdapter = {
  async getPrice(
    assetId: number,
  ): Promise<{ priceUsd: string; confidence: string; timestamp: number } | null> {
    if (!config.GORA_ORACLE_ENABLED) return null;

    const appId = GORA_FEED_APP_IDS[assetId];
    if (!appId) {
      logger.warn({ assetId }, 'No Gora feed app ID configured for this asset');
      return null;
    }

    try {
      const appInfo = await algodClient.getApplicationByID(appId).do();
      const globalState = appInfo.params?.globalState ?? [];

      const priceEntry = globalState.find(
        (s: { key: string }) => Buffer.from(s.key, 'base64').toString() === 'price',
      );
      if (!priceEntry) return null;

      // Gora price is in 6-decimal microUSD — verify encoding with Gora docs
      const rawPrice = BigInt(Buffer.from(priceEntry.value.bytes, 'base64').readBigUInt64BE());
      const priceUsd = (Number(rawPrice) / 1_000_000).toFixed(6);
      const timestamp = Math.floor(Date.now() / 1000);

      logger.debug({ assetId, priceUsd }, 'Gora price fetched');
      return { priceUsd, confidence: '0.99', timestamp };
    } catch (err) {
      logger.warn({ err, assetId }, 'Gora price fetch failed — falling back to CoinGecko');
      return null;
    }
  },

  async getPrices(
    assetIds: number[],
  ): Promise<Record<number, { priceUsd: string; confidence: string; timestamp: number } | null>> {
    const results: Record<number, { priceUsd: string; confidence: string; timestamp: number } | null> = {};
    await Promise.all(assetIds.map(async (id) => { results[id] = await GoraOracleAdapter.getPrice(id); }));
    return results;
  },

  isAvailable(): boolean {
    return config.GORA_ORACLE_ENABLED;
  },
};
```

> Note: The ABI encoding format (key names, byte encoding) must be verified from Gora docs before deploying to production.

---

## Environment Variables — Complete Reference

```env
# Track A — LLM (no code changes needed)
OPENAI_API_KEY=sk-proj-...
GOOGLE_AI_API_KEY=AIza...

# Track B — Veriff KYC (no code changes needed)
VERIFF_API_KEY=...
VERIFF_API_SECRET=...
VERIFF_API_URL=https://stationapi.veriff.com/v1
VERIFF_WEBHOOK_SECRET=...

# Track C — GoPlausible DID/VC + x402 (requires route wiring fix)
GOPLAUSIBLE_API_URL=https://api.goplausible.com
GOPLAUSIBLE_API_KEY=...
GOPLAUSIBLE_FACILITATOR_ADDRESS=...
X402_ENABLED=true

# Track D — Transak (requires code change in kyc.service.ts + webhook verification)
TRANSAK_API_KEY=...
TRANSAK_API_SECRET=...
TRANSAK_WEBHOOK_SECRET=...

# Tracks E + F — No new env vars needed (use existing ALGORAND_* and TURNKEY_*)

# Track G — Gora Oracle (requires adapter implementation)
GORA_ORACLE_APP_ID=...
GORA_ORACLE_ENABLED=true
```

---

## Recommended Implementation Order

```
Week 1
  Day 1:   Track A (LLM keys — 1 hour, immediate Copilot demo value)
  Day 2-3: Track B (Veriff account setup + webhook testing)

Week 2
  Day 1-2: Track C (GoPlausible + x402 route wiring fix)
  Day 3-5: Track E (Install Algorand SDKs + implement all 3 builders)

Week 3
  Day 1-2: Track F (Turnkey signing + simulation gate + broadcast)
  Day 3-4: Track D (Transak widget URL + webhook verification)

Week 4 (P2)
  Track G (Gora Oracle — gated on receiving confirmed app IDs from Gora team)
```

---

## Testing Each Integration

| Integration | Test Endpoint | Expected Result |
|-------------|--------------|-----------------|
| OpenAI / Gemini | `POST /api/v1/copilot/query` | Real AI response |
| Veriff | `POST /api/v1/kyc/initiate` | Real Veriff session URL |
| GoPlausible | After KYC approval | `user.didId` populated in DB |
| x402 | `POST /api/v1/execute/plan` without payment header | HTTP 402 returned |
| Transak | `POST /api/v1/kyc/on-ramp` | Real Transak checkout URL with API key |
| Folks SDK | `POST /api/v1/execute/submit` | Real unsigned txn bytes in DB (not mock-txn-uuid) |
| Turnkey signing | Same | Real Algorand txId written to `executionRecord.algorandTxId` |
| Gora Oracle | `GET /api/v1/portfolio/overview` with `GORA_ORACLE_ENABLED=true` | `goraPrice` populated in price data |

---

## Important Notes

1. All integrations use the stub-when-unconfigured pattern. Enable them one at a time without risk.
2. Never commit `.env.local` to git. The `.gitignore` already excludes it.
3. Use staging/sandbox for all integrations during development.
4. Track F (Turnkey signing) depends on Track E (real builder outputs). Do not attempt Track F
   until at least one builder produces real `Uint8Array` outputs.
5. The Veriff + GoPlausible flow is sequential: Veriff approval fires the GoPlausible DID/VC issuance automatically via the existing `kyc.service.ts` event chain. No additional wiring needed.
