/**
 * Portfolio Controller — Thin HTTP handlers.
 * No business logic — validate input, delegate to service, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { PortfolioService } from './portfolio.service.js';
import { UnauthorizedError, getPrisma, createLogger } from '@crestflow/shared';

const logger = createLogger('portfolio:controller');

/** Extract userId from authenticated request. */
function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const PortfolioController = {
  async getOverview(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await PortfolioService.getOverview(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getAllocation(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await PortfolioService.getAllocation(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getExposure(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await PortfolioService.getExposure(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getPerformance(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await PortfolioService.getPerformance(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getHealth(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await PortfolioService.getHealth(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getSnapshots(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize ?? '20', 10), 100);

    const data = await PortfolioService.getSnapshots(userId, page, pageSize);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async refresh(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);

    // Look up user's algorandAddress
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { algorandAddress: true },
    });

    if (!user?.algorandAddress) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'No Algorand wallet linked. Complete onboarding first.',
          requestId: req.id,
        },
      });
    }

    // Fire and forget — scan runs asynchronously
    PortfolioService.runScan(userId, user.algorandAddress, 'MANUAL').catch((err: unknown) => {
      logger.error({ err, userId }, 'background portfolio scan failed');
    });

    return reply.status(202).send({
      success: true,
      data: { message: 'Portfolio scan triggered', trigger: 'MANUAL' },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
