/**
 * Audit Service — INSERT-only append-only audit log.
 * Fails silently to avoid blocking calling engines.
 * Audit failures must NEVER propagate to the user.
 */

import { getPrisma, createLogger } from '@crestflow/shared';

const logger = createLogger('audit');

export interface AuditEntryPayload {
  userId?: string;
  category: string;
  action: string;
  status?: string;
  sourceEngine?: string;
  relatedEntityId?: string;
  relatedTxId?: string;
  valueUsd?: string;
  assetSymbol?: string;
  protocol?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  kycStatus?: string;
  algorandAddress?: string;
}

export const AuditService = {
  /**
   * Write a single audit entry. INSERT-only.
   * Fails silently — logs error but never throws.
   */
  async write(payload: AuditEntryPayload): Promise<void> {
    try {
      const prisma = getPrisma();
      await prisma.auditEntry.create({
        data: {
          userId: payload.userId ?? null,
          category: payload.category,
          action: payload.action,
          status: payload.status ?? 'SUCCESS',
          sourceEngine: payload.sourceEngine ?? null,
          relatedEntityId: payload.relatedEntityId ?? null,
          relatedTxId: payload.relatedTxId ?? null,
          valueUsd: payload.valueUsd ?? null,
          assetSymbol: payload.assetSymbol ?? null,
          protocol: payload.protocol ?? null,
          metadata: payload.metadata,
          ipAddress: payload.ipAddress ?? null,
          userAgent: payload.userAgent ?? null,
          kycStatus: payload.kycStatus ?? null,
          algorandAddress: payload.algorandAddress ?? null,
        },
      });
      logger.debug({ category: payload.category, action: payload.action }, 'audit entry written');
    } catch (err: unknown) {
      logger.error(
        { err, category: payload.category, action: payload.action },
        'audit write failed — non-fatal',
      );
    }
  },

  /**
   * Bulk write audit entries. INSERT-only.
   * Fails silently.
   */
  async writeBatch(payloads: AuditEntryPayload[]): Promise<void> {
    if (payloads.length === 0) return;
    try {
      const prisma = getPrisma();
      await prisma.auditEntry.createMany({
        data: payloads.map((p) => ({
          userId: p.userId ?? null,
          category: p.category,
          action: p.action,
          status: p.status ?? 'SUCCESS',
          sourceEngine: p.sourceEngine ?? null,
          relatedEntityId: p.relatedEntityId ?? null,
          relatedTxId: p.relatedTxId ?? null,
          valueUsd: p.valueUsd ?? null,
          assetSymbol: p.assetSymbol ?? null,
          protocol: p.protocol ?? null,
          metadata: p.metadata,
          ipAddress: p.ipAddress ?? null,
          userAgent: p.userAgent ?? null,
          kycStatus: p.kycStatus ?? null,
          algorandAddress: p.algorandAddress ?? null,
        })),
      });
      logger.debug({ count: payloads.length }, 'audit batch written');
    } catch (err: unknown) {
      logger.error({ err, count: payloads.length }, 'audit batch write failed — non-fatal');
    }
  },
};
