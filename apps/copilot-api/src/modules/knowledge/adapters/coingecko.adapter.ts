/**
 * CoinGecko Adapter
 * Fetches token prices and market data from the CoinGecko API.
 *
 * Free demo tier: 100 calls/min, 10k calls/month, 60s data refresh.
 * All prices cached for 60s to match the free tier refresh rate.
 */

import { config } from '../../../config/env.js';
import { CacheService, CacheTTL } from '../services/cache.service.js';
import { createLogger } from '@crestflow/shared';
import type { RawCoinGeckoPrice } from '../types/knowledge.types.js';

const logger = createLogger('knowledge:coingecko');

const COINGECKO_BASE = config.COINGECKO_API_URL;

async function cgFetch(path: string): Promise<unknown> {
  const url = `${COINGECKO_BASE}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = config.COINGECKO_API_KEY;
  }

  const resp = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (resp.status === 429) {
    logger.warn('CoinGecko rate limit hit (429) — back off');
    throw new Error('CoinGecko rate limit exceeded');
  }

  if (!resp.ok) {
    throw new Error(`CoinGecko fetch failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

export const CoinGeckoAdapter = {
  /**
   * Batch fetch prices for multiple CoinGecko IDs in one API call.
   * Returns a map from CoinGecko ID to raw price data.
   */
  async getPrices(coinGeckoIds: string[]): Promise<Record<string, RawCoinGeckoPrice>> {
    if (coinGeckoIds.length === 0) return {};

    const sortedIds = [...coinGeckoIds].sort();
    const cacheKey = sortedIds.join(',');
    const cached = await CacheService.get<Record<string, RawCoinGeckoPrice>>('cg:prices', cacheKey);
    if (cached) return cached;

    logger.debug({ count: coinGeckoIds.length }, 'fetching prices from CoinGecko');

    const ids = sortedIds.join(',');
    const data = (await cgFetch(
      `/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`,
    )) as Record<string, RawCoinGeckoPrice>;

    await CacheService.set('cg:prices', cacheKey, data, CacheTTL.PRICE);
    return data;
  },
};
