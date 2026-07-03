/**
 * Unified Price Service
 * Single source of pricing for all engines.
 *
 * Priority: Gora Oracle first (for execution-safe prices), falls back to CoinGecko.
 * In this plan, Gora always returns null so CoinGecko is always used.
 */

import { CoinGeckoAdapter } from '../adapters/coingecko.adapter.js';
import { GoraOracleAdapter } from '../adapters/gora-oracle.adapter.js';
import { getAssetMeta } from '../constants/asset-registry.js';
import { createLogger } from '@crestflow/shared';
import type { PriceData } from '@crestflow/shared';

const logger = createLogger('knowledge:price');

export const PriceService = {
  /**
   * Fetch prices for a list of ASA IDs.
   * Tries Gora (null currently), falls back to CoinGecko.
   * Returns a map from ASA ID to PriceData.
   */
  async getPricesForAssets(assetIds: number[]): Promise<Record<number, PriceData>> {
    const result: Record<number, PriceData> = {};

    // Collect CoinGecko IDs for known assets
    const cgIdToAssetId: Record<string, number> = {};
    const unknownAssets: number[] = [];

    for (const id of assetIds) {
      const meta = getAssetMeta(id);
      if (meta.coinGeckoId) {
        cgIdToAssetId[meta.coinGeckoId] = id;
      } else {
        unknownAssets.push(id);
      }
    }

    // Try Gora first (will return empty in this plan)
    if (GoraOracleAdapter.isAvailable()) {
      const goraPrices = GoraOracleAdapter.getPrices(assetIds);
      for (const [idStr, price] of Object.entries(goraPrices)) {
        if (price) {
          const assetId = parseInt(idStr, 10);
          const meta = getAssetMeta(assetId);
          result[assetId] = {
            assetId,
            symbol: meta.symbol,
            priceUsd: price.priceUsd,
            change24hPercent: '0',
            lastUpdatedAt: new Date(price.timestamp * 1000).toISOString(),
          };
          // Skip this asset in CoinGecko batch since Gora provided it
          if (meta.coinGeckoId && meta.coinGeckoId in cgIdToAssetId) {
            cgIdToAssetId[meta.coinGeckoId] = -1; // mark as resolved
          }
        }
      }
    }

    // Fetch remaining from CoinGecko in one batched call
    const remainingCgIds = Object.entries(cgIdToAssetId)
      .filter(([, assetId]) => assetId >= 0)
      .map(([cgId]) => cgId);
    if (remainingCgIds.length > 0) {
      try {
        const cgPrices = await CoinGeckoAdapter.getPrices(remainingCgIds);

        for (const [cgId, rawPrice] of Object.entries(cgPrices)) {
          const assetId = cgIdToAssetId[cgId];
          if (assetId === undefined) continue;

          const meta = getAssetMeta(assetId);
          result[assetId] = {
            assetId,
            symbol: meta.symbol,
            priceUsd: String(rawPrice.usd ?? '0'),
            change24hPercent: String(rawPrice.usd_24h_change ?? '0'),
            marketCapUsd:
              rawPrice.usd_market_cap != null ? String(rawPrice.usd_market_cap) : undefined,
            volume24hUsd: rawPrice.usd_24h_vol != null ? String(rawPrice.usd_24h_vol) : undefined,
            lastUpdatedAt: rawPrice.last_updated_at
              ? new Date(rawPrice.last_updated_at * 1000).toISOString()
              : new Date().toISOString(),
          };
        }
      } catch (err) {
        logger.error({ err }, 'CoinGecko price fetch failed — assets will have price "0"');
      }
    }

    // Unknown assets — no price available
    for (const id of unknownAssets) {
      if (!(id in result)) {
        result[id] = {
          assetId: id,
          symbol: getAssetMeta(id).symbol,
          priceUsd: '0',
          change24hPercent: '0',
          lastUpdatedAt: new Date().toISOString(),
        };
      }
    }

    // Fill in any missing assets that weren't returned by CoinGecko
    for (const id of assetIds) {
      if (!(id in result)) {
        result[id] = {
          assetId: id,
          symbol: getAssetMeta(id).symbol,
          priceUsd: '0',
          change24hPercent: '0',
          lastUpdatedAt: new Date().toISOString(),
        };
      }
    }

    logger.debug(
      { assetCount: assetIds.length, pricedCount: Object.keys(result).length },
      'prices resolved',
    );

    return result;
  },

  /**
   * Get the price for a single asset.
   */
  async getPriceForAsset(assetId: number): Promise<PriceData> {
    const prices = await PriceService.getPricesForAssets([assetId]);
    return (
      prices[assetId] ?? {
        assetId,
        symbol: getAssetMeta(assetId).symbol,
        priceUsd: '0',
        change24hPercent: '0',
        lastUpdatedAt: new Date().toISOString(),
      }
    );
  },
};
