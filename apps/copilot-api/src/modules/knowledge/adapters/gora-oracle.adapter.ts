/**
 * Gora Oracle Adapter
 *
 * Gora is a decentralized oracle on Algorand. Price feeds are delivered
 * on-chain into specific Algorand app global state by Gora validator nodes.
 *
 * This adapter queries Gora feed app global state via algod.getApplicationByID()
 * and decodes the price value. Falls back to null if Gora is not configured.
 */

import { config } from '../../../config/env.js';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger, Decimal, toDecimalString } from '@crestflow/shared';
import { CacheService } from '../services/cache.service.js';

const logger = createLogger('knowledge:gora');

/**
 * Gora feed app IDs per ASA.
 * These must be obtained from the Gora team and configured.
 * When GORA_ORACLE_APP_ID is empty, the adapter is disabled.
 */
const GORA_FEED_APP_IDS: Record<number, number> = {
  // Map ASA ID → Gora price feed app ID
  // Populate from Gora team documentation when available
  // 0: <ALGO/USD feed app ID>,
  // 31566704: <USDC/USD feed app ID>,
};

export const GoraOracleAdapter = {
  /**
   * Get price for a single asset from Gora on-chain oracle.
   * Queries the app global state and decodes the ABI-encoded price.
   */
  async getPrice(
    assetId: number,
  ): Promise<{ priceUsd: string; confidence: string; timestamp: number } | null> {
    if (!GoraOracleAdapter.isAvailable()) return null;

    const feedAppId = GORA_FEED_APP_IDS[assetId];
    if (!feedAppId) return null;

    const cacheKey = `gora:${assetId}`;
    const cached = await CacheService.get<{
      priceUsd: string;
      confidence: string;
      timestamp: number;
    }>('gora:price', cacheKey);
    if (cached) return cached;

    try {
      const appInfo = await algodClient.getApplicationByID(feedAppId).do();
      const globalState = appInfo.params?.globalState ?? [];

      // Decode price from global state
      // Gora stores price as a uint64 in a specific key
      let priceRaw: bigint | null = null;
      let timestamp = 0;

      for (const kv of globalState as unknown as Array<{
        key: string;
        value: { type: number; uint: bigint };
      }>) {
        const keyDecoded = Buffer.from(kv.key, 'base64').toString('utf8');
        if (keyDecoded === 'price' || keyDecoded === 'p') {
          priceRaw = kv.value.uint;
        }
        if (keyDecoded === 'timestamp' || keyDecoded === 't') {
          timestamp = parseInt(String(kv.value.uint), 10);
        }
      }

      if (priceRaw === null) {
        logger.warn({ assetId, feedAppId }, 'Gora feed has no price value');
        return null;
      }

      // Gora prices are typically in 8 decimal precision
      const priceUsd = toDecimalString(new Decimal(String(priceRaw)).div(1e8));
      const result = { priceUsd, confidence: 'HIGH', timestamp };

      await CacheService.set('gora:price', cacheKey, result, 30); // 30s cache
      logger.debug({ assetId, priceUsd }, 'Gora price fetched');
      return result;
    } catch (err: unknown) {
      logger.error({ err, assetId, feedAppId }, 'Gora oracle query failed');
      return null;
    }
  },

  /**
   * Batch query prices for multiple assets.
   */
  async getPrices(
    assetIds: number[],
  ): Promise<Record<number, { priceUsd: string; confidence: string; timestamp: number } | null>> {
    const results: Record<
      number,
      { priceUsd: string; confidence: string; timestamp: number } | null
    > = {};
    for (const id of assetIds) {
      results[id] = await GoraOracleAdapter.getPrice(id);
    }
    return results;
  },

  /**
   * Check if Gora Oracle is available and configured.
   */
  isAvailable(): boolean {
    return config.GORA_ORACLE_ENABLED && Object.keys(GORA_FEED_APP_IDS).length > 0;
  },
};
