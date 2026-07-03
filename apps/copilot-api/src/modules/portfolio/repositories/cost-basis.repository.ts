/**
 * Cost Basis Repository — UPSERT pattern.
 * Tracks weighted average cost per user+asset.
 */

import { getPrisma } from '@crestflow/shared';
import type { CostBasisRecord } from '../pipeline/05-pnl-calculator.js';

export const CostBasisRepository = {
  /** Get all cost basis records for a user. */
  async getAllForUser(userId: string): Promise<CostBasisRecord[]> {
    const prisma = getPrisma();
    const records = await prisma.assetCostBasis.findMany({
      where: { userId },
    });

    return records.map(
      (r: { assetId: number; symbol: string; avgCostUsd: string; totalQuantity: string }) => ({
        assetId: r.assetId,
        symbol: r.symbol,
        avgCostUsd: r.avgCostUsd,
        totalQuantity: r.totalQuantity,
      }),
    );
  },

  /** Upsert cost basis for a specific asset. Uses weighted average cost. */
  async upsert(
    userId: string,
    assetId: number,
    symbol: string,
    totalQuantity: string,
    totalCostUsd: string,
    avgCostUsd: string,
  ): Promise<void> {
    const prisma = getPrisma();
    await prisma.assetCostBasis.upsert({
      where: { userId_assetId: { userId, assetId } },
      create: {
        userId,
        assetId,
        symbol,
        totalQuantity,
        totalCostUsd,
        avgCostUsd,
        lastTxAt: new Date(),
      },
      update: {
        totalQuantity,
        totalCostUsd,
        avgCostUsd,
        lastTxAt: new Date(),
      },
    });
  },
};
