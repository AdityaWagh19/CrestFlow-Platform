/**
 * Audit Controller — HTTP handlers for audit log queries.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPrisma, UnauthorizedError, NotFoundError } from '@crestflow/shared';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const AuditController = {
  /** GET /api/v1/audit/log — paginated audit log with filters. */
  async getLog(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const prisma = getPrisma();
    const query = req.query as {
      category?: string;
      status?: string;
      limit?: string;
      cursor?: string;
      from?: string;
      to?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? '50', 10), 100);
    const where: Record<string, unknown> = { userId };

    if (query.category) where['category'] = query.category;
    if (query.status) where['status'] = query.status;
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt['gte'] = new Date(query.from);
      if (query.to) createdAt['lte'] = new Date(query.to);
      where['createdAt'] = createdAt;
    }

    const entries = await prisma.auditEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra for cursor
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > limit;
    const results = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    const total = await prisma.auditEntry.count({ where });

    return reply.send({
      success: true,
      data: { entries: results, nextCursor, total },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  /** GET /api/v1/audit/log/:id — single audit entry. */
  async getEntry(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const prisma = getPrisma();
    const { id } = req.params as { id: string };

    const entry = await prisma.auditEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) throw new NotFoundError('Audit entry not found');

    return reply.send({
      success: true,
      data: entry,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  /** GET /api/v1/audit/execution/:executionId — all entries for an execution. */
  async getExecutionAudit(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const prisma = getPrisma();
    const { executionId } = req.params as { executionId: string };

    const entries = await prisma.auditEntry.findMany({
      where: { userId, relatedEntityId: executionId, category: 'EXECUTION' },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      success: true,
      data: { executionId, entries },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  /** GET /api/v1/audit/export — streaming JSONL export. */
  async exportLog(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const prisma = getPrisma();
    const query = req.query as { from?: string; to?: string; category?: string };

    const where: Record<string, unknown> = { userId };
    if (query.category && query.category !== 'all') where['category'] = query.category;
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt['gte'] = new Date(query.from);
      if (query.to) createdAt['lte'] = new Date(query.to);
      where['createdAt'] = createdAt;
    }

    const entries = await prisma.auditEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 10000, // safety cap
    });

    // Return as JSONL
    void reply.header('Content-Type', 'application/jsonl');
    const lines = entries.map((e: Record<string, unknown>) => JSON.stringify(e)).join('\n');
    return reply.send(lines);
  },
};
