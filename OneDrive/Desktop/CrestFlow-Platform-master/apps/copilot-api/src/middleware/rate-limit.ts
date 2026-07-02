import { RateLimiterRedis } from 'rate-limiter-flexible';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitError } from '@crestflow/shared';
import { redis } from '../lib/redis.js';

// Global rate limiter — 100 requests/minute per IP (ADD-03)
const globalLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'crestflow:ratelimit:global',
  points: 100,
  duration: 60,
});

// Authenticated rate limiter — 500 requests/minute per userId
const authenticatedLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'crestflow:ratelimit:auth',
  points: 500,
  duration: 60,
});

// Copilot rate limiter — 20 queries/minute per userId
const copilotLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'crestflow:ratelimit:copilot',
  points: 20,
  duration: 60,
});

export async function globalRateLimit(req: FastifyRequest, _reply: FastifyReply) {
  try {
    const key = req.ip;
    await globalLimiter.consume(key);
  } catch {
    throw new RateLimitError('Too many requests — try again shortly');
  }
}

export async function authenticatedRateLimit(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.userId) return;
  try {
    await authenticatedLimiter.consume(req.userId);
  } catch {
    throw new RateLimitError('Too many requests — try again shortly');
  }
}

export async function copilotRateLimit(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.userId) return;
  try {
    await copilotLimiter.consume(req.userId);
  } catch {
    throw new RateLimitError('Copilot query limit reached — try again in a minute');
  }
}
