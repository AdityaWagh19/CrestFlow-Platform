import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

/**
 * x402 payment middleware stub.
 * Full implementation in Plan 11 (x402 Gateway Policy).
 * In development, this middleware is disabled (all endpoints pass through).
 */
export async function x402Gate(_req: FastifyRequest, _reply: FastifyReply) {
  // Disabled in development (ADD: x402 disabled when X402_ENABLED !== true)
  if (!config.X402_ENABLED) {
    return;
  }

  // TODO (Plan 11): Check X-PAYMENT header, verify with Goplusfable facilitator
  await Promise.resolve(); // placeholder for async payment verification
}
