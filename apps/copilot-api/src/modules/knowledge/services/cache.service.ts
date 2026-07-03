/**
 * Redis-backed TTL cache service for the knowledge layer.
 * All keys namespaced under `crestflow:{namespace}:{key}` to prevent collisions.
 *
 * Graceful degradation: if Redis is unreachable, adapters bypass cache
 * and fetch live data. Cache failures are logged but never crash the process.
 */

import { redis } from '../../../lib/redis.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('knowledge:cache');

const KEY_PREFIX = 'crestflow';

export const CacheService = {
  /**
   * Get a cached value. Returns null on cache miss or Redis error.
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    try {
      const fullKey = `${KEY_PREFIX}:${namespace}:${key}`;
      const raw = await redis.get(fullKey);
      if (raw) {
        logger.debug({ namespace, key }, 'cache hit');
        return JSON.parse(raw) as T;
      }
      logger.debug({ namespace, key }, 'cache miss');
      return null;
    } catch (err) {
      logger.warn({ err, namespace, key }, 'cache get failed — bypassing cache');
      return null;
    }
  },

  /**
   * Set a cached value with TTL in seconds. Non-fatal on failure.
   */
  async set(namespace: string, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const fullKey = `${KEY_PREFIX}:${namespace}:${key}`;
      await redis.setex(fullKey, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      logger.warn({ err, namespace, key }, 'cache set failed — continuing without cache');
    }
  },

  /**
   * Delete a cached value. Non-fatal on failure.
   */
  async del(namespace: string, key: string): Promise<void> {
    try {
      const fullKey = `${KEY_PREFIX}:${namespace}:${key}`;
      await redis.del(fullKey);
    } catch {
      // non-fatal
    }
  },

  /**
   * Invalidate all keys in a namespace. Uses SCAN to avoid blocking Redis.
   * Non-fatal on failure.
   */
  async invalidateNamespace(namespace: string): Promise<void> {
    try {
      const pattern = `${KEY_PREFIX}:${namespace}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.warn({ err, namespace }, 'cache namespace invalidation failed');
    }
  },
};

/** TTL constants — single source of truth for all cache durations. */
export const CacheTTL = {
  /** 60s — matches CoinGecko free tier refresh */
  PRICE: 60,
  /** 5 min — pool rates change slowly */
  POOL_APYS: 300,
  /** 30s — near real-time portfolio accuracy */
  ACCOUNT_HOLDINGS: 30,
  /** 1 hour — ASA names/decimals rarely change */
  ASA_METADATA: 3600,
  /** 30s — same as account holdings */
  PROTOCOL_POSITIONS: 30,
} as const;
