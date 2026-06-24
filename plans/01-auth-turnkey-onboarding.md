# Plan 01 — Auth + Turnkey Wallet (Onboarding)

**Status:** Draft — Awaiting approval  
**Priority:** P0  
**Depends on:** Plan 00 — Monorepo + Tooling Setup (must exist before this executes)  
**Feeds into:** Plan 03 — Financial Knowledge Layer (needs `algorandAddress`), Engine 1 (portfolio scan trigger)

---

## Objective

Implement the full user onboarding backend:
1. Google OAuth token verification and user creation
2. Turnkey sub-organization and embedded Algorand wallet provisioning (non-custodial)
3. JWT-based session issuance
4. Post-onboarding portfolio scan trigger (handoff event to Engine 1)

No frontend implementation. All frontend requirements for this module are documented in `project-context/frontend-context.md`.

---

## Architecture Decisions

### Google OAuth — Token-Based (Not Redirect-Based)
Since the frontend is a Vite/React SPA (not Next.js), Google OAuth uses the **implicit / token-based** flow:
- Frontend uses `@react-oauth/google` or the Google Identity Services (`gis`) library to get an `id_token` from Google
- Frontend sends `id_token` to `POST /api/v1/auth/google`
- Backend verifies it using `google-auth-library` (`OAuth2Client.verifyIdToken`)
- Backend creates/finds user, provisions wallet (if new), returns a signed JWT

This approach keeps auth fully on the backend and avoids any redirect-based coupling to the frontend framework.

### No Email/Password
Only Google OAuth is supported. Email/password auth is not in scope and must not be added.

### Database — PostgreSQL + Prisma
- PostgreSQL running locally via Docker Compose
- Prisma ORM for schema management, migrations, and type-safe client
- Singleton Prisma client in `packages/shared/src/db.ts` to prevent connection exhaustion

### Turnkey — One Sub-Org Per User
- CrestFlow parent organization in Turnkey = root admin account
- Every CrestFlow user gets their own **Turnkey Sub-Organization** (fully isolated key vault)
- Wallet + Algorand account created atomically with the sub-org in a single API call
- `turnkeyApiPrivateKey` is NEVER in any `NEXT_PUBLIC_` or client-accessible env var
- Signing uses `signRawPayload` (addressed in Engine 6 plan — not here)

### Session — JWT (Stateless)
- Backend signs a JWT containing `{ sub: userId, email, algorandAddress }`
- JWT verified in `authenticate` middleware on all protected routes
- Token expiry: 7 days (configurable via `JWT_EXPIRY`)
- No refresh token in MVP — user re-auths via Google when expired

---

## Domain: Identity

This plan implements the **Identity domain** defined in `instructions.md`:

> Owns: Auth, wallets, KYC status, DID, VCs

Only the auth + wallet portion is implemented here. KYC/DID/VC is a separate P1 plan.

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                  String    @id @default(uuid()) @db.Uuid
  email               String    @unique
  name                String?
  googleId            String?   @unique

  // Turnkey
  turnkeySubOrgId     String?   @unique
  walletId            String?   @unique   // Turnkey wallet ID — used for signing (Engine 6)
  algorandAddress     String?   @unique   // Algorand base32 address — used for Indexer queries

  // KYC — managed separately (P1 plan)
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

**Schema rules (from `architecture.md`):**
- `id` uses UUID, not auto-increment
- `createdAt` / `updatedAt` are UTC timestamps
- No floating point monetary values stored here
- `walletId` and `algorandAddress` are stored as strings — never floats or numeric IDs

---

## Module File Structure

This module lives inside `apps/copilot-api`. Its domain folder is `src/modules/identity/`.

```
apps/copilot-api/
├── src/
│   ├── modules/
│   │   └── identity/
│   │       ├── auth.controller.ts      ← thin route handlers, no business logic
│   │       ├── auth.routes.ts          ← Express router for /api/v1/auth/*
│   │       ├── auth.service.ts         ← orchestrates Google verify + user create + wallet provision
│   │       ├── turnkey.service.ts      ← wraps @turnkey/sdk-server
│   │       └── google-auth.service.ts  ← wraps google-auth-library
│   ├── middleware/
│   │   └── authenticate.ts             ← JWT verification middleware
│   ├── lib/
│   │   └── jwt.ts                      ← sign + verify JWT helpers
│   └── events/
│       └── identity.events.ts          ← UserOnboarded, WalletConnected, PortfolioScanTriggered
├── .env.example
└── docker-compose.yml                  ← PostgreSQL local dev setup
```

---

## API Endpoints

All endpoints use the standard response envelope from `instructions.md`.

### POST /api/v1/auth/google

**Purpose:** Verify Google `id_token`, create or find user, provision Turnkey wallet for new users, return JWT.

**Auth:** None (public endpoint)

**Request:**
```json
{
  "idToken": "google_id_token_string"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Aditya Wagh",
      "algorandAddress": "ALGO...",
      "kycStatus": "PENDING",
      "isNewUser": true
    }
  },
  "meta": {
    "timestamp": "2026-06-24T08:00:00Z",
    "requestId": "uuid",
    "version": "1.0"
  }
}
```

**Error Responses:**
- `400` — `INVALID_TOKEN` — idToken missing or malformed
- `401` — `GOOGLE_AUTH_FAILED` — Google verification rejected the token
- `500` — `WALLET_PROVISION_FAILED` — Turnkey sub-org or wallet creation failed (user NOT created — atomic)
- `500` — `INTERNAL_ERROR` — generic fallback

**Business Logic (in `auth.service.ts`):**
```
1. Receive idToken
2. GoogleAuthService.verifyIdToken(idToken) → { googleId, email, name }
3. prisma.user.findUnique({ where: { googleId } })
4. If user exists:
     → isNewUser = false
     → skip to step 8
5. If user does not exist:
     → TurnkeyService.createSubOrgWithWallet({ email, name })
        → returns { subOrgId, walletId, algorandAddress }
     → prisma.user.create({
         email, name, googleId,
         turnkeySubOrgId: subOrgId,
         walletId,
         algorandAddress
       })
     → isNewUser = true
     → emit UserOnboarded event
     → emit WalletConnected event
     → emit PortfolioScanTriggered event (Engine 1 handoff)
6. jwt.sign({ sub: user.id, email, algorandAddress }) → accessToken
7. Return { accessToken, user, isNewUser }
```

**Atomicity rule:** If Turnkey wallet creation succeeds but DB write fails, we have an orphan sub-org in Turnkey. To handle this: wrap step 5 in a try/catch — if DB write throws, log the Turnkey sub-org ID for manual reconciliation. In MVP, this is acceptable. Full idempotency (check if sub-org already exists before creating) is a P2 hardening task.

---

### GET /api/v1/auth/me

**Purpose:** Returns the authenticated user's profile and wallet information.

**Auth:** Required — `authenticate` middleware (JWT)

**Request:** No body. JWT passed in `Authorization: Bearer <token>` header.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Aditya Wagh",
    "algorandAddress": "ALGO...",
    "kycStatus": "PENDING"
  },
  "meta": { "timestamp": "...", "requestId": "...", "version": "1.0" }
}
```

**Error Responses:**
- `401` — `UNAUTHORIZED` — missing or invalid JWT
- `404` — `USER_NOT_FOUND` — JWT valid but user deleted from DB

---

### POST /api/v1/auth/trigger-portfolio-scan *(internal)*

**Purpose:** Manually re-trigger portfolio scan for a user (used for testing and future retry flows). In normal operation, the scan is triggered automatically by the `PortfolioScanTriggered` event emitted at the end of `POST /api/v1/auth/google`.

**Auth:** Required — `authenticate` middleware

**Success Response (202):**
```json
{
  "success": true,
  "data": { "message": "Portfolio scan triggered" },
  "meta": { ... }
}
```

---

## Service Implementations

### `google-auth.service.ts`

```typescript
// Uses: google-auth-library
// Package: google-auth-library

import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GooglePayload {
  googleId: string;
  email: string;
  name: string | null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) {
    throw new Error('GOOGLE_AUTH_FAILED');
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
  };
}
```

---

### `turnkey.service.ts`

```typescript
// Uses: @turnkey/sdk-server
// Package: @turnkey/sdk-server

import { Turnkey } from '@turnkey/sdk-server';

const turnkey = new Turnkey({
  apiBaseUrl: process.env.TURNKEY_API_BASE_URL!,
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
  defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
});

export interface TurnkeyWalletResult {
  subOrgId: string;
  walletId: string;
  algorandAddress: string;
}

export async function createSubOrgWithWallet(
  userEmail: string,
  userName: string | null
): Promise<TurnkeyWalletResult> {
  const client = turnkey.apiClient();

  const result = await client.createSubOrganization({
    organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    parameters: {
      subOrganizationName: `crestflow-user-${userEmail}`,
      rootUsers: [{
        userName: userName ?? userEmail,
        userEmail: userEmail,
        apiKeys: [],
        authenticators: [],
        oauthProviders: [],
      }],
      rootQuorumThreshold: 1,
      wallet: {
        walletName: 'Algorand Primary Wallet',
        accounts: [{
          curve: 'CURVE_ED25519',
          pathFormat: 'PATH_FORMAT_BIP32',
          path: "m/44'/283'/0'/0/0",     // SLIP-44 path for Algorand (coin type 283)
          addressFormat: 'ADDRESS_FORMAT_ALGORAND',
        }],
      },
    },
    type: 'ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V4',
    timestampMs: Date.now().toString(),
  });

  const activity = result.activity;
  const subOrgId = activity.result.createSubOrganizationResult?.subOrganizationId!;
  const wallet = activity.result.createSubOrganizationResult?.wallet!;
  const walletId = wallet.walletId!;
  const algorandAddress = wallet.addresses[0]!;

  return { subOrgId, walletId, algorandAddress };
}
```

**Key notes:**
- `CURVE_ED25519` — Algorand uses Ed25519, confirmed by Turnkey docs
- `ADDRESS_FORMAT_ALGORAND` — confirmed enum value in Turnkey SDK
- `m/44'/283'/0'/0/0` — SLIP-44 derivation path for Algorand (coin type 283)
- `HASH_FUNCTION_NO_OP` is used at signing time (Engine 6 plan), NOT here
- `apiPrivateKey` stays on server — never exposed to client

---

### `authenticate.ts` (Middleware)

```typescript
// Verifies JWT on all protected routes
// Attaches user to req.user

import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../lib/jwt';
import { prisma } from '@crestflow/shared';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header', requestId: req.requestId }
    });
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);  // throws if invalid/expired
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', requestId: req.requestId }
    });
  }

  // Attach minimal user to request
  req.user = { id: payload.sub, email: payload.email, algorandAddress: payload.algorandAddress };
  next();
}
```

---

### `identity.events.ts`

```typescript
// Events emitted by the Identity module
// Consumed by: Engine 1 (PortfolioScanTriggered), Audit module (all)

export const IdentityEvents = {
  USER_ONBOARDED: 'UserOnboarded',
  WALLET_CONNECTED: 'WalletConnected',
  PORTFOLIO_SCAN_TRIGGERED: 'PortfolioScanTriggered',
} as const;

// Payloads
export interface UserOnboardedPayload {
  userId: string;
  email: string;
  algorandAddress: string;
  timestamp: string; // ISO8601 UTC
}

export interface WalletConnectedPayload {
  userId: string;
  algorandAddress: string;
  walletId: string;
  turnkeySubOrgId: string;
  timestamp: string;
}

export interface PortfolioScanTriggeredPayload {
  userId: string;
  algorandAddress: string;
  trigger: 'ONBOARDING' | 'MANUAL' | 'POST_EXECUTION';
  timestamp: string;
}
```

---

## Environment Variables

**File:** `apps/copilot-api/.env.example`

```bash
# ─── App ────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ─── Database ────────────────────────────────────────
DATABASE_URL=postgresql://crestflow:crestflow@localhost:5432/crestflow_dev

# ─── JWT ─────────────────────────────────────────────
JWT_SECRET=change_me_use_openssl_rand_base64_32
JWT_EXPIRY=7d

# ─── Google OAuth ─────────────────────────────────────
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com

# ─── Turnkey ─────────────────────────────────────────
TURNKEY_API_BASE_URL=https://api.turnkey.com
TURNKEY_API_PUBLIC_KEY=your_turnkey_api_public_key
TURNKEY_API_PRIVATE_KEY=your_turnkey_api_private_key    # NEVER expose to frontend
TURNKEY_ORGANIZATION_ID=your_turnkey_organization_id
```

**Security constraints (from `instructions.md` §18):**
- `TURNKEY_API_PRIVATE_KEY` must NEVER appear in any variable prefixed `NEXT_PUBLIC_` or equivalent
- `JWT_SECRET` must be regenerated per environment — never reuse across dev/staging/prod
- `.env` must be in `.gitignore` — only `.env.example` is committed

---

## Docker Compose (Local PostgreSQL)

**File:** `docker-compose.yml` (repo root)

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

volumes:
  postgres_data:
```

---

## Packages Required

**`apps/copilot-api/package.json` additions:**
```json
{
  "dependencies": {
    "@turnkey/sdk-server": "latest",
    "google-auth-library": "^9.x",
    "jsonwebtoken": "^9.x",
    "express": "^4.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.x",
    "@types/express": "^4.x"
  }
}
```

**`packages/shared/package.json` additions:**
```json
{
  "dependencies": {
    "@prisma/client": "^5.x",
    "prisma": "^5.x"
  }
}
```

---

## Logging Requirements (from `instructions.md` §19)

All structured logs must be JSON format with:
- `timestamp`, `service: "copilot-api"`, `module: "identity"`, `requestId`, `userId` (hashed for PII), `level`, `message`

Events to log:
- `INFO` — Google token verified successfully
- `INFO` — New user created (with `userId`, NOT email in log body)
- `INFO` — Turnkey sub-org created (with `subOrgId`)
- `INFO` — Algorand wallet provisioned (with `algorandAddress`)
- `INFO` — JWT issued
- `ERROR` — Google verification failed (include reason, NOT the raw token)
- `ERROR` — Turnkey creation failed (include error code, include `subOrgId` if it was created before failure)

**Never log:** raw `idToken`, `JWT_SECRET`, `TURNKEY_API_PRIVATE_KEY`, user email in body (only hashed userId)

---

## Audit Log Requirements (from `instructions.md` §19)

These events must produce immutable audit entries in the `AuditLog` table (to be defined in `architecture.md` when the Audit domain schema is added):

| Event | Trigger |
|---|---|
| `USER_AUTHENTICATED` | Successful Google sign-in (new or returning user) |
| `WALLET_PROVISIONED` | Turnkey sub-org + wallet created |
| `PORTFOLIO_SCAN_TRIGGERED` | Onboarding scan event emitted |

Audit log schema is append-only — no updates, no deletes. Defined in `architecture.md`.

---

## Error Handling Rules (from `instructions.md` §4)

- Correctness > Reliability > Maintainability > Performance
- If Turnkey wallet creation fails → do NOT create the DB user record → return `500 WALLET_PROVISION_FAILED` → log full Turnkey error server-side
- If Google verification fails → return `401 GOOGLE_AUTH_FAILED` → do NOT log the raw token
- All error responses use the standard error envelope
- No stack traces in production responses

---

## Testing Requirements (from `instructions.md` §20)

Coverage target: 80% overall, 95%+ for auth service logic.

### Unit Tests

**`google-auth.service.test.ts`**
- Valid `id_token` → correct `{ googleId, email, name }` returned
- Expired token → throws `GOOGLE_AUTH_FAILED`
- Wrong audience → throws `GOOGLE_AUTH_FAILED`
- Missing email claim → throws `GOOGLE_AUTH_FAILED`

**`turnkey.service.test.ts`** (mocked Turnkey SDK)
- Valid call → returns `{ subOrgId, walletId, algorandAddress }`
- Turnkey API error → throws, does not swallow
- Verify `ADDRESS_FORMAT_ALGORAND` and `CURVE_ED25519` are passed correctly

**`auth.service.test.ts`**
- New user → creates DB record + triggers events + returns `isNewUser: true`
- Existing user → fetches from DB, skips wallet provision, returns `isNewUser: false`
- Turnkey failure → does NOT create DB record → surfaces error
- Emits correct events in correct order: `UserOnboarded` → `WalletConnected` → `PortfolioScanTriggered`

### Integration Tests

**`POST /api/v1/auth/google`** (with test DB + mocked Turnkey + mocked Google)
- Happy path new user → 200 with `{ accessToken, user, isNewUser: true }`
- Happy path returning user → 200 with `{ accessToken, user, isNewUser: false }`
- Missing `idToken` → 400
- Invalid `idToken` → 401
- Turnkey failure → 500 with `WALLET_PROVISION_FAILED`

**`GET /api/v1/auth/me`**
- Valid JWT → 200 with user profile
- No JWT → 401
- Expired JWT → 401
- JWT valid but user deleted → 404

---

## Handoff to Engine 1 (Portfolio Intelligence)

When `PortfolioScanTriggered` event is emitted, it carries:
```typescript
{
  userId: string;
  algorandAddress: string;  // Engine 1 uses this to query Algorand Indexer
  trigger: 'ONBOARDING';
  timestamp: string;
}
```

Engine 1 subscribes to this event and initiates the full portfolio scan for the given `algorandAddress`. This is defined in the Engine 1 plan. In MVP, the event bus can be an in-process Node.js `EventEmitter`. The architecture is designed so this can be replaced with a proper message queue (e.g., BullMQ, Redis Streams) without changing engine logic.

---

## Progress Tracking

When this plan is executed, update `project-context/progress.md`:

| Integration | Status |
|---|---|
| Turnkey Embedded Wallet | → In Progress → Complete |
| Google OAuth | → In Progress → Complete |

Update `project-context/tasks.md`:

```
[x] Google OAuth integration
[x] Turnkey SDK integration
[x] Embedded Algorand wallet creation on signup
[x] Wallet address stored and linked to user record
[x] Post-onboarding portfolio scan trigger
```

Update `project-context/architecture.md` with the Identity domain schema when implemented.

Update `project-context/test.md` with specific test entries for each test written.

---

## Open Items (Deferred to Later Plans)

| Item | Deferred To |
|---|---|
| Email verification / OTP | Not in scope (Google OAuth only) |
| KYC (Veriff integration) | Plan: KYC + GoPlausible DID/VC |
| GoPlausible DID + VC | Plan: KYC + GoPlausible DID/VC |
| UPI on-ramp | Plan: On-Ramp |
| JWT refresh token | P2 hardening |
| Turnkey sub-org idempotency (orphan recovery) | P2 hardening |
| Rate limiting on `/api/v1/auth/google` | Hardening task |
| Dashboard login screen | `project-context/frontend-context.md` |
