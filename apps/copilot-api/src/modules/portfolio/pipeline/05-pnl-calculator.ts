/**
 * Step 5 — PnL Calculator
 * Computes unrealized/realized PnL, yield earned, fees paid.
 * Uses cost basis from DB and transaction history.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { AssetHolding, TransactionRecord, PriceData } from '@crestflow/shared';
import type { LpDecomposition } from './02-lp-decomposer.js';

export interface PnlResult {
  unrealizedPnlUsd: string;
  realizedPnlUsd: string;
  yieldEarnedUsd: string;
  feePaidUsd: string;
  impermanentLossUsd: string;
  netPnlUsd: string;
}

export interface CostBasisRecord {
  assetId: number;
  symbol: string;
  avgCostUsd: string;
  totalQuantity: string;
}

/**
 * Calculate PnL from holdings, cost basis records, transactions, and LP decompositions.
 */
export function calculatePnl(
  holdings: AssetHolding[],
  costBases: CostBasisRecord[],
  transactions: TransactionRecord[],
  decompositions: LpDecomposition[],
  prices: Record<number, PriceData>,
): PnlResult {
  // ── Unrealized PnL ──────────────────────────────────────────────────────
  // (currentPrice - avgCostBasis) * quantity for each holding
  let unrealizedPnl = new Decimal('0');

  const costBasisMap = new Map<number, CostBasisRecord>();
  for (const cb of costBases) {
    costBasisMap.set(cb.assetId, cb);
  }

  for (const h of holdings) {
    const cb = costBasisMap.get(h.assetId);
    if (cb) {
      const currentPrice = new Decimal(h.priceUsd);
      const avgCost = new Decimal(cb.avgCostUsd);
      const quantity = new Decimal(h.amountStandard);
      const pnl = currentPrice.minus(avgCost).mul(quantity);
      unrealizedPnl = unrealizedPnl.plus(pnl);
    }
  }

  // ── Realized PnL ────────────────────────────────────────────────────────
  // Simplified: set to "0" for MVP (requires full trade-by-trade tracking)
  const realizedPnl = new Decimal('0');

  // ── Yield Earned ────────────────────────────────────────────────────────
  // Simplified: estimate from Folks interest positions
  // Full implementation would track interest accrual over time
  const yieldEarned = new Decimal('0');

  // ── Transaction Fees ────────────────────────────────────────────────────
  let feePaid = new Decimal('0');
  const algoPrice = new Decimal(prices[0]?.priceUsd ?? '0');

  for (const tx of transactions) {
    // Fee is in microALGO as a string
    const feeAlgo = new Decimal(tx.fee);
    feePaid = feePaid.plus(feeAlgo.mul(algoPrice));
  }

  // ── Impermanent Loss ────────────────────────────────────────────────────
  let totalIL = new Decimal('0');
  for (const lp of decompositions) {
    totalIL = totalIL.plus(new Decimal(lp.ilUsd));
  }

  // ── Net PnL ─────────────────────────────────────────────────────────────
  const netPnl = unrealizedPnl.plus(realizedPnl).plus(yieldEarned).minus(feePaid).plus(totalIL); // IL is negative, so adding it subtracts

  return {
    unrealizedPnlUsd: toDecimalString(unrealizedPnl, 2),
    realizedPnlUsd: toDecimalString(realizedPnl, 2),
    yieldEarnedUsd: toDecimalString(yieldEarned, 2),
    feePaidUsd: toDecimalString(feePaid, 2),
    impermanentLossUsd: toDecimalString(totalIL, 2),
    netPnlUsd: toDecimalString(netPnl, 2),
  };
}
