/**
 * User Intelligence module routes — /api/v1/user/*
 * All routes require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { UserController } from './user.controller.js';

export function userRoutes(app: FastifyInstance) {
  const opts = { preHandler: [authenticate] };

  app.get('/api/v1/user/profile', opts, (req, reply) => UserController.getProfile(req, reply));
  app.put('/api/v1/user/profile', opts, (req, reply) => UserController.updateProfile(req, reply));
  app.post('/api/v1/user/onboarding', opts, (req, reply) =>
    UserController.submitOnboarding(req, reply),
  );
}
