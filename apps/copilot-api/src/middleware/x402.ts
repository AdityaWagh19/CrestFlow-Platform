/**
 * x402 Payment Gateway Middleware
 *
 * Gates compute-intensive and execution endpoints behind USDC micropayments.
 * 13 paid endpoints out of 55+ total. All reads are free.
 *
 * Flow:
 * 1. Check if endpoint is x402-gated (lookup in registry)
 * 2. If free → pass through
 * 3. If paid + no X-PAYMENT header → return HTTP 402 with price + instructions
 * 4. If paid + X-PAYMENT header → verify via Goplusfable facilitator + replay check
 * 5. If verified → pass through. If not → return 402
 *
 * Disabled in development (X402_ENABLED !== true).
 * Applied AFTER auth middleware, BEFORE route handler.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';
import { network } from '../lib/network.js';
import { redis } from '../lib/redis.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('x402');

// ─── x402 Endpoint Registry ───────────────────────────────────────────────
// 13 paid endpoints with prices in microUSDC (1 USDC = 1,000,000 microUSDC)

export const X402_ENDPOINTS: Record<string, { priceUsdcMicro: number; description: string }> = {
  // Engine 1: Portfolio (1 paid)
  'POST:/api/v1/portfolio/refresh': {
    priceUsdcMicro: 5_000, // $0.005
    description: 'Portfolio chain scan (Algorand Indexer + 3 protocol adapters)',
  },

  // Engine 2: Risk (0 paid — report/simulate deferred to P2)

  // Engine 3: Strategy (1 paid)
  'POST:/api/v1/strategy/refresh': {
    priceUsdcMicro: 20_000, // $0.02
    description: 'Strategy recompute (HRP+CVaR optimization)',
  },

  // Engine 5: Copilot (1 paid)
  'POST:/api/v1/copilot/query': {
    priceUsdcMicro: 10_000, // $0.01
    description: 'AI Copilot query (LLM call + context assembly)',
  },

  // Engine 6: Execution (4 paid)
  'POST:/api/v1/execute/plan': {
    priceUsdcMicro: 50_000, // $0.05
    description: 'Execution plan + policy evaluation + simulation',
  },
  'POST:/api/v1/execute/submit': {
    priceUsdcMicro: 100_000, // $0.10
    description: 'On-chain transaction execution (Turnkey signing + Algorand broadcast)',
  },
  'POST:/api/v1/execute/simulate': {
    priceUsdcMicro: 30_000, // $0.03
    description: 'Execution dry-run simulation (chain state query)',
  },
  'POST:/api/v1/execute/autopilot/enable': {
    priceUsdcMicro: 20_000, // $0.02
    description: 'Autopilot activation (Phase 3 feature)',
  },

  // Audit (1 paid)
  'GET:/api/v1/audit/export': {
    priceUsdcMicro: 50_000, // $0.05
    description: 'Audit log JSONL export (compliance/regulatory)',
  },
};

const USDC_ASA_ID = network.usdcAsaId;
const REPLAY_TTL_SECONDS = 86_400; // 24 hours

// ─── Middleware ────────────────────────────────────────────────────────────

export async function x402Gate(req: FastifyRequest, reply: FastifyReply) {
  // Disabled in development
  if (!config.X402_ENABLED) {
    return;
  }

  // Build endpoint key: "METHOD:/path"
  const endpointKey = `${req.method}:${req.url.split('?')[0]}`;
  const endpointConfig = X402_ENDPOINTS[endpointKey];

  // Not a paid endpoint — pass through
  if (!endpointConfig) {
    return;
  }

  const paymentTxId = req.headers['x-payment'] as string | undefined;

  if (!paymentTxId) {
    // Return HTTP 402 with payment requirements
    return reply.status(402).send({
      error: 'PAYMENT_REQUIRED',
      endpoint: endpointKey,
      description: endpointConfig.description,
      price: {
        amountMicro: endpointConfig.priceUsdcMicro,
        amountUsdc: (endpointConfig.priceUsdcMicro / 1_000_000).toFixed(6),
        asset: 'USDC',
        asaId: USDC_ASA_ID,
        network: network.networkLabel,
      },
      payTo: config.GOPLAUSIBLE_FACILITATOR_ADDRESS,
      facilitator: 'goplusfable',
      instructions:
        'Send USDC to the facilitator address on Algorand. ' +
        'Retry the request with the Algorand transaction ID in the X-PAYMENT header.',
    });
  }

  // Replay protection via Redis
  const isFirstUse = await checkReplayProtection(paymentTxId);
  if (!isFirstUse) {
    return reply.status(402).send({
      error: 'PAYMENT_ALREADY_USED',
      message: 'This payment transaction ID has already been used. Submit a new payment.',
    });
  }

  // Verify with Goplusfable facilitator
  const verified = await verifyWithFacilitator(paymentTxId, endpointConfig.priceUsdcMicro);

  if (!verified) {
    // Rollback replay protection on verification failure
    await redis.del(`crestflow:x402:used-nonces:${paymentTxId}`);

    return reply.status(402).send({
      error: 'PAYMENT_INVALID',
      message:
        'Payment could not be verified. Ensure the Algorand transaction is confirmed ' +
        'and the correct USDC amount was sent to the facilitator address.',
    });
  }

  logger.info(
    {
      endpoint: endpointKey,
      priceUsdcMicro: endpointConfig.priceUsdcMicro,
      paymentTxId,
      userId: req.userId,
    },
    'x402 payment verified',
  );
}

// ─── Replay Protection ────────────────────────────────────────────────────

async function checkReplayProtection(paymentTxId: string): Promise<boolean> {
  try {
    const key = `crestflow:x402:used-nonces:${paymentTxId}`;
    // SET NX = set only if not exists. Returns 'OK' on first use, null on replay.
    const wasSet = await redis.set(key, '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
    return wasSet !== null;
  } catch {
    // Redis failure — allow through (fail-open for payments to avoid blocking users)
    logger.warn({ paymentTxId }, 'x402 replay check failed — allowing through');
    return true;
  }
}

// ─── Facilitator Verification ─────────────────────────────────────────────

async function verifyWithFacilitator(txId: string, requiredAmountMicro: number): Promise<boolean> {
  if (!config.GOPLAUSIBLE_API_URL) {
    // No facilitator URL configured — pass through (development)
    logger.warn('x402 facilitator not configured — skipping verification');
    return true;
  }

  try {
    // GoPlausible facilitator is a PUBLIC API — no auth required
    const resp = await fetch(`${config.GOPLAUSIBLE_API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txId,
        requiredAmountMicro,
        asaId: USDC_ASA_ID,
        facilitatorAddress: config.GOPLAUSIBLE_FACILITATOR_ADDRESS,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const result = (await resp.json()) as { verified?: boolean };
    return result.verified === true;
  } catch (err: unknown) {
    logger.error({ err, txId }, 'x402 facilitator verification failed');
    return false;
  }
}
