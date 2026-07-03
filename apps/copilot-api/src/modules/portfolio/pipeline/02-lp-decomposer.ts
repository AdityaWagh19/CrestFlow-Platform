/**
 * Step 2 — LP Decomposer + Impermanent Loss
 * Decomposes LP tokens into underlying asset amounts via ownership ratio.
 * Calculates IL using the formula: IL = 2*sqrt(k) / (1+k) - 1
 */

import { Decimal, fromMicroUnits, toDecimalString, safeDivide } from '@crestflow/shared';
import { getAssetMeta } from '../../knowledge/knowledge.module.js';
import type { RawTinymanPool, RawPactPool } from '../../knowledge/knowledge.module.js';
import type { PriceData } from '@crestflow/shared';

export interface LpDecomposition {
  lpTokenAssetId: number;
  protocol: 'tinyman' | 'pact';
  asset1Id: number;
  asset2Id: number;
  asset1Symbol: string;
  asset2Symbol: string;
  asset1Amount: string; // DECIMAL string — underlying amount (standard units)
  asset2Amount: string; // DECIMAL string
  asset1ValueUsd: string; // DECIMAL string
  asset2ValueUsd: string; // DECIMAL string
  totalValueUsd: string; // DECIMAL string
  ownershipPercent: string; // DECIMAL string
  ilPercent: string; // DECIMAL string (negative = loss)
  ilUsd: string; // DECIMAL string
}

/**
 * Decompose all LP positions into underlying assets.
 */
export function decomposeLpPositions(
  tinymanPositions: { pool: RawTinymanPool; lpTokenAmount: string }[],
  pactPositions: { pool: RawPactPool; lpTokenAmount: string }[],
  prices: Record<number, PriceData>,
): LpDecomposition[] {
  const decompositions: LpDecomposition[] = [];

  for (const { pool, lpTokenAmount } of tinymanPositions) {
    decompositions.push(decomposeTinymanLp(pool, lpTokenAmount, prices));
  }

  for (const { pool, lpTokenAmount } of pactPositions) {
    decompositions.push(decomposePactLp(pool, lpTokenAmount, prices));
  }

  return decompositions;
}

function decomposeTinymanLp(
  pool: RawTinymanPool,
  lpTokenAmount: string,
  prices: Record<number, PriceData>,
): LpDecomposition {
  const meta1 = getAssetMeta(pool.asset1Id);
  const meta2 = getAssetMeta(pool.asset2Id);

  const userLp = new Decimal(lpTokenAmount);
  const totalLp = new Decimal(pool.issuedLiquidity);
  const ownershipRatio = safeDivide(userLp, totalLp);

  const reserve1 = fromMicroUnits(new Decimal(pool.asset1Reserves), meta1.decimals);
  const reserve2 = fromMicroUnits(new Decimal(pool.asset2Reserves), meta2.decimals);

  const asset1Amount = reserve1.mul(ownershipRatio);
  const asset2Amount = reserve2.mul(ownershipRatio);

  const price1 = new Decimal(prices[pool.asset1Id]?.priceUsd ?? '0');
  const price2 = new Decimal(prices[pool.asset2Id]?.priceUsd ?? '0');

  const asset1Value = asset1Amount.mul(price1);
  const asset2Value = asset2Amount.mul(price2);
  const totalValue = asset1Value.add(asset2Value);

  return {
    lpTokenAssetId: pool.lpTokenAssetId,
    protocol: 'tinyman',
    asset1Id: pool.asset1Id,
    asset2Id: pool.asset2Id,
    asset1Symbol: meta1.symbol,
    asset2Symbol: meta2.symbol,
    asset1Amount: toDecimalString(asset1Amount),
    asset2Amount: toDecimalString(asset2Amount),
    asset1ValueUsd: toDecimalString(asset1Value, 2),
    asset2ValueUsd: toDecimalString(asset2Value, 2),
    totalValueUsd: toDecimalString(totalValue, 2),
    ownershipPercent: toDecimalString(ownershipRatio.mul(100), 4),
    ilPercent: '0.00000000', // entry price not tracked yet — deferred
    ilUsd: '0.00',
  };
}

function decomposePactLp(
  pool: RawPactPool,
  lpTokenAmount: string,
  prices: Record<number, PriceData>,
): LpDecomposition {
  const meta1 = getAssetMeta(pool.primaryAssetId);
  const meta2 = getAssetMeta(pool.secondaryAssetId);

  const userLp = new Decimal(lpTokenAmount);
  const totalLp = new Decimal(pool.issuedLiquidity);
  const ownershipRatio = safeDivide(userLp, totalLp);

  const reserve1 = fromMicroUnits(new Decimal(pool.primaryAssetReserves), meta1.decimals);
  const reserve2 = fromMicroUnits(new Decimal(pool.secondaryAssetReserves), meta2.decimals);

  const asset1Amount = reserve1.mul(ownershipRatio);
  const asset2Amount = reserve2.mul(ownershipRatio);

  const price1 = new Decimal(prices[pool.primaryAssetId]?.priceUsd ?? '0');
  const price2 = new Decimal(prices[pool.secondaryAssetId]?.priceUsd ?? '0');

  const asset1Value = asset1Amount.mul(price1);
  const asset2Value = asset2Amount.mul(price2);
  const totalValue = asset1Value.add(asset2Value);

  return {
    lpTokenAssetId: pool.lpTokenAssetId,
    protocol: 'pact',
    asset1Id: pool.primaryAssetId,
    asset2Id: pool.secondaryAssetId,
    asset1Symbol: meta1.symbol,
    asset2Symbol: meta2.symbol,
    asset1Amount: toDecimalString(asset1Amount),
    asset2Amount: toDecimalString(asset2Amount),
    asset1ValueUsd: toDecimalString(asset1Value, 2),
    asset2ValueUsd: toDecimalString(asset2Value, 2),
    totalValueUsd: toDecimalString(totalValue, 2),
    ownershipPercent: toDecimalString(ownershipRatio.mul(100), 4),
    ilPercent: '0.00000000', // entry price not tracked yet — deferred
    ilUsd: '0.00',
  };
}

/**
 * Impermanent Loss Formula:
 *   IL = 2*sqrt(k) / (1 + k) - 1
 *   where k = currentPriceRatio / entryPriceRatio
 *
 * IL = 0 means no loss. IL = -0.0572 means 5.72% loss vs holding.
 * Symmetric: k=4 and k=0.25 both yield the same IL.
 *
 * Note: Currently unused as entry prices are not tracked.
 * Will be wired when tx history parsing is implemented.
 */
export function calculateImpermanentLoss(
  currentPriceRatio: string,
  entryPriceRatio: string,
): string {
  const current = new Decimal(currentPriceRatio);
  const entry = new Decimal(entryPriceRatio);

  if (entry.isZero()) return '0.00000000';

  const k = current.div(entry);
  const sqrtK = k.sqrt();
  const il = sqrtK.mul(2).div(k.plus(1)).minus(1);
  return toDecimalString(il);
}
