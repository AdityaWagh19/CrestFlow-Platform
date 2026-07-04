/**
 * Execution module routes — /api/v1/execute/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { ExecutionController } from './execution.controller.js';

export function executionRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  app.post('/api/v1/execute/plan', opts, (req, reply) =>
    ExecutionController.planExecution(req, reply),
  );
  app.post('/api/v1/execute/submit', opts, (req, reply) =>
    ExecutionController.submitExecution(req, reply),
  );
  app.get('/api/v1/execute/status/:executionId', opts, (req, reply) =>
    ExecutionController.getStatus(req, reply),
  );
  app.get('/api/v1/execute/history', opts, (req, reply) =>
    ExecutionController.getHistory(req, reply),
  );
  app.post('/api/v1/execute/autopilot/enable', opts, (req, reply) =>
    ExecutionController.enableAutopilot(req, reply),
  );
  app.delete('/api/v1/execute/autopilot/disable', opts, (req, reply) =>
    ExecutionController.disableAutopilot(req, reply),
  );
}
