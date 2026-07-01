import type { FastifyInstance } from 'fastify';
import {
  handleGoogleAuth,
  handleGetMe,
  handleLogout,
  handleTriggerPortfolioScan,
} from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

/**
 * Identity module routes — POST /api/v1/auth/*
 */
export function authRoutes(app: FastifyInstance) {
  // Public — Google OAuth sign-in
  app.post('/api/v1/auth/google', handleGoogleAuth);

  // Protected — requires valid JWT
  app.get('/api/v1/auth/me', { preHandler: [authenticate] }, handleGetMe);
  app.post('/api/v1/auth/logout', { preHandler: [authenticate] }, handleLogout);
  app.post(
    '/api/v1/auth/trigger-portfolio-scan',
    { preHandler: [authenticate] },
    handleTriggerPortfolioScan,
  );
}
