/**
 * Execution module routes — /api/v1/execute/*
 * All routes require authentication. Paid routes also require x402 payment.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { x402Gate } from '../../middleware/x402.js';
import { ExecutionController } from './execution.controller.js';

export function executionRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };
  const paidOpts = { preHandler: [authenticate, x402Gate] };

  // x402-gated endpoints
  app.post('/api/v1/execute/plan', paidOpts, (req, reply) =>
    ExecutionController.planExecution(req, reply),
  );
  app.post('/api/v1/execute/submit', paidOpts, (req, reply) =>
    ExecutionController.submitExecution(req, reply),
  );
  app.post('/api/v1/execute/simulate', paidOpts, (req, reply) =>
    ExecutionController.simulateExecution(req, reply),
  );
  app.post('/api/v1/execute/autopilot/enable', paidOpts, (req, reply) =>
    ExecutionController.enableAutopilot(req, reply),
  );

  // Free endpoints
  app.get('/api/v1/execute/status/:executionId', opts, (req, reply) =>
    ExecutionController.getStatus(req, reply),
  );
  app.get('/api/v1/execute/history', opts, (req, reply) =>
    ExecutionController.getHistory(req, reply),
  );
  app.delete('/api/v1/execute/autopilot/disable', opts, (req, reply) =>
    ExecutionController.disableAutopilot(req, reply),
  );
}
