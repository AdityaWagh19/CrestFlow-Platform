/**
 * Execution Controller — Thin HTTP handlers.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { ExecutionService } from './execution.service.js';
import { UnauthorizedError } from '@crestflow/shared';
import type { ActionInput } from './poa.builder.js';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const ExecutionController = {
  async planExecution(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as {
      sourceEventType: string;
      sourceEventId: string;
      actions: ActionInput[];
    };
    const data = await ExecutionService.planExecution(userId, body);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async submitExecution(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as { executionId: string };
    const data = await ExecutionService.submitExecution(userId, body.executionId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getStatus(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const { executionId } = req.params as { executionId: string };
    const data = await ExecutionService.getStatus(userId, executionId);
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
    const data = await ExecutionService.getHistory(userId, page, pageSize);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async enableAutopilot(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await ExecutionService.enableAutopilot(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async disableAutopilot(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await ExecutionService.disableAutopilot(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
