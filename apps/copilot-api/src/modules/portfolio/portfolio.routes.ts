/**
 * Portfolio module routes — /api/v1/portfolio/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { x402Gate } from '../../middleware/x402.js';
import { PortfolioController } from './portfolio.controller.js';

export function portfolioRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };
  const paidOpts = { preHandler: [authenticate, x402Gate] };

  app.get('/api/v1/portfolio/overview', opts, (req, reply) =>
    PortfolioController.getOverview(req, reply),
  );
  app.get('/api/v1/portfolio/allocation', opts, (req, reply) =>
    PortfolioController.getAllocation(req, reply),
  );
  app.get('/api/v1/portfolio/exposure', opts, (req, reply) =>
    PortfolioController.getExposure(req, reply),
  );
  app.get('/api/v1/portfolio/performance', opts, (req, reply) =>
    PortfolioController.getPerformance(req, reply),
  );
  app.get('/api/v1/portfolio/health', opts, (req, reply) =>
    PortfolioController.getHealth(req, reply),
  );
  app.get('/api/v1/portfolio/snapshots', opts, (req, reply) =>
    PortfolioController.getSnapshots(req, reply),
  );
  app.post('/api/v1/portfolio/refresh', paidOpts, (req, reply) =>
    PortfolioController.refresh(req, reply),
  );
}
