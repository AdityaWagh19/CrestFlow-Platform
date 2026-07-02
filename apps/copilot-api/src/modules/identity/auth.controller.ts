import type { FastifyRequest, FastifyReply } from 'fastify';
import { authenticateWithGoogle, getUserById, triggerPortfolioScan } from './auth.service.js';
import { ValidationError } from '@crestflow/shared';

/**
 * POST /api/v1/auth/google
 * Verify Google id_token, create/find user, provision wallet, return JWT.
 */
export async function handleGoogleAuth(
  req: FastifyRequest<{ Body: { idToken?: string } }>,
  reply: FastifyReply,
) {
  const { idToken } = req.body ?? {};
  if (!idToken) {
    throw new ValidationError('idToken is required');
  }

  const result = await authenticateWithGoogle(idToken);

  return reply.status(200).send({
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      version: '1.0',
    },
  });
}

/**
 * GET /api/v1/auth/me
 * Return authenticated user's profile.
 */
export async function handleGetMe(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.userId;
  if (!userId) {
    throw new ValidationError('User ID not found in request');
  }

  const user = await getUserById(userId);

  return reply.status(200).send({
    success: true,
    data: user,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      version: '1.0',
    },
  });
}

/**
 * POST /api/v1/auth/logout
 * Client-side logout — clear token. Server-side: no-op in MVP (stateless JWT).
 * For forced invalidation, increment tokenVersion via admin API.
 */
export async function handleLogout(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({
    success: true,
    data: { message: 'Logged out successfully' },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: _req.id,
      version: '1.0',
    },
  });
}

/**
 * POST /api/v1/auth/trigger-portfolio-scan
 * Manually re-trigger portfolio scan for the authenticated user.
 */
export async function handleTriggerPortfolioScan(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.userId;
  if (!userId) {
    throw new ValidationError('User ID not found in request');
  }

  await triggerPortfolioScan(userId);

  return reply.status(202).send({
    success: true,
    data: { message: 'Portfolio scan triggered' },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      version: '1.0',
    },
  });
}
