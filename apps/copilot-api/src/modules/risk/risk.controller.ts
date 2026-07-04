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

  async getHistory(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const query = req.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize ?? '20', 10), 100);
    const data = await RiskService.getHistory(userId, page, pageSize);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getExposure(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getExposure(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async simulate(req: FastifyRequest, reply: FastifyReply) {
    getUserId(req); // verify auth
    return reply.status(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Risk simulation is a P2 feature. Use the current risk analysis for now.',
        requestId: req.id,
      },
    });
  },

  async getReport(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await RiskService.getRiskScore(userId);
    return reply.send({
      success: true,
      data: { ...data, reportType: 'JSON', generatedAt: new Date().toISOString() },
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
