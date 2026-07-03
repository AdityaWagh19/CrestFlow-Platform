/**
 * Yield Opportunity Repository — read-only queries against YieldOpportunitySnapshot.
 * All writes happen in yield.service.ts via bulk create.
 */

import { getPrisma } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';

export interface YieldHistoryFilters {
  protocol?: string;
  assetSymbol?: string;
  goalProfile?: GoalProfile;
  page?: number;
  pageSize?: number;
}

export const YieldOpportunityRepository = {
  /**
   * Get the latest batch of yield opportunities for a user.
   * Optionally filtered by goal profile. Returns the most recent snapshot batch.
   */
  async getLatestForUser(
    userId: string,
    goalProfile?: GoalProfile,
    limit = 50,
  ): Promise<unknown[]> {
    const prisma = getPrisma();

    // Find the most recent createdAt timestamp for this user
    const latest = await prisma.yieldOpportunitySnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!latest) return [];

    return prisma.yieldOpportunitySnapshot.findMany({
      where: {
        userId,
        createdAt: latest.createdAt,
        ...(goalProfile ? { goalProfile } : {}),
      },
      orderBy: { topsisRank: 'asc' },
      take: limit,
    });
  },

  /**
   * Get a single yield opportunity snapshot by ID.
   */
  async getById(id: string): Promise<unknown> {
    const prisma = getPrisma();
    return await prisma.yieldOpportunitySnapshot.findUnique({
      where: { id },
    });
  },

  /**
   * Get historical yield opportunity snapshots with optional filters.
   */
  async getHistory(userId: string, filters: YieldHistoryFilters): Promise<unknown[]> {
    const prisma = getPrisma();
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);

    return await prisma.yieldOpportunitySnapshot.findMany({
      where: {
        userId,
        ...(filters.protocol ? { protocol: filters.protocol } : {}),
        ...(filters.assetSymbol ? { assetSymbol: filters.assetSymbol } : {}),
        ...(filters.goalProfile ? { goalProfile: filters.goalProfile } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  },
};
