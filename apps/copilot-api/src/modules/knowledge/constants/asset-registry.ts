/**
 * Asset registry — maps Algorand ASA IDs to CoinGecko IDs and metadata.
 * Network-aware: uses testnet or mainnet ASA IDs based on ALGORAND_NETWORK.
 */

import { isTestnet } from '../../../lib/network.js';

export interface AssetMeta {
  assetId: number;
  coinGeckoId: string | null; // null = not on CoinGecko
  symbol: string;
  name: string;
  decimals: number;
  category: 'volatile' | 'stablecoin';
}

/** Mainnet ASA registry */
const MAINNET_REGISTRY: Record<number, AssetMeta> = {
  0: {
    assetId: 0,
    coinGeckoId: 'algorand',
    symbol: 'ALGO',
    name: 'Algorand',
    decimals: 6,
    category: 'volatile',
  },
  31566704: {
    assetId: 31566704,
    coinGeckoId: 'usd-coin',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    category: 'stablecoin',
  },
  312769: {
    assetId: 312769,
    coinGeckoId: 'tether',
    symbol: 'USDt',
    name: 'Tether USDt',
    decimals: 6,
    category: 'stablecoin',
  },
  386195940: {
    assetId: 386195940,
    coinGeckoId: 'ethereum',
    symbol: 'goETH',
    name: 'goETH',
    decimals: 8,
    category: 'volatile',
  },
  386192725: {
    assetId: 386192725,
    coinGeckoId: 'bitcoin',
    symbol: 'goBTC',
    name: 'goBTC',
    decimals: 8,
    category: 'volatile',
  },
  793124631: {
    assetId: 793124631,
    coinGeckoId: 'wrapped-bitcoin',
    symbol: 'wBTC',
    name: 'Wrapped BTC',
    decimals: 8,
    category: 'volatile',
  },
};

/** Testnet ASA registry — only assets that exist on Algorand testnet */
const TESTNET_REGISTRY: Record<number, AssetMeta> = {
  0: {
    assetId: 0,
    coinGeckoId: 'algorand',
    symbol: 'ALGO',
    name: 'Algorand',
    decimals: 6,
    category: 'volatile',
  },
  10458941: {
    assetId: 10458941,
    coinGeckoId: 'usd-coin',
    symbol: 'USDC',
    name: 'USD Coin (Testnet)',
    decimals: 6,
    category: 'stablecoin',
  },
};

/** Active asset registry — automatically switches based on ALGORAND_NETWORK */
export const ASSET_REGISTRY: Record<number, AssetMeta> = isTestnet
  ? TESTNET_REGISTRY
  : MAINNET_REGISTRY;

/** All known CoinGecko IDs for batch fetching. */
export const ALL_COINGECKO_IDS = Object.values(ASSET_REGISTRY)
  .map((m) => m.coinGeckoId)
  .filter((id): id is string => id !== null);

/** Set of stablecoin ASA IDs for the current network */
export const STABLECOIN_ASA_IDS = new Set(
  Object.values(ASSET_REGISTRY)
    .filter((m) => m.category === 'stablecoin')
    .map((m) => m.assetId),
);

/**
 * Returns metadata for known assets, or a generic stub for unknown ones.
 */
export function getAssetMeta(assetId: number): AssetMeta {
  return (
    ASSET_REGISTRY[assetId] ?? {
      assetId,
      coinGeckoId: null,
      symbol: `ASA-${assetId}`,
      name: `Unknown ASA ${assetId}`,
      decimals: 0,
      category: 'volatile' as const,
    }
  );
}

/**
 * Reverse lookup: CoinGecko ID → ASA ID.
 */
export function getAssetIdByCoinGeckoId(coinGeckoId: string): number | undefined {
  for (const meta of Object.values(ASSET_REGISTRY)) {
    if (meta.coinGeckoId === coinGeckoId) return meta.assetId;
  }
  return undefined;
}
