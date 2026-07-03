/**
 * Asset Normalizer
 * Converts raw Algorand account data into canonical AssetHolding[] format.
 */

import { Decimal, fromMicroUnits, toDecimalString } from '@crestflow/shared';
import { getAssetMeta } from '../constants/asset-registry.js';
import type { AssetHolding, PriceData } from '@crestflow/shared';
import type { RawAlgorandAccount } from '../types/knowledge.types.js';

/**
 * Normalize raw Algorand account data into canonical AssetHolding[].
 * Enriches each holding with price data and USD value.
 */
export function normalizeAssetHoldings(
  rawAccount: RawAlgorandAccount,
  prices: Record<number, PriceData>,
): AssetHolding[] {
  const holdings: AssetHolding[] = [];

  // Native ALGO balance
  const algoMeta = getAssetMeta(0);
  const algoAmount = new Decimal(rawAccount.amount);
  const algoAmountStandard = fromMicroUnits(algoAmount, algoMeta.decimals);
  const algoPrice = new Decimal(prices[0]?.priceUsd ?? '0');
  const algoValue = algoAmountStandard.mul(algoPrice);

  holdings.push({
    assetId: 0,
    symbol: algoMeta.symbol,
    name: algoMeta.name,
    decimals: algoMeta.decimals,
    amount: toDecimalString(algoAmount, 0),
    amountStandard: toDecimalString(algoAmountStandard),
    priceUsd: toDecimalString(algoPrice),
    valueUsd: toDecimalString(algoValue, 2),
    category: algoMeta.category,
    source: 'native',
  });

  // ASA holdings
  for (const asa of rawAccount.assets) {
    const assetId = asa['asset-id'];
    const meta = getAssetMeta(assetId);
    const rawAmount = new Decimal(asa.amount);

    // Skip zero-balance opt-ins
    if (rawAmount.isZero()) continue;

    const decimals = meta.decimals || 0;
    const amountStandard = fromMicroUnits(rawAmount, decimals);
    const price = new Decimal(prices[assetId]?.priceUsd ?? '0');
    const value = amountStandard.mul(price);

    holdings.push({
      assetId,
      symbol: meta.symbol,
      name: meta.name,
      decimals,
      amount: toDecimalString(rawAmount, 0),
      amountStandard: toDecimalString(amountStandard),
      priceUsd: toDecimalString(price),
      valueUsd: toDecimalString(value, 2),
      category: meta.category,
      source: 'native',
    });
  }

  return holdings;
}
