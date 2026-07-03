/**
 * Alert Repository
 * Manages RiskAlert lifecycle: create, resolve, dismiss, query.
 */

import { getPrisma, createLogger } from '@crestflow/shared';
import type { AlertCondition } from './alert-evaluator.js';

const logger = createLogger('risk:alerts');

export const AlertRepository = {
  /**
   * Process alert conditions: create new alerts, resolve cleared ones.
   * Returns counts of active and critical alerts.
   */
  async processAlerts(
    userId: string,
    conditions: AlertCondition[],
  ): Promise<{ activeCount: number; criticalCount: number }> {
    const prisma = getPrisma();
    const now = new Date();

    for (const condition of conditions) {
      try {
        // Find existing active alert of this type
        const existing = await prisma.riskAlert.findFirst({
          where: {
            userId,
            alertType: condition.alertType,
            status: 'ACTIVE',
          },
        });

        if (condition.isTriggered) {
          if (existing) {
            // Update lastSeenAt
            await prisma.riskAlert.update({
              where: { id: existing.id },
              data: { lastSeenAt: now },
            });
          } else {
            // Check if dismissed — don't recreate
            const dismissed = await prisma.riskAlert.findFirst({
              where: {
                userId,
                alertType: condition.alertType,
                status: 'DISMISSED',
              },
            });
            if (!dismissed) {
              await prisma.riskAlert.create({
                data: {
                  userId,
                  alertType: condition.alertType,
                  severity: condition.severity,
                  status: 'ACTIVE',
                  title: condition.title,
                  message: condition.message,
                  metadata: condition.metadata,
                  triggeredAt: now,
                  lastSeenAt: now,
                },
              });
            }
          }
        } else if (existing) {
          // Condition cleared — auto-resolve
          await prisma.riskAlert.update({
            where: { id: existing.id },
            data: { status: 'RESOLVED', resolvedAt: now },
          });
        }
      } catch (err: unknown) {
        logger.error({ err, alertType: condition.alertType }, 'alert upsert failed');
      }
    }

    // Count active alerts
    const activeCount = await prisma.riskAlert.count({
      where: { userId, status: 'ACTIVE' },
    });
    const criticalCount = await prisma.riskAlert.count({
      where: { userId, status: 'ACTIVE', severity: 'CRITICAL' },
    });

    return { activeCount, criticalCount };
  },

  /** Get alerts for a user with optional filters. */
  async getAlerts(
    userId: string,
    filters: { status?: string; severity?: string; page?: number; pageSize?: number },
  ) {
    const prisma = getPrisma();
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);

    const where: Record<string, unknown> = { userId };
    if (filters.status) where['status'] = filters.status;
    if (filters.severity) where['severity'] = filters.severity;

    const [alerts, total] = await Promise.all([
      prisma.riskAlert.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.riskAlert.count({ where }),
    ]);

    return { alerts, total, page };
  },

  /** Dismiss an alert. */
  async dismiss(alertId: string, userId: string): Promise<boolean> {
    const prisma = getPrisma();
    const alert = await prisma.riskAlert.findFirst({
      where: { id: alertId, userId, status: 'ACTIVE' },
    });

    if (!alert) return false;

    await prisma.riskAlert.update({
      where: { id: alertId },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
    return true;
  },
};
