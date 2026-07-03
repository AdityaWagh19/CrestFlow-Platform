/**
 * Strategy Snapshot Repository — INSERT-only.
 * No update or delete methods exposed.
 */

import { getPrisma } from '@crestflow/shared';

export const StrategySnapshotRepository = {
  /** Get the most recent strategy snapshot for a user. */
  getLatest(userId: string) {
    const prisma = getPrisma();
    return prisma.strategySnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Get paginated strategy snapshot history for a user. */
  getHistory(userId: string, page: number, pageSize = 20) {
    const prisma = getPrisma();
    return prisma.strategySnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        model: true,
        goalProfile: true,
        defensiveMode: true,
        rebalanceRequired: true,
        maxDeviationPercent: true,
        momentumOverlayApplied: true,
      },
    });
  },

  /** Count total strategy snapshots for a user. */
  count(userId: string) {
    const prisma = getPrisma();
    return prisma.strategySnapshot.count({
      where: { userId },
    });
  },
};
