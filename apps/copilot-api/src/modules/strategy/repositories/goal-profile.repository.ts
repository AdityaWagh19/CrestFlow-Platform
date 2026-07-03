/**
 * Goal Profile Repository — mutable user preference.
 *
 * Each user has exactly one goal profile record. Defaults to MODERATE
 * on first access.
 */

import { getPrisma } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';

export const GoalProfileRepository = {
  /**
   * Get the user's goal profile, creating one with MODERATE default if it
   * does not exist.
   */
  async getOrCreate(userId: string) {
    const prisma = getPrisma();

    const existing = await prisma.userGoalProfile.findUnique({
      where: { userId },
    });

    if (existing) return existing;

    return prisma.userGoalProfile.create({
      data: {
        userId,
        goalProfile: 'MODERATE',
      },
    });
  },

  /** Update the user's goal profile. */
  async update(userId: string, goalProfile: GoalProfile) {
    const prisma = getPrisma();
    return await prisma.userGoalProfile.update({
      where: { userId },
      data: { goalProfile },
    });
  },
};
