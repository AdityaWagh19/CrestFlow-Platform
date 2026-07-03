/**
 * Asset registry — maps Algorand ASA IDs to CoinGecko IDs and metadata.
 * Used by price service to batch-fetch prices and by normalizer to enrich holdings.
 */

export interface AssetMeta {
  assetId: number;
  coinGeckoId: string | null; // null = not on CoinGecko
  symbol: string;
  name: string;
  decimals: number;
  category: 'volatile' | 'stablecoin';
}

/**
 * Core Algorand ecosystem assets.
 * ASA ID 0 = native ALGO (convention used across the platform).
 */
export const ASSET_REGISTRY: Record<number, AssetMeta> = {
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

/** All known CoinGecko IDs for batch fetching. */
export const ALL_COINGECKO_IDS = Object.values(ASSET_REGISTRY)
  .map((m) => m.coinGeckoId)
  .filter((id): id is string => id !== null);

/**
 * Returns metadata for known assets, or a generic stub for unknown ones.
 * Unknown assets get `coinGeckoId: null` — their price will be "0".
 */
export function getAssetMeta(assetId: number): AssetMeta {
  return (
    ASSET_REGISTRY[assetId] ?? {
      assetId,
      coinGeckoId: null,
      symbol: `ASA-${assetId}`,
      name: `Unknown ASA ${assetId}`,
      decimals: 0, // dynamically fetched from Indexer when needed
      category: 'volatile' as const,
    }
  );
}

/**
 * Reverse lookup: CoinGecko ID → ASA ID.
 * Returns undefined for unknown CoinGecko IDs.
 */
export function getAssetIdByCoinGeckoId(coinGeckoId: string): number | undefined {
  for (const meta of Object.values(ASSET_REGISTRY)) {
    if (meta.coinGeckoId === coinGeckoId) return meta.assetId;
  }
  return undefined;
}
