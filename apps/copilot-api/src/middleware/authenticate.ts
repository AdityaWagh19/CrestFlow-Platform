import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '@crestflow/shared';

/**
 * JWT authentication middleware stub.
 * Full implementation in Plan 01 (Auth + Turnkey Onboarding).
 */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  // TODO (Plan 01): Verify JWT, extract userId, attach to request
  // const token = authHeader.slice(7);
  // const payload = await verifyJWT(token);
  // req.userId = payload.sub;
  await Promise.resolve(); // placeholder for async JWT verification
}

// Extend Fastify request type for userId
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
