/**
 * Price Normalizer
 * Converts raw CoinGecko price data into canonical PriceData[] format.
 *
 * Note: Most price normalization happens directly in PriceService.
 * This module provides utility functions for price-related transformations.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { PriceData } from '@crestflow/shared';

/**
 * Compute USD value from amount and price, both as decimal strings.
 */
export function computeUsdValue(amountStandard: string, priceUsd: string): string {
  const amount = new Decimal(amountStandard);
  const price = new Decimal(priceUsd);
  return toDecimalString(amount.mul(price), 2);
}

/**
 * Check if a price is stale (older than maxAgeSeconds).
 * Used by Engine 6 to reject stale prices before execution.
 */
export function isPriceStale(priceData: PriceData, maxAgeSeconds: number): boolean {
  const lastUpdated = new Date(priceData.lastUpdatedAt).getTime();
  const now = Date.now();
  return now - lastUpdated > maxAgeSeconds * 1000;
}

/**
 * Filter prices to only those that are fresh (within maxAgeSeconds).
 */
export function filterFreshPrices(
  prices: Record<number, PriceData>,
  maxAgeSeconds: number,
): Record<number, PriceData> {
  const fresh: Record<number, PriceData> = {};
  for (const [idStr, price] of Object.entries(prices)) {
    if (!isPriceStale(price, maxAgeSeconds)) {
      fresh[parseInt(idStr, 10)] = price;
    }
  }
  return fresh;
}
