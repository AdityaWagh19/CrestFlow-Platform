# Plan 10 — P1 KYC & Identity

**Status:** Approved
**Priority:** P1 (required before production execution goes live)
**Depends on:**
- Plan 01 (Auth — `User` table has `kycStatus`, `didId`, `vcId` fields reserved)
- Plan 08 (Engine 6 — Policy Engine reads `kycStatus` before execution)

**Integration partners:**
- **Veriff** — document verification + liveness check + AML screening
- **GoPlausible** — Algorand-native DID generation + KYC Verifiable Credential issuance
- **UPI on-ramp** — INR → USDC/ALGO fiat entry (India-first)
- **UPI off-ramp** — USDC/ALGO → INR fiat exit (India-first, same provider as on-ramp)

---

## Objective

Before a user can execute any on-chain transactions (Engine 6), they must complete KYC. This plan covers:

1. **KYC Verification** via Veriff (document + selfie liveness + AML check)
2. **Decentralised Identity** — GoPlausible DID creation (Algorand-native) + KYC Verifiable Credential (VC) issuance post-approval
3. **UPI On-ramp** — INR fiat → USDC/ALGO funding flow via UPI payment rail
4. **UPI Off-ramp** — USDC/ALGO → INR fiat exit via UPI payment rail (same provider, reverse direction)
5. **KYC Gate in Engine 6** — Block execution if `kycStatus !== 'APPROVED'`

The `kycStatus`, `didId`, and `vcId` fields already exist on the `User` model (Plan 01). This plan implements the workflow that populates them.

---

## Architecture

```
[User triggers KYC]
       │
       ▼
[POST /kyc/initiate]
  → Create KYCApplication record (PENDING)
  → Call Veriff API: create session → get sessionUrl + sessionToken
  → Return sessionUrl to frontend (opens Veriff iframe/SDK)
       │
       ▼
[Veriff SDK — user captures document + selfie]
  → Veriff processes: document OCR + liveness check + AML screening
  → Veriff webhook → POST /kyc/webhook
       │
       ▼
[Webhook Handler]
  → Verify Veriff webhook signature (HMAC-SHA256)
  → If APPROVED:
      - Update User.kycStatus = APPROVED
      - Update KYCApplication.status = APPROVED
      - Trigger GoPlausible DID creation
      - Trigger GoPlausible VC issuance
  → If DECLINED / RESUBMISSION_REQUESTED:
      - Update statuses
      - Emit KYCStatusChanged event
       │
       ▼
[GoPlausible DID Creation]
  → Call GoPlausible API: create DID anchored to user's Algorand address
  → Store DID in User.didId
       │
       ▼
[GoPlausible VC Issuance]
  → Call GoPlausible API: issue KYC VC (claims: kyc_verified=true, country, tier)
  → Store VC ID in User.vcId
  → chain: Algorand wallet → DID → KYC VC established
```

---

## Database Schema

```prisma
model KYCApplication {
  id                String        @id @default(uuid()) @db.Uuid
  userId            String        @db.Uuid
  status            KYCStatus
  provider          String        @default("veriff")   // 'veriff'
  providerSessionId String?       @unique               // Veriff sessionId
  providerDecision  String?       // 'approved' | 'declined' | 'resubmission_requested'
  providerReason    String?       // decline reason from Veriff
  attemptNumber     Int           @default(1)           // allows retry after decline
  submittedAt       DateTime?
  decidedAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  user              User          @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([providerSessionId])
  @@map("kyc_applications")
}

model IdentityRecord {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @db.Uuid @unique
  did             String    @unique               // GoPlausible DID e.g. did:algo:mainnet:ABCD...
  vcId            String?   @unique               // GoPlausible VC identifier
  vcJwt           String?                         // full VC JWT (stored encrypted)
  kycTier         KYCTier   @default(TIER_1)
  country         String?                         // ISO 3166-1 alpha-2
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User      @relation(fields: [userId], references: [id])

  @@map("identity_records")
}

model OnRampTransaction {
  id              String          @id @default(uuid()) @db.Uuid
  userId          String          @db.Uuid
  status          OnRampStatus
  provider        String          @default("upi")
  fiatAmountInr   String          // DECIMAL — amount in INR
  cryptoAmount    String?         // DECIMAL — USDC or ALGO received
  cryptoAsset     String?         // 'USDC' | 'ALGO'
  exchangeRate    String?         // DECIMAL — rate at time of transaction
  providerTxId    String?         // UPI/provider transaction reference
  algorandTxId    String?         // on-chain delivery txID
  initiatedAt     DateTime        @default(now())
  completedAt     DateTime?
  failureReason   String?

  user            User            @relation(fields: [userId], references: [id])

  @@index([userId, initiatedAt(sort: Desc)])
  @@map("onramp_transactions")
}

enum KYCStatus {
  PENDING
  SUBMITTED
  APPROVED
  DECLINED
  RESUBMISSION_REQUESTED
  EXPIRED
}

enum KYCTier {
  TIER_1   // basic identity: $1,000/day execution limit
  TIER_2   // enhanced: $10,000/day execution limit
  TIER_3   // institutional: unlimited (manual review required)
}

enum OnRampStatus {
  INITIATED
  PAYMENT_RECEIVED
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}
```

---

## KYC Service

**File:** `kyc/kyc.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { VeriffClient } from './veriff.client';
import { GoPlausibleClient } from './goplausible.client';
import { logger } from '../utils/logger';

export class KYCService {
  constructor(
    private prisma: PrismaClient,
    private veriff: VeriffClient,
    private goPlausible: GoPlausibleClient,
  ) {}

  /**
   * Initiate KYC session via Veriff.
   * Creates KYCApplication (PENDING) + returns sessionUrl for frontend SDK.
   */
  async initiateKYC(userId: string): Promise<{ sessionUrl: string; sessionId: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, kycStatus: true },
    });

    if (user.kycStatus === 'APPROVED') {
      throw new Error('KYC already approved for this user');
    }

    // Get attempt number
    const priorAttempts = await this.prisma.kYCApplication.count({ where: { userId } });

    // Create Veriff session
    const veriffSession = await this.veriff.createSession({
      person: { fullName: user.name ?? '', email: user.email },
      vendorData: userId, // returned in webhook — links session to userId
    });

    await this.prisma.kYCApplication.create({
      data: {
        userId,
        status: 'PENDING',
        provider: 'veriff',
        providerSessionId: veriffSession.sessionId,
        attemptNumber: priorAttempts + 1,
      },
    });

    logger.info({ module: 'kyc', event: 'session_created', userId, sessionId: veriffSession.sessionId });
    return { sessionUrl: veriffSession.url, sessionId: veriffSession.sessionId };
  }

  /**
   * Handle Veriff webhook — called by webhook handler after signature verification.
   * Updates KYC status and triggers DID/VC issuance on approval.
   */
  async handleVeriffWebhook(payload: VeriffWebhookPayload): Promise<void> {
    const { sessionId, decision, vendorData: userId } = payload;

    const application = await this.prisma.kYCApplication.findFirst({
      where: { providerSessionId: sessionId },
    });

    if (!application) {
      logger.warn({ module: 'kyc', event: 'webhook_unknown_session', sessionId });
      return;
    }

    const kycStatus = mapVeriffDecisionToStatus(decision);

    await this.prisma.$transaction(async tx => {
      // Update application
      await tx.kYCApplication.update({
        where: { id: application.id },
        data: {
          status: kycStatus,
          providerDecision: decision,
          decidedAt: new Date(),
        },
      });

      // Update User.kycStatus
      await tx.user.update({
        where: { id: userId },
        data: { kycStatus },
      });
    });

    logger.info({ module: 'kyc', event: 'webhook_processed', userId, decision, kycStatus });

    if (kycStatus === 'APPROVED') {
      await this.issueIdentity(userId);
    }
  }

  /**
   * Issue GoPlausible DID + KYC VC after Veriff approval.
   * Chains: Algorand wallet → DID → KYC VC
   */
  private async issueIdentity(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { algorandAddress: true },
    });

    if (!user.algorandAddress) {
      logger.error({ module: 'kyc', event: 'missing_algorand_address', userId });
      return;
    }

    try {
      // Step 1: Create DID anchored to Algorand wallet
      const did = await this.goPlausible.createDID({
        algorandAddress: user.algorandAddress,
        method: 'did:algo:mainnet',
      });

      // Step 2: Issue KYC Verifiable Credential
      const vc = await this.goPlausible.issueKYCCredential({
        did: did.id,
        claims: { kycVerified: true, provider: 'veriff', tier: 'TIER_1' },
      });

      // Step 3: Store DID + VC
      await this.prisma.$transaction(async tx => {
        await tx.user.update({
          where: { id: userId },
          data: { didId: did.id, vcId: vc.id },
        });

        await tx.identityRecord.create({
          data: {
            userId,
            did: did.id,
            vcId: vc.id,
            vcJwt: vc.jwt,
            kycTier: 'TIER_1',
          },
        });
      });

      logger.info({ module: 'kyc', event: 'identity_issued', userId, did: did.id, vcId: vc.id });
    } catch (err: any) {
      logger.error({ module: 'kyc', event: 'identity_issuance_failed', userId, error: err?.message });
      // DID/VC failure does NOT undo KYC approval — identity can be re-issued
    }
  }
}

function mapVeriffDecisionToStatus(decision: string): KYCStatus {
  const map: Record<string, KYCStatus> = {
    'approved':                  'APPROVED',
    'declined':                  'DECLINED',
    'resubmission_requested':    'RESUBMISSION_REQUESTED',
    'expired':                   'EXPIRED',
  };
  return map[decision] ?? 'PENDING';
}
```

---

## Veriff Client

**File:** `kyc/veriff.client.ts`

```typescript
import crypto from 'crypto';

const VERIFF_API_URL   = 'https://stationapi.veriff.com/v1';
const VERIFF_API_KEY   = process.env.VERIFF_API_KEY!;
const VERIFF_SECRET    = process.env.VERIFF_SECRET_KEY!;

export class VeriffClient {
  /**
   * Create a Veriff verification session.
   * Returns sessionUrl (for frontend SDK) and sessionId.
   */
  async createSession(params: {
    person: { fullName: string; email: string };
    vendorData: string; // userId — returned verbatim in webhook
  }): Promise<{ url: string; sessionId: string }> {
    const body = {
      verification: {
        callback: process.env.VERIFF_CALLBACK_URL,
        person: { fullName: params.person.fullName },
        vendorData: params.vendorData,
        timestamp: new Date().toISOString(),
      },
    };

    const response = await fetch(`${VERIFF_API_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': VERIFF_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return { url: data.verification.url, sessionId: data.verification.id };
  }

  /**
   * Verify HMAC-SHA256 signature on incoming Veriff webhook.
   * Must verify before processing any webhook payload.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', VERIFF_SECRET)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature.toLowerCase(), 'hex'),
    );
  }
}
```

---

## GoPlausible Client

**File:** `kyc/goplausible.client.ts`

```typescript
const GOPLAUSIBLE_API_URL = process.env.GOPLAUSIBLE_API_URL ?? 'https://api.goplausible.xyz';
const GOPLAUSIBLE_API_KEY = process.env.GOPLAUSIBLE_API_KEY!;

export class GoPlausibleClient {
  private headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GOPLAUSIBLE_API_KEY}`,
    };
  }

  /**
   * Create a DID anchored to an Algorand wallet address.
   * Returns did:algo:mainnet:{address} format DID.
   */
  async createDID(params: { algorandAddress: string; method: string }): Promise<{ id: string }> {
    const response = await fetch(`${GOPLAUSIBLE_API_URL}/did/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        address: params.algorandAddress,
        network: 'mainnet',
      }),
    });
    if (!response.ok) throw new Error(`GoPlausible DID creation failed: ${response.status}`);
    return response.json();
  }

  /**
   * Issue a KYC Verifiable Credential for an existing DID.
   * Claims include: kycVerified, provider, tier.
   */
  async issueKYCCredential(params: {
    did:    string;
    claims: Record<string, unknown>;
  }): Promise<{ id: string; jwt: string }> {
    const response = await fetch(`${GOPLAUSIBLE_API_URL}/vc/issue`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        subject: params.did,
        type: ['VerifiableCredential', 'KYCCredential'],
        claims: params.claims,
      }),
    });
    if (!response.ok) throw new Error(`GoPlausible VC issuance failed: ${response.status}`);
    return response.json();
  }
}
```

---

## UPI On-Ramp Service

**File:** `kyc/onramp.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export class OnRampService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initiate a UPI on-ramp transaction.
   * Provider: Transak / Ramp Network / local UPI aggregator — configurable via env.
   *
   * Flow:
   * 1. Create OnRampTransaction (INITIATED)
   * 2. Call provider API → get payment URL
   * 3. Frontend redirects user to payment URL
   * 4. Provider webhook → confirms payment → delivers USDC/ALGO to user's Algorand address
   *
   * KYC must be APPROVED before on-ramp is allowed.
   */
  async initiateOnRamp(params: {
    userId:       string;
    fiatAmountInr: number;
    targetAsset:  'USDC' | 'ALGO';
  }): Promise<{ paymentUrl: string; transactionId: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { kycStatus: true, algorandAddress: true },
    });

    if (user.kycStatus !== 'APPROVED') {
      throw new Error('KYC approval required before using the on-ramp');
    }

    const tx = await this.prisma.onRampTransaction.create({
      data: {
        userId: params.userId,
        status: 'INITIATED',
        provider: process.env.ONRAMP_PROVIDER ?? 'transak',
        fiatAmountInr: params.fiatAmountInr.toString(),
        cryptoAsset: params.targetAsset,
      },
    });

    // Call provider API (Transak / Ramp Network — configurable)
    const provider = await buildProviderClient();
    const { paymentUrl } = await provider.createOrder({
      fiatAmount: params.fiatAmountInr,
      fiatCurrency: 'INR',
      cryptoCurrency: params.targetAsset,
      walletAddress: user.algorandAddress!,
      network: 'algorand',
      partnerOrderId: tx.id,
    });

    logger.info({ module: 'onramp', event: 'initiated', userId: params.userId, txId: tx.id, fiatAmountInr: params.fiatAmountInr });
    return { paymentUrl, transactionId: tx.id };
  }

  /**
   * Handle on-ramp provider webhook.
   * Updates OnRampTransaction status and records on-chain delivery txID.
   */
  async handleWebhook(payload: OnRampWebhookPayload): Promise<void> {
    const tx = await this.prisma.onRampTransaction.findFirst({
      where: { id: payload.partnerOrderId },
    });

    if (!tx) {
      logger.warn({ module: 'onramp', event: 'unknown_order', partnerOrderId: payload.partnerOrderId });
      return;
    }

    await this.prisma.onRampTransaction.update({
      where: { id: tx.id },
      data: {
        status: payload.status === 'COMPLETED' ? 'COMPLETED' : payload.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
        cryptoAmount: payload.cryptoAmount?.toString(),
        exchangeRate: payload.exchangeRate?.toString(),
        providerTxId: payload.providerTxId,
        algorandTxId: payload.blockchainTxId,
        completedAt:  payload.status === 'COMPLETED' ? new Date() : undefined,
        failureReason: payload.failureReason,
      },
    });

    logger.info({ module: 'onramp', event: 'webhook_processed', txId: tx.id, status: payload.status });
  }
}
```

---

## KYC Gate in Engine 6 Policy Engine

**Addition to `execution/policy.engine.ts`:**

```typescript
// KYC gate — first check before any other policy rule
const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } });

if (user?.kycStatus !== 'APPROVED') {
  return {
    decision: 'BLOCKED',
    reason: 'KYC verification is required before executing transactions. Complete your identity verification in Settings.',
    blockedStep: null,
  };
}
```

**KYC tier — daily limit override:**
```typescript
// TIER_1: up to $1K/day (overrides goal profile limit if lower)
// TIER_2: up to $10K/day
// TIER_3: unlimited (manual approval per execution)
const identity = await prisma.identityRecord.findUnique({ where: { userId } });
const kycDailyLimit = { TIER_1: 1_000, TIER_2: 10_000, TIER_3: Infinity }[identity?.kycTier ?? 'TIER_1'];
const effectiveDailyLimit = Math.min(MAX_DAILY_USD[profile], kycDailyLimit);
```

---

## API Endpoints (9)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/kyc/initiate` | Start KYC session → returns Veriff sessionUrl |
| `GET`  | `/api/v1/kyc/status` | Get current KYC status + attempt history |
| `POST` | `/api/v1/kyc/webhook` | Veriff webhook receiver (HMAC-verified) |
| `GET`  | `/api/v1/identity/did` | Get user's GoPlausible DID |
| `GET`  | `/api/v1/identity/vc` | Get user's KYC Verifiable Credential (JWT) |
| `POST` | `/api/v1/onramp/initiate` | Start UPI on-ramp → returns Transak/Ramp payment URL |
| `POST` | `/api/v1/onramp/webhook` | On-ramp provider webhook receiver |
| `POST` | `/api/v1/offramp/initiate` | Start UPI off-ramp → returns off-ramp order details + destination address |
| `POST` | `/api/v1/offramp/webhook` | Off-ramp provider webhook receiver |

All KYC/Identity/Ramp endpoints are **free** (no x402 gate — KYC and fiat access are prerequisites, not premium features).

---

## New Environment Variables

```env
# Veriff
VERIFF_API_KEY=
VERIFF_SECRET_KEY=
VERIFF_CALLBACK_URL=https://app.crestflow.ai/kyc/callback

# GoPlausible
GOPLAUSIBLE_API_URL=https://api.goplausible.xyz
GOPLAUSIBLE_API_KEY=

# On-ramp + Off-ramp (same provider handles both directions)
RAMP_PROVIDER=transak                   # 'transak' | 'ramp'
TRANSAK_API_KEY=
TRANSAK_WEBHOOK_SECRET=
TRANSAK_ENVIRONMENT=PRODUCTION          # 'STAGING' | 'PRODUCTION'
```

---

## Events

```typescript
export const KYCEvents = {
  KYC_INITIATED:    'KYCInitiated',
  KYC_APPROVED:     'KYCApproved',
  KYC_DECLINED:     'KYCDeclined',
  IDENTITY_ISSUED:  'IdentityIssued',    // DID + VC created → audit listener
  ONRAMP_COMPLETED: 'OnRampCompleted',   // → Engine 1 portfolio rescan
  OFFRAMP_INITIATED: 'OffRampInitiated', // crypto sent to provider
  OFFRAMP_COMPLETED: 'OffRampCompleted', // INR paid to user's UPI ID
} as const;
```

---

## Testing Requirements

**`kyc.service.test.ts`**
- `initiateKYC` when already APPROVED → throws
- `initiateKYC` → KYCApplication created with status PENDING
- `handleVeriffWebhook` with 'approved' → User.kycStatus = APPROVED, DID + VC issued
- `handleVeriffWebhook` with 'declined' → User.kycStatus = DECLINED, no DID issued
- `handleVeriffWebhook` with unknown sessionId → logs warn, does not throw
- DID issuance failure → kycStatus remains APPROVED (isolated failure)

**`veriff.client.test.ts`**
- `verifyWebhookSignature`: valid HMAC → true
- `verifyWebhookSignature`: tampered payload → false
- Timing-safe comparison (no timing attacks)

**`onramp.service.test.ts`**
- `initiateOnRamp` with kycStatus !== 'APPROVED' → throws
- `initiateOnRamp` success → OnRampTransaction created with INITIATED status
- `handleWebhook` COMPLETED → status updated, algorandTxId stored
- `handleWebhook` FAILED → status = FAILED, failureReason stored

**`offramp.service.test.ts`**
- `initiateOffRamp` with kycStatus !== 'APPROVED' → throws
- `initiateOffRamp` with insufficient balance → throws (balance check against Engine 1 snapshot)
- `initiateOffRamp` success → OffRampTransaction created with INITIATED status, algorandTxId stored (crypto send)
- `handleWebhook` COMPLETED → status = COMPLETED, fiatAmountInr + providerTxId stored
- `handleWebhook` FAILED → status = FAILED + failureReason — note: crypto may already be sent (provider handles refund)
- Off-ramp minimum amount enforced ($10 USDC equivalent — below this Transak rejects)
- UPI ID stored hashed (SHA-256) — never plaintext

---

## Off-Ramp Flow Detail

```
[User triggers off-ramp: convert USDC to INR]
       │
       ▼
[POST /api/v1/offramp/initiate]
  → Validate KYC = APPROVED
  → Validate sufficient USDC balance (from latest PortfolioSnapshot)
  → Call Transak API: create off-ramp order
      └ Returns: provider Algorand address + expected fiat amount + exchange rate
  → Create OffRampTransaction (INITIATED)
  → Return: { providerAlgoAddress, cryptoAmount, estimatedInr, offRampId }
       │
       ▼
[Engine 6 Execution (or manual user action)]
  → Send USDC from user's Turnkey wallet to providerAlgoAddress
  → Store algorandTxId on OffRampTransaction → status: PAYMENT_RECEIVED
       │
       ▼
[Transak/Ramp processes crypto receipt]
  → Initiates UPI bank transfer to user's registered UPI ID
  → Sends webhook to POST /api/v1/offramp/webhook
       │
       ▼
[Webhook Handler]
  → Verify provider signature
  → Update OffRampTransaction: status = COMPLETED, fiatAmountInr, providerTxId
  → Emit OffRampCompleted event
  → Engine 1: trigger portfolio rescan (USDC balance reduced)
```

**Key difference from on-ramp:**
- On-ramp: provider receives INR → sends crypto to user's wallet
- Off-ramp: user sends crypto to provider's wallet → provider pays INR to user's UPI ID
- Off-ramp crypto send uses **Engine 6's execution pipeline** (Turnkey signing + Algorand broadcast)
- UPI ID is provided at initiation time — validated against Indian UPI format (`user@bank`)
- Minimum off-ramp: $10 USD equivalent (Transak minimum)
- Maximum off-ramp per day: governed by KYC tier (TIER_1: $1K, TIER_2: $10K)

