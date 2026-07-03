/**
 * Risk Snapshot Repository — INSERT-only.
 * No update or delete methods exposed.
 */

import { getPrisma } from '@crestflow/shared';

export const RiskSnapshotRepository = {
  /** Get the most recent risk snapshot for a user. */
  getLatest(userId: string) {
    const prisma = getPrisma();
    return prisma.riskSnapshot.findFirst({
      where: { userId },
      orderBy: { analyzedAt: 'desc' },
    });
  },

  /** Get last N risk snapshots for history. */
  getHistory(userId: string, page: number, pageSize = 20) {
    const prisma = getPrisma();
    return prisma.riskSnapshot.findMany({
      where: { userId },
      orderBy: { analyzedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        analyzedAt: true,
        riskScore: true,
        riskLevel: true,
        activeAlertCount: true,
        insufficientHistory: true,
      },
    });
  },
};
