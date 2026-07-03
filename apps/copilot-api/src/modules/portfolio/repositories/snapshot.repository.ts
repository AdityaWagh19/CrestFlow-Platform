/**
 * Snapshot Repository — INSERT-only.
 * No update or delete methods exposed. Snapshots are immutable.
 */

import { getPrisma } from '@crestflow/shared';
import { Decimal, toDecimalString, safeDivide } from '@crestflow/shared';
import type { PerformanceResult } from '../pipeline/07-snapshot-writer.js';

export const SnapshotRepository = {
  /** Get the most recent snapshot for a user. */
  getLatest(userId: string) {
    const prisma = getPrisma();
    return prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
    });
  },

  /** Get snapshot from approximately N days ago (for performance calculation). */
  getSnapshotAtDaysAgo(userId: string, days: number) {
    const prisma = getPrisma();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    return prisma.portfolioSnapshot.findFirst({
      where: { userId, snapshotAt: { lte: targetDate } },
      orderBy: { snapshotAt: 'desc' },
    });
  },

  /** Paginated snapshot history. */
  getHistory(userId: string, page: number, pageSize = 20) {
    const prisma = getPrisma();
    return prisma.portfolioSnapshot.findMany({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        snapshotAt: true,
        totalValueUsd: true,
        healthScore: true,
        trigger: true,
        isPartial: true,
      },
    });
  },

  /** Count total snapshots for a user (for pagination). */
  count(userId: string): Promise<number> {
    const prisma = getPrisma();
    return prisma.portfolioSnapshot.count({ where: { userId } });
  },

  /**
   * Calculate performance returns by comparing current value with historical snapshots.
   */
  async calculatePerformance(
    userId: string,
    currentTotalValueUsd: string,
  ): Promise<PerformanceResult> {
    const [latest, snap7d, snap30d, snap90d, oldest] = await Promise.all([
      SnapshotRepository.getLatest(userId),
      SnapshotRepository.getSnapshotAtDaysAgo(userId, 7),
      SnapshotRepository.getSnapshotAtDaysAgo(userId, 30),
      SnapshotRepository.getSnapshotAtDaysAgo(userId, 90),
      SnapshotRepository.getSnapshotAtDaysAgo(userId, 36500), // ~100 years = "all time"
    ]);

    const currentValue = new Decimal(currentTotalValueUsd);

    const calcReturn = (pastSnapshot: { totalValueUsd: string } | null): string | null => {
      if (!pastSnapshot) return null;
      const pastValue = new Decimal(pastSnapshot.totalValueUsd);
      if (pastValue.isZero()) return null;
      return toDecimalString(safeDivide(currentValue.minus(pastValue), pastValue).mul(100), 4);
    };

    const previousValueUsd = latest?.totalValueUsd ?? null;
    let changeValueUsd: string | null = null;
    let changePercent: string | null = null;

    if (previousValueUsd) {
      const prevVal = new Decimal(previousValueUsd);
      changeValueUsd = toDecimalString(currentValue.minus(prevVal), 2);
      changePercent = prevVal.isZero()
        ? null
        : toDecimalString(safeDivide(currentValue.minus(prevVal), prevVal).mul(100), 4);
    }

    return {
      previousValueUsd,
      changeValueUsd,
      changePercent,
      return7d: calcReturn(snap7d),
      return30d: calcReturn(snap30d),
      return90d: calcReturn(snap90d),
      returnAllTime: calcReturn(oldest),
    };
  },
};
