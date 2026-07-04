/**
 * Audit module routes — /api/v1/audit/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { AuditController } from './audit.controller.js';

export function auditRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  app.get('/api/v1/audit/log', opts, (req, reply) => AuditController.getLog(req, reply));
  app.get('/api/v1/audit/log/:id', opts, (req, reply) => AuditController.getEntry(req, reply));
  app.get('/api/v1/audit/execution/:executionId', opts, (req, reply) =>
    AuditController.getExecutionAudit(req, reply),
  );
  app.get('/api/v1/audit/export', opts, (req, reply) => AuditController.exportLog(req, reply));
}
