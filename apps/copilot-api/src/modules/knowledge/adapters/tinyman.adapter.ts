/**
 * Tinyman Adapter
 * Fetches LP positions and pool state from the Tinyman analytics API.
 *
 * Tinyman V2 pools on Algorand — LP tokens are regular ASAs.
 * Pool data comes from the Tinyman analytics API (mainnet.analytics.tinyman.org).
 */

import { network } from '../../../lib/network.js';
import { CacheService, CacheTTL } from '../services/cache.service.js';
import { createLogger } from '@crestflow/shared';
import type { RawTinymanPool } from '../types/knowledge.types.js';

const logger = createLogger('knowledge:tinyman');

const TINYMAN_API_BASE = network.tinymanApiUrl;

async function tinymanFetch(path: string): Promise<unknown> {
  const url = `${TINYMAN_API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`Tinyman API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePool(p: any): RawTinymanPool {
  return {
    address: String(p.address ?? ''),
    asset1Id: parseInt(String(p.asset_1?.index ?? p.asset1Id ?? 0), 10),
    asset2Id: parseInt(String(p.asset_2?.index ?? p.asset2Id ?? 0), 10),
    asset1Reserves: String(p.current_asset_1_reserves ?? p.asset1Reserves ?? '0'),
    asset2Reserves: String(p.current_asset_2_reserves ?? p.asset2Reserves ?? '0'),
    issuedLiquidity: String(p.issued_liquidity ?? p.issuedLiquidity ?? '0'),
    lpTokenAssetId: parseInt(String(p.liquidity_asset?.index ?? p.lpTokenAssetId ?? 0), 10),
    totalFeeShare: String(p.total_fee_share ?? p.totalFeeShare ?? '0.003'),
  };
}

export const TinymanAdapter = {
  /**
   * Detects LP token holdings from a wallet's ASA list, then fetches corresponding
   * pool state. LP tokens are just ASAs — we match them against known pool LP token IDs.
   */
  async getUserLpPositions(
    address: string,
    asaHoldings: Array<{ assetId: number; amount: string }>,
  ): Promise<{ pool: RawTinymanPool; lpTokenAmount: string }[]> {
    const cacheKey = address;
    const cached = await CacheService.get<{ pool: RawTinymanPool; lpTokenAmount: string }[]>(
      'tinyman:positions',
      cacheKey,
    );
    if (cached) return cached;

    logger.debug({ address: address.slice(0, 8) + '...' }, 'detecting Tinyman LP positions');

    try {
      const allPools = await TinymanAdapter.getAllPools();
      const lpTokenIdToPool = new Map<number, RawTinymanPool>();
      for (const pool of allPools) {
        lpTokenIdToPool.set(pool.lpTokenAssetId, pool);
      }

      const positions: { pool: RawTinymanPool; lpTokenAmount: string }[] = [];
      for (const holding of asaHoldings) {
        const pool = lpTokenIdToPool.get(holding.assetId);
        if (pool) {
          positions.push({ pool, lpTokenAmount: holding.amount });
        }
      }

      await CacheService.set('tinyman:positions', cacheKey, positions, CacheTTL.PROTOCOL_POSITIONS);
      return positions;
    } catch (err) {
      logger.error(
        { err, address: address.slice(0, 8) + '...' },
        'Tinyman LP position detection failed',
      );
      return [];
    }
  },

  /**
   * Fetch all active Tinyman V2 pools (used by Engine 4 for yield discovery).
   */
  async getAllPools(): Promise<RawTinymanPool[]> {
    const cacheKey = 'all';
    const cached = await CacheService.get<RawTinymanPool[]>('tinyman:pools', cacheKey);
    if (cached) return cached;

    logger.debug('fetching all Tinyman pools');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await tinymanFetch('/v1/pools/?limit=200')) as any;
      const results = data?.results ?? [];

      const pools: RawTinymanPool[] = results.map(parsePool);

      // Filter out empty/invalid pools
      const validPools = pools.filter(
        (p) => p.asset1Id > 0 && p.asset2Id > 0 && p.lpTokenAssetId > 0,
      );

      await CacheService.set('tinyman:pools', cacheKey, validPools, CacheTTL.POOL_APYS);
      return validPools;
    } catch (err) {
      logger.error({ err }, 'Tinyman pools fetch failed');
      return [];
    }
  },
};
