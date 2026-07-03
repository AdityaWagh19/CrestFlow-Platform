/**
 * Risk Controller — Thin HTTP handlers.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { RiskService } from './risk.service.js';
import { UnauthorizedError } from '@crestflow/shared';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const RiskController = {
  async getRiskScore(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getRiskScore(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getMarketRisk(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getMarketRisk(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getLiquidationRisk(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getLiquidationRisk(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getConcentrationRisk(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getConcentrationRisk(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getAlerts(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as {
      status?: string;
      severity?: string;
      page?: string;
      pageSize?: string;
    };

    const data = await RiskService.getAlerts(userId, {
      status: query.status,
      severity: query.severity,
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '20', 10),
    });
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async dismissAlert(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const { id } = req.params as { id: string };
    const data = await RiskService.dismissAlert(id, userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
