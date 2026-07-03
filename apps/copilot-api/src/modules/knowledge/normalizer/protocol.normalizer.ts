/**
 * Protocol Normalizer
 * Converts raw protocol position data into canonical ProtocolPosition[] format.
 */

import { Decimal, fromMicroUnits, toDecimalString, safeDivide } from '@crestflow/shared';
import { getAssetMeta } from '../constants/asset-registry.js';
import type { ProtocolPosition, PriceData } from '@crestflow/shared';
import type { RawFolksPosition, RawTinymanPool, RawPactPool } from '../types/knowledge.types.js';

/**
 * Normalize Folks Finance positions into canonical ProtocolPosition[].
 */
export function normalizeFolksPositions(
  rawPositions: RawFolksPosition[],
  prices: Record<number, PriceData>,
): ProtocolPosition[] {
  const positions: ProtocolPosition[] = [];

  for (const raw of rawPositions) {
    const meta = getAssetMeta(raw.assetId);
    const price = new Decimal(prices[raw.assetId]?.priceUsd ?? '0');

    // Supply position
    const depositAmount = new Decimal(raw.depositBalance);
    if (!depositAmount.isZero()) {
      const depositStandard = fromMicroUnits(depositAmount, meta.decimals);
      const depositValue = depositStandard.mul(price);

      positions.push({
        protocol: 'folks-finance',
        positionType: 'supply',
        assetSymbol: meta.symbol,
        marketId: String(raw.marketAppId),
        suppliedAmount: toDecimalString(depositStandard),
        valueUsd: toDecimalString(depositValue, 2),
        apyPercent: raw.depositInterestRate,
        healthFactor: raw.healthFactor,
        liquidationThreshold: raw.liquidationThreshold,
      });
    }

    // Borrow position
    const borrowAmount = new Decimal(raw.borrowBalance);
    if (!borrowAmount.isZero()) {
      const borrowStandard = fromMicroUnits(borrowAmount, meta.decimals);
      const borrowValue = borrowStandard.mul(price);

      positions.push({
        protocol: 'folks-finance',
        positionType: 'borrow',
        assetSymbol: meta.symbol,
        marketId: String(raw.marketAppId),
        borrowedAmount: toDecimalString(borrowStandard),
        valueUsd: toDecimalString(borrowValue, 2),
        apyPercent: raw.borrowInterestRate,
        healthFactor: raw.healthFactor,
        liquidationThreshold: raw.liquidationThreshold,
      });
    }
  }

  return positions;
}

/**
 * Normalize Tinyman LP positions into canonical ProtocolPosition[].
 */
export function normalizeTinymanPositions(
  lpPositions: { pool: RawTinymanPool; lpTokenAmount: string }[],
  prices: Record<number, PriceData>,
): ProtocolPosition[] {
  const positions: ProtocolPosition[] = [];

  for (const { pool, lpTokenAmount } of lpPositions) {
    const meta1 = getAssetMeta(pool.asset1Id);
    const meta2 = getAssetMeta(pool.asset2Id);
    const price1 = new Decimal(prices[pool.asset1Id]?.priceUsd ?? '0');
    const price2 = new Decimal(prices[pool.asset2Id]?.priceUsd ?? '0');

    const issuedLiquidity = new Decimal(pool.issuedLiquidity);
    const userLpAmount = new Decimal(lpTokenAmount);

    // Calculate ownership ratio: user_lp / total_issued
    const ownershipRatio = safeDivide(userLpAmount, issuedLiquidity);

    // User's share of each reserve
    const reserve1 = fromMicroUnits(new Decimal(pool.asset1Reserves), meta1.decimals);
    const reserve2 = fromMicroUnits(new Decimal(pool.asset2Reserves), meta2.decimals);
    const userShare1 = reserve1.mul(ownershipRatio);
    const userShare2 = reserve2.mul(ownershipRatio);

    // USD value of user's LP position
    const value1 = userShare1.mul(price1);
    const value2 = userShare2.mul(price2);
    const totalValue = value1.add(value2);

    positions.push({
      protocol: 'tinyman',
      positionType: 'lp',
      assetSymbol: meta1.symbol,
      pairSymbol: meta2.symbol,
      marketId: pool.address,
      lpTokenAmount: toDecimalString(userLpAmount, 0),
      valueUsd: toDecimalString(totalValue, 2),
    });
  }

  return positions;
}

/**
 * Normalize Pact LP positions into canonical ProtocolPosition[].
 */
export function normalizePactPositions(
  lpPositions: { pool: RawPactPool; lpTokenAmount: string }[],
  prices: Record<number, PriceData>,
): ProtocolPosition[] {
  const positions: ProtocolPosition[] = [];

  for (const { pool, lpTokenAmount } of lpPositions) {
    const meta1 = getAssetMeta(pool.primaryAssetId);
    const meta2 = getAssetMeta(pool.secondaryAssetId);
    const price1 = new Decimal(prices[pool.primaryAssetId]?.priceUsd ?? '0');
    const price2 = new Decimal(prices[pool.secondaryAssetId]?.priceUsd ?? '0');

    const issuedLiquidity = new Decimal(pool.issuedLiquidity);
    const userLpAmount = new Decimal(lpTokenAmount);

    // Calculate ownership ratio
    const ownershipRatio = safeDivide(userLpAmount, issuedLiquidity);

    // User's share of each reserve
    const reserve1 = fromMicroUnits(new Decimal(pool.primaryAssetReserves), meta1.decimals);
    const reserve2 = fromMicroUnits(new Decimal(pool.secondaryAssetReserves), meta2.decimals);
    const userShare1 = reserve1.mul(ownershipRatio);
    const userShare2 = reserve2.mul(ownershipRatio);

    // USD value
    const value1 = userShare1.mul(price1);
    const value2 = userShare2.mul(price2);
    const totalValue = value1.add(value2);

    positions.push({
      protocol: 'pact',
      positionType: 'lp',
      assetSymbol: meta1.symbol,
      pairSymbol: meta2.symbol,
      marketId: String(pool.appId),
      lpTokenAmount: toDecimalString(userLpAmount, 0),
      valueUsd: toDecimalString(totalValue, 2),
      apyPercent: pool.apr7d,
    });
  }

  return positions;
}
