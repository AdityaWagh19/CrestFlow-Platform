import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, getPrisma } from '@crestflow/shared';
import { verifyJwt } from '../lib/jwt.js';

/**
 * JWT authentication middleware.
 * Verifies the Bearer token, checks tokenVersion against the database,
 * and attaches userId to the request.
 */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token);
  if (!payload) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Verify tokenVersion matches (GAP-09: JWT revocation)
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    throw new UnauthorizedError('Token has been revoked');
  }

  req.userId = payload.sub;
}

// Extend Fastify request type for userId
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
