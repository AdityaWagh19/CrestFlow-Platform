# Plan 11 — x402 Gateway Policy

**Status:** Approved
**Priority:** P1 (activate before public API launch)
**Depends on:**
- All Plans 01–10 (all endpoints are defined across these plans)
- Plan 08 (x402 middleware skeleton already written in `middleware/x402.middleware.ts`)
- Plan 10 (off-ramp endpoints added: both free)

---

## Objective

This plan is a **cross-cutting analysis** of all endpoints across Plans 01–10 that determines:

1. Which endpoints are **free** (no payment required)
2. Which endpoints are **x402-gated** (per-request micropayment via USDC on Algorand)
3. The **pricing tier** per endpoint category
4. The **implementation details** for the x402 middleware, Goplusfable facilitator integration, and per-endpoint configuration

---

## Decision Framework

An endpoint is **x402-gated** if it meets ANY of these criteria:
- **Compute-intensive** — triggers an algorithm, LLM call, or chain-state simulation
- **Write to blockchain** — any transaction signing or broadcast
- **High-value data** — generates novel analysis not available as a simple DB read
- **Enables autonomous action** — autopilot, execution submission

An endpoint is **free** if:
- It reads existing DB records (snapshots, history, status)
- It is a safety or prerequisite action (KYC, session reset, logout, autopilot disable)
- It accepts data from the user (onboarding answers, profile update, webhook receiver)
- It is a system-level check (health, auth callback)

**Philosophy:** Free endpoints attract users and keep the product usable. Paid endpoints monetise compute and execution — the actual value delivered.

---

## Full Endpoint Catalogue — All Plans

### Engine 0: Auth + Identity (Plan 01 + Plan 10)

| Endpoint | Method | x402? | Reason |
|---|---|---|---|
| `/auth/google` | GET | FREE | OAuth redirect — public |
| `/auth/google/callback` | GET | FREE | OAuth callback — public |
| `/auth/me` | GET | FREE | Read own session |
| `/auth/logout` | POST | FREE | Safety action |
| `/auth/refresh` | POST | FREE | Token refresh |
| `/kyc/initiate` | POST | FREE | KYC is a prerequisite, not premium |
| `/kyc/status` | GET | FREE | Read own KYC status |
| `/kyc/webhook` | POST | FREE | Veriff webhook receiver |
| `/identity/did` | GET | FREE | Read own DID |
| `/identity/vc` | GET | FREE | Read own VC |
| `/onramp/initiate` | POST | FREE | Fiat entry — must be frictionless |
| `/onramp/webhook` | POST | FREE | Provider webhook receiver |

---

### Engine 1: Portfolio Intelligence (Plan 03)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/portfolio/overview` | GET | FREE | — | Reads latest PortfolioSnapshot |
| `/portfolio/allocation` | GET | FREE | — | Reads latest snapshot |
| `/portfolio/exposure` | GET | FREE | — | Reads latest snapshot |
| `/portfolio/performance` | GET | FREE | — | Reads latest snapshot |
| `/portfolio/health` | GET | FREE | — | Reads latest snapshot |
| `/portfolio/snapshots` | GET | FREE | — | Reads snapshot history |
| `/portfolio/refresh` | POST | **x402** | **$0.005** | Triggers full chain scan (Algorand Indexer + 3 protocol adapters + IL calculation) |

---

### Engine 2: Risk Intelligence (Plan 04)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/risk/score` | GET | FREE | — | Reads latest RiskSnapshot |
| `/risk/alerts` | GET | FREE | — | Reads active RiskAlerts |
| `/risk/history` | GET | FREE | — | Reads snapshot history |
| `/risk/exposure` | GET | FREE | — | Reads concentration data from snapshot |
| `/risk/liquidation` | GET | FREE | — | Reads liquidation threshold from snapshot |
| `/risk/report` | GET | **x402** | **$0.01** | Generates full PDF/JSON risk report (compute + formatting) |
| `/risk/simulate` | POST | **x402** | **$0.01** | Runs CVaR simulation on hypothetical portfolio |

---

### Engine 3: Strategy & Optimization (Plan 05)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/strategy/allocation` | GET | FREE | — | Reads latest StrategySnapshot |
| `/strategy/rebalance` | GET | FREE | — | Reads rebalancing actions from snapshot |
| `/strategy/explain` | GET | FREE | — | Reads plain-English explanation from snapshot |
| `/strategy/history` | GET | FREE | — | Reads snapshot history |
| `/strategy/goal` | PUT | FREE | — | User updates own goal profile |
| `/strategy/simulate` | POST | **x402** | **$0.02** | Runs HRP+CVaR optimization (compute-intensive; Ledoit-Wolf + clustering + CVaR gradient) |
| `/strategy/refresh` | POST | **x402** | **$0.02** | Forces full strategy recompute (same algorithm as simulate but persists result) |

---

### Engine 4: Yield & Opportunity (Plan 06)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/yield/opportunities` | GET | FREE | — | Reads latest YieldOpportunitySnapshot |
| `/yield/rankings` | GET | FREE | — | Reads ranked opportunities from snapshot |
| `/yield/idle` | GET | FREE | — | Reads idle capital signals |
| `/yield/history` | GET | FREE | — | Reads snapshot history |
| `/yield/upgrades` | GET | FREE | — | Reads "position upgrades" from snapshot |
| `/yield/opportunity/:id` | GET | FREE | — | Reads single opportunity record |
| `/yield/simulate` | POST | **x402** | **$0.01** | Runs TOPSIS re-ranking + IL simulation on custom parameters |

---

### Engine 5: User Intelligence & Copilot (Plan 07)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/user/profile` | GET | FREE | — | Reads UserProfile |
| `/user/profile` | PUT | FREE | — | User updates own goal profile |
| `/user/onboarding` | POST | FREE | — | Questionnaire submission — onboarding must be friction-free |
| `/copilot/history` | GET | FREE | — | Reads session history (Redis read) |
| `/copilot/reset` | POST | FREE | — | Safety/UX action |
| `/copilot/query` | POST | **x402** | **$0.01** | LLM API call (GPT-4.1-mini + context assembly + Zod parse) |
| `/copilot/query/stream` | POST | **x402** | **$0.01** | Streaming LLM call (same as above but SSE) |

---

### Engine 6: Autonomous Execution (Plan 08)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/execute/status/:id` | GET | FREE | — | Status poll — must be real-time and free |
| `/execute/history` | GET | FREE | — | Reads ExecutionRecord history |
| `/execute/autopilot/disable` | DELETE | FREE | — | Safety action — disabling must always work |
| `/execute/plan` | POST | **x402** | **$0.05** | POA building + full policy evaluation + simulation (chain state query) |
| `/execute/submit` | POST | **x402** | **$0.10** | On-chain transaction: Turnkey signing + Algorand broadcast (most valuable action in the system) |
| `/execute/simulate` | POST | **x402** | **$0.03** | algod.simulateTransaction() dry-run — chain state simulation |
| `/execute/autopilot/enable` | POST | **x402** | **$0.02** | Enables autonomous execution — high-value feature activation |

---

### Audit Layer (Plan 09)

| Endpoint | Method | x402? | Price | Reason |
|---|---|---|---|---|
| `/audit/log` | GET | FREE | — | User reads own audit trail |
| `/audit/log/:id` | GET | FREE | — | Single entry lookup |
| `/audit/execution/:id` | GET | FREE | — | Execution-specific audit trail |
| `/audit/export` | GET | **x402** | **$0.05** | Generates JSONL export file (streaming, compute) |

---

## Pricing Summary

| Tier | Price (USDC) | Endpoints |
|---|---|---|
| **Read** | FREE | All GET endpoints on existing snapshots |
| **Micro** | $0.005 | Portfolio refresh (`/portfolio/refresh`) |
| **Standard** | $0.01 | Risk/yield simulate, copilot query, risk report |
| **Premium** | $0.02–$0.03 | Strategy simulate/refresh, execution simulate, autopilot enable |
| **Execution** | $0.05–$0.10 | Execution plan (`$0.05`) + execution submit (`$0.10`) |
| **Export** | $0.05 | Audit JSONL export |

**Total x402-gated endpoints: 13 out of 55 total**
**Total free endpoints: 42 out of 55 total**

---

## x402 Middleware Implementation

**File:** `middleware/x402.middleware.ts` (extends skeleton from Plan 08)

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Complete x402 endpoint registry
export const X402_ENDPOINTS: Record<string, { priceUsdcMicro: number; description: string }> = {
  'POST /api/v1/portfolio/refresh':          { priceUsdcMicro: 5_000,    description: 'Portfolio chain scan' },
  'GET  /api/v1/risk/report':                { priceUsdcMicro: 10_000,   description: 'Risk analysis report' },
  'POST /api/v1/risk/simulate':              { priceUsdcMicro: 10_000,   description: 'Risk scenario simulation' },
  'POST /api/v1/strategy/simulate':          { priceUsdcMicro: 20_000,   description: 'Strategy optimization simulation' },
  'POST /api/v1/strategy/refresh':           { priceUsdcMicro: 20_000,   description: 'Strategy recompute' },
  'POST /api/v1/yield/simulate':             { priceUsdcMicro: 10_000,   description: 'Yield TOPSIS simulation' },
  'POST /api/v1/copilot/query':              { priceUsdcMicro: 10_000,   description: 'AI Copilot query (LLM)' },
  'POST /api/v1/copilot/query/stream':       { priceUsdcMicro: 10_000,   description: 'AI Copilot streaming query' },
  'POST /api/v1/execute/plan':               { priceUsdcMicro: 50_000,   description: 'Execution plan + simulation' },
  'POST /api/v1/execute/submit':             { priceUsdcMicro: 100_000,  description: 'On-chain transaction execution' },
  'POST /api/v1/execute/simulate':           { priceUsdcMicro: 30_000,   description: 'Execution dry-run simulation' },
  'POST /api/v1/execute/autopilot/enable':   { priceUsdcMicro: 20_000,   description: 'Autopilot activation' },
  'GET  /api/v1/audit/export':               { priceUsdcMicro: 50_000,   description: 'Audit log JSONL export' },
};

const FACILITATOR_ADDRESS  = process.env.GOPLUSFABLE_FACILITATOR_ADDRESS!;
const ALGORAND_USDC_ASA_ID = 31566704;  // Mainnet USDC ASA ID

export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const endpointKey = `${req.method} ${req.path}`;
  const config = X402_ENDPOINTS[endpointKey];

  // Not a paid endpoint — pass through
  if (!config) return next();

  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (!paymentHeader) {
    res.status(402).json({
      error: 'PAYMENT_REQUIRED',
      endpoint: endpointKey,
      description: config.description,
      price: {
        amountMicro: config.priceUsdcMicro,
        amountUsdc:  (config.priceUsdcMicro / 1_000_000).toFixed(6),
        asset:       'USDC',
        asaId:       ALGORAND_USDC_ASA_ID,
        network:     'algorand-mainnet',
      },
      payTo:       FACILITATOR_ADDRESS,
      facilitator: 'goplusfable',
      instructions: 'Send USDC to the facilitator address on Algorand. Retry the request with the Algorand transaction ID in the X-PAYMENT header.',
    });
    return;
  }

  // Verify with Goplusfable facilitator
  const verified = await verifyWithFacilitator(paymentHeader, config.priceUsdcMicro);

  if (!verified) {
    res.status(402).json({
      error: 'PAYMENT_INVALID',
      message: 'Payment could not be verified. Ensure the Algorand transaction is confirmed and the correct USDC amount was sent.',
    });
    return;
  }

  logger.info({
    module: 'x402',
    event: 'payment_verified',
    endpoint: endpointKey,
    priceUsdcMicro: config.priceUsdcMicro,
    paymentTxId: paymentHeader,
    userId: (req as any).userId,
  });

  next();
}

async function verifyWithFacilitator(txId: string, requiredAmountMicro: number): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.GOPLUSFABLE_API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GOPLUSFABLE_API_KEY}` },
      body: JSON.stringify({
        txId,
        requiredAmountMicro,
        asaId: ALGORAND_USDC_ASA_ID,
        facilitatorAddress: FACILITATOR_ADDRESS,
      }),
    });
    const result = await response.json();
    return result.verified === true && !result.alreadyUsed; // prevent replay attacks
  } catch {
    return false;
  }
}
```

---

## Replay Attack Prevention

The Goplusfable facilitator must track used payment txIDs to prevent replaying the same USDC transaction against multiple API calls.

```typescript
// Goplusfable response includes `alreadyUsed: boolean`
// If alreadyUsed === true → reject even if verified === true
// Facilitator maintains a used-txId index (TTL: 1 hour — beyond Algorand finality window)
```

---

## Environment Variables Required

```env
# Goplusfable
GOPLUSFABLE_FACILITATOR_ADDRESS=  # USDC-receiving Algorand address
GOPLUSFABLE_API_URL=              # Verification API URL
GOPLUSFABLE_API_KEY=              # API key for facilitator verification
```

---

## Implementation Notes

1. **x402 middleware must be applied AFTER** auth middleware — payments are per-authenticated-user, not anonymous
2. **x402 middleware must be applied BEFORE** the route handler — block before computation starts
3. For streaming endpoints (`/copilot/query/stream`): verify payment before opening the SSE connection
4. **Autopilot users**: once autopilot is enabled, internal automated executions triggered by events do NOT require x402 payment — only the initial `autopilot/enable` call is gated. Subsequent automated executions are treated as pre-paid operations under the autopilot subscription model (future Plan)
5. **Development/staging**: x402 is disabled when `NODE_ENV !== 'production'` to avoid payment friction during development

---

## Testing Requirements

**`x402.middleware.test.ts`**
- Free endpoint → passes through (no 402)
- Paid endpoint, no X-PAYMENT header → 402 with correct price and facilitator address
- Paid endpoint, invalid payment → 402 with PAYMENT_INVALID
- Paid endpoint, valid payment → `next()` called
- Replay attack: same txId used twice → rejected on second use
- Streaming endpoint: 402 returned before SSE connection opened
- Development mode: all paid endpoints pass through regardless of headers
