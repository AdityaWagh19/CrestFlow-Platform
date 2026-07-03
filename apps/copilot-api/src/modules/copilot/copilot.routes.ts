/**
 * Copilot Routes — /api/v1/copilot/*
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthorizedError } from '@crestflow/shared';
import { CopilotService } from './copilot.service.js';

/** Extract userId from authenticated request. */
function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export function copilotRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  // POST /api/v1/copilot/query — non-streaming copilot query
  app.post('/api/v1/copilot/query', opts, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(req);
    const body = req.body as { message?: string };
    const message = body?.message?.trim();

    if (!message) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Request body must include a non-empty "message" field.',
          requestId: req.id,
        },
      });
    }

    if (message.length > 2000) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MESSAGE_TOO_LONG',
          message: 'Message must be 2000 characters or fewer.',
          requestId: req.id,
        },
      });
    }

    const result = await CopilotService.query(userId, message);
    return reply.send({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  });

  // GET /api/v1/copilot/history — session history
  app.get('/api/v1/copilot/history', opts, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(req);
    const data = await CopilotService.getHistory(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  });

  // POST /api/v1/copilot/reset — clear session
  app.post('/api/v1/copilot/reset', opts, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(req);
    await CopilotService.resetSession(userId);
    return reply.send({
      success: true,
      data: { message: 'Copilot session cleared' },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  });
}
