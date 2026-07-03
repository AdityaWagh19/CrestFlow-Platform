/**
 * Yield module routes — /api/v1/yield/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { YieldController } from './yield.controller.js';

export function yieldRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  app.get('/api/v1/yield/opportunities', opts, (req, reply) =>
    YieldController.getOpportunities(req, reply),
  );
  app.get('/api/v1/yield/rankings', opts, (req, reply) => YieldController.getRankings(req, reply));
  app.get('/api/v1/yield/idle', opts, (req, reply) => YieldController.getIdleCapital(req, reply));
  app.get('/api/v1/yield/opportunity/:id', opts, (req, reply) =>
    YieldController.getOpportunityById(req, reply),
  );
  app.get('/api/v1/yield/history', opts, (req, reply) => YieldController.getHistory(req, reply));
}
