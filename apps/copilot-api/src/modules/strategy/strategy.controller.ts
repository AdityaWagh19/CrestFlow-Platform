/**
 * Strategy Controller — Thin HTTP handlers.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { StrategyService } from './strategy.service.js';
import { UnauthorizedError } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const StrategyController = {
  async getAllocation(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await StrategyService.getAllocation(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getRebalance(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await StrategyService.getRebalance(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getExplain(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await StrategyService.getExplain(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getGoal(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await StrategyService.getGoalProfile(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async updateGoal(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as { goalProfile: GoalProfile };

    if (
      !body.goalProfile ||
      !['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].includes(body.goalProfile)
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_GOAL_PROFILE',
          message: 'goalProfile must be CONSERVATIVE, MODERATE, or AGGRESSIVE',
          requestId: req.id,
        },
      });
    }

    const data = await StrategyService.updateGoalProfile(userId, body.goalProfile);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async refresh(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    await StrategyService.refresh(userId);
    return reply.status(202).send({
      success: true,
      data: { message: 'Strategy recompute queued' },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getHistory(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize ?? '20', 10), 100);
    const data = await StrategyService.getHistory(userId, page, pageSize);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
