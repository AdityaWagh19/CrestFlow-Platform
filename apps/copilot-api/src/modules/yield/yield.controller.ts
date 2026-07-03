/**
 * Yield Controller — Thin HTTP handlers.
 * No business logic — validate input, delegate to YieldService, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';
import { YieldService } from './yield.service.js';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const YieldController = {
  async getOpportunities(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as { goalProfile?: GoalProfile; limit?: string };

    const data = await YieldService.getOpportunities(userId, {
      goalProfile: query.goalProfile,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });

    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getRankings(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as { mode?: string; limit?: string };

    const mode = query.mode ?? 'topsis';
    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    const data = await YieldService.getRankings(userId, mode, limit);

    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getIdleCapital(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);

    const data = await YieldService.getIdleCapital(userId);

    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getOpportunityById(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const { id } = req.params as { id: string };

    const data = await YieldService.getOpportunityById(userId, id);

    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getHistory(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as {
      protocol?: string;
      assetSymbol?: string;
      goalProfile?: GoalProfile;
      page?: string;
      pageSize?: string;
    };

    const data = await YieldService.getHistory(userId, {
      protocol: query.protocol,
      assetSymbol: query.assetSymbol,
      goalProfile: query.goalProfile,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
