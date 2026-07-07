/**
 * Strategy module routes — /api/v1/strategy/*
 * All routes require authentication. Refresh is x402 gated.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { x402Gate } from '../../middleware/x402.js';
import { StrategyController } from './strategy.controller.js';

export function strategyRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };
  const paidOpts = { preHandler: [authenticate, x402Gate] };

  app.get('/api/v1/strategy/allocation', opts, (req, reply) =>
    StrategyController.getAllocation(req, reply),
  );
  app.get('/api/v1/strategy/rebalance', opts, (req, reply) =>
    StrategyController.getRebalance(req, reply),
  );
  app.get('/api/v1/strategy/explain', opts, (req, reply) =>
    StrategyController.getExplain(req, reply),
  );
  app.get('/api/v1/strategy/history', opts, (req, reply) =>
    StrategyController.getHistory(req, reply),
  );
  app.post('/api/v1/strategy/simulate', opts, (req, reply) =>
    StrategyController.simulate(req, reply),
  );
  app.put('/api/v1/strategy/goal', opts, (req, reply) => StrategyController.updateGoal(req, reply));
  app.post('/api/v1/strategy/refresh', paidOpts, (req, reply) =>
    StrategyController.refresh(req, reply),
  );
}
