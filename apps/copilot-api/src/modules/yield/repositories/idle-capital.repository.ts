/**
 * Idle Capital Repository — queries and resolution of idle capital signals.
 */

import { getPrisma } from '@crestflow/shared';

export const IdleCapitalRepository = {
  /**
   * Get idle capital signals for a user.
   * @param userId User ID
   * @param resolved If provided, filters by resolved status. Defaults to unresolved (false).
   */
  async getForUser(userId: string, resolved?: boolean): Promise<unknown[]> {
    const prisma = getPrisma();
    return await prisma.idleCapitalSignal.findMany({
      where: {
        userId,
        resolved: resolved ?? false,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Mark an idle capital signal as resolved.
   */
  async resolve(signalId: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.idleCapitalSignal.update({
      where: { id: signalId },
      data: { resolved: true },
    });
  },
};
