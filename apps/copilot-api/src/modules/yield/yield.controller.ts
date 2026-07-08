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

  async getUpgrades(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await YieldService.getUpgrades(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async simulate(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as { opportunityId?: string; deployAmountUsd?: string };
    const deployAmount = body?.deployAmountUsd ?? '1000';

    // Get the opportunity if specified
    let opportunity = null;
    if (body?.opportunityId) {
      opportunity = await YieldService.getOpportunityById(userId, body.opportunityId).catch(
        () => null,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const netApy = (opportunity as any)?.netApyPercent ?? '5.00';
    const apyDecimal = new (await import('@crestflow/shared')).Decimal(netApy).div(100);
    const deployDecimal = new (await import('@crestflow/shared')).Decimal(deployAmount);
    const projectedYield = deployDecimal.mul(apyDecimal);

    return reply.send({
      success: true,
      data: {
        opportunityId: body?.opportunityId ?? null,
        deployAmountUsd: deployAmount,
        projectedAnnualYieldUsd: projectedYield.toFixed(2),
        projectedNetApyPercent: netApy,
        breakEvenDays: projectedYield.gt(0)
          ? Math.ceil(365 / apyDecimal.mul(365).toNumber())
          : null,
        note: 'Projection based on current APY. Actual returns may vary.',
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
