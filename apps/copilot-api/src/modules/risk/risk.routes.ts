/**
 * Risk module routes — /api/v1/risk/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { RiskController } from './risk.controller.js';

export function riskRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  app.get('/api/v1/risk/score', opts, (req, reply) => RiskController.getRiskScore(req, reply));
  app.get('/api/v1/risk/market', opts, (req, reply) => RiskController.getMarketRisk(req, reply));
  app.get('/api/v1/risk/liquidation', opts, (req, reply) =>
    RiskController.getLiquidationRisk(req, reply),
  );
  app.get('/api/v1/risk/concentration', opts, (req, reply) =>
    RiskController.getConcentrationRisk(req, reply),
  );
  app.get('/api/v1/risk/alerts', opts, (req, reply) => RiskController.getAlerts(req, reply));
  app.get('/api/v1/risk/history', opts, (req, reply) => RiskController.getHistory(req, reply));
  app.get('/api/v1/risk/exposure', opts, (req, reply) => RiskController.getExposure(req, reply));
  app.post('/api/v1/risk/simulate', opts, (req, reply) => RiskController.simulate(req, reply));
  app.get('/api/v1/risk/report', opts, (req, reply) => RiskController.getReport(req, reply));
  app.patch('/api/v1/risk/alerts/:id/dismiss', opts, (req, reply) =>
    RiskController.dismissAlert(req, reply),
  );
}
