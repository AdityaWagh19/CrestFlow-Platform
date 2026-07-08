/**
 * Folks Finance Adapter
 * Fetches lending/borrowing positions and pool APY data from the Folks Finance API.
 */

import { network } from '../../../lib/network.js';
import { CacheService, CacheTTL } from '../services/cache.service.js';
import { createLogger } from '@crestflow/shared';
import type { RawFolksPosition, RawFolksPool } from '../types/knowledge.types.js';

const logger = createLogger('knowledge:folks');

// Folks Finance REST API base — falls back to on-chain reads when SDK is available
const FOLKS_API_BASE = network.isTestnet
  ? 'https://testnet-api.folks.finance'
  : 'https://api.folks.finance';

async function folksFetch(path: string): Promise<unknown> {
  const url = `${FOLKS_API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`Folks Finance API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePosition(p: any): RawFolksPosition {
  return {
    protocol: 'folks-finance',
    marketAppId: parseInt(String(p.marketAppId ?? p['market_app_id'] ?? 0), 10),
    assetId: parseInt(String(p.assetId ?? p['asset_id'] ?? 0), 10),
    depositBalance: String(p.depositBalance ?? p['deposit_balance'] ?? '0'),
    borrowBalance: String(p.borrowBalance ?? p['borrow_balance'] ?? '0'),
    depositInterestRate: String(p.depositInterestRate ?? p['deposit_interest_rate'] ?? '0'),
    borrowInterestRate: String(p.borrowInterestRate ?? p['borrow_interest_rate'] ?? '0'),
    collateralFactor: p.collateralFactor != null ? String(p.collateralFactor) : undefined,
    liquidationThreshold:
      p.liquidationThreshold != null ? String(p.liquidationThreshold) : undefined,
    healthFactor: p.healthFactor != null ? String(p.healthFactor) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePool(p: any): RawFolksPool {
  return {
    marketAppId: parseInt(String(p.marketAppId ?? p['market_app_id'] ?? 0), 10),
    assetId: parseInt(String(p.assetId ?? p['asset_id'] ?? 0), 10),
    supplyApy: String(p.supplyApy ?? p['supply_apy'] ?? '0'),
    borrowApy: String(p.borrowApy ?? p['borrow_apy'] ?? '0'),
    tvlUsd: String(p.tvlUsd ?? p['tvl_usd'] ?? '0'),
    depositSize: String(p.depositSize ?? p['deposit_size'] ?? '0'),
    borrowSize: String(p.borrowSize ?? p['borrow_size'] ?? '0'),
    utilizationRate: String(p.utilizationRate ?? p['utilization_rate'] ?? '0'),
  };
}

export const FolksFinanceAdapter = {
  /**
   * Returns all supply + borrow positions for an Algorand address.
   */
  async getUserPositions(address: string): Promise<RawFolksPosition[]> {
    const cacheKey = address;
    const cached = await CacheService.get<RawFolksPosition[]>('folks:positions', cacheKey);
    if (cached) return cached;

    logger.debug({ address: address.slice(0, 8) + '...' }, 'fetching Folks Finance positions');

    try {
      const data = await folksFetch(`/v2/lending/user/${address}/positions`);
      const arr = Array.isArray(data) ? data : [];
      const positions = arr.map(parsePosition);

      await CacheService.set('folks:positions', cacheKey, positions, CacheTTL.PROTOCOL_POSITIONS);
      return positions;
    } catch (err) {
      logger.error(
        { err, address: address.slice(0, 8) + '...' },
        'Folks Finance positions fetch failed',
      );
      return [];
    }
  },

  /**
   * Returns all pool/market configs including supply/borrow APYs and TVL.
   */
  async getPoolData(): Promise<RawFolksPool[]> {
    const cacheKey = 'all';
    const cached = await CacheService.get<RawFolksPool[]>('folks:pools', cacheKey);
    if (cached) return cached;

    logger.debug('fetching Folks Finance pool data');

    try {
      const data = await folksFetch('/v2/lending/pools');
      const arr = Array.isArray(data) ? data : [];
      const pools = arr.map(parsePool);

      await CacheService.set('folks:pools', cacheKey, pools, CacheTTL.POOL_APYS);
      return pools;
    } catch (err) {
      logger.error({ err }, 'Folks Finance pool data fetch failed');
      return [];
    }
  },
};
