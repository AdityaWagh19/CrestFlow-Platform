/**
 * Pact Adapter
 * Fetches LP positions and pool analytics from the Pact API.
 *
 * Pact is a DEX on Algorand with concentrated/constant-product pools.
 * Pool data includes TVL, APR, volume, and reserve information.
 */

import { config } from '../../../config/env.js';
import { CacheService, CacheTTL } from '../services/cache.service.js';
import { createLogger } from '@crestflow/shared';
import type { RawPactPool } from '../types/knowledge.types.js';

const logger = createLogger('knowledge:pact');

const PACT_API_BASE = config.PACT_API_URL;

async function pactFetch(path: string): Promise<unknown> {
  const url = `${PACT_API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`Pact API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePool(p: any): RawPactPool {
  return {
    appId: parseInt(String(p.appid ?? p.app_id ?? p.appId ?? 0), 10),
    primaryAssetId: parseInt(
      String(p.primary_asset?.algoid ?? p.primary_asset?.index ?? p.primaryAssetId ?? 0),
      10,
    ),
    secondaryAssetId: parseInt(
      String(p.secondary_asset?.algoid ?? p.secondary_asset?.index ?? p.secondaryAssetId ?? 0),
      10,
    ),
    lpTokenAssetId: parseInt(String(p.lp_token_id ?? p.lpTokenAssetId ?? 0), 10),
    tvlUsd: String(p.tvl_usd ?? p.tvlUsd ?? '0'),
    apr7d: String(p.apr_7d ?? p.apr7d ?? '0'),
    volume24hUsd: String(p.volume_24h ?? p.volume24hUsd ?? '0'),
    primaryAssetReserves: String(p.primary_asset_amount ?? p.primaryAssetReserves ?? '0'),
    secondaryAssetReserves: String(p.secondary_asset_amount ?? p.secondaryAssetReserves ?? '0'),
    issuedLiquidity: String(p.issued_liquidity ?? p.issuedLiquidity ?? '0'),
  };
}

export const PactAdapter = {
  /**
   * Returns all Pact pools with TVL, APR, volume data.
   */
  async getAllPools(): Promise<RawPactPool[]> {
    const cacheKey = 'all';
    const cached = await CacheService.get<RawPactPool[]>('pact:pools', cacheKey);
    if (cached) return cached;

    logger.debug('fetching all Pact pools');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await pactFetch('/api/pools')) as any;
      const results: unknown[] = data?.results ?? (Array.isArray(data) ? data : []);

      const pools: RawPactPool[] = results.map(parsePool);

      // Filter out invalid pools
      const validPools = pools.filter((p) => p.appId > 0 && p.primaryAssetId >= 0);

      await CacheService.set('pact:pools', cacheKey, validPools, CacheTTL.POOL_APYS);
      return validPools;
    } catch (err) {
      logger.error({ err }, 'Pact pools fetch failed');
      return [];
    }
  },

  /**
   * Returns LP positions for a specific wallet.
   * Matches user's ASA holdings against known Pact LP token IDs.
   */
  async getUserLpPositions(
    address: string,
    asaHoldings: Array<{ assetId: number; amount: string }>,
  ): Promise<{ pool: RawPactPool; lpTokenAmount: string }[]> {
    const cacheKey = address;
    const cached = await CacheService.get<{ pool: RawPactPool; lpTokenAmount: string }[]>(
      'pact:positions',
      cacheKey,
    );
    if (cached) return cached;

    logger.debug({ address: address.slice(0, 8) + '...' }, 'detecting Pact LP positions');

    try {
      const allPools = await PactAdapter.getAllPools();
      const lpTokenIdToPool = new Map<number, RawPactPool>();
      for (const pool of allPools) {
        if (pool.lpTokenAssetId > 0) {
          lpTokenIdToPool.set(pool.lpTokenAssetId, pool);
        }
      }

      const positions: { pool: RawPactPool; lpTokenAmount: string }[] = [];
      for (const holding of asaHoldings) {
        const pool = lpTokenIdToPool.get(holding.assetId);
        if (pool) {
          positions.push({ pool, lpTokenAmount: holding.amount });
        }
      }

      await CacheService.set('pact:positions', cacheKey, positions, CacheTTL.PROTOCOL_POSITIONS);
      return positions;
    } catch (err) {
      logger.error(
        { err, address: address.slice(0, 8) + '...' },
        'Pact LP position detection failed',
      );
      return [];
    }
  },
};
