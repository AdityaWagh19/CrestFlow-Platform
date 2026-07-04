/**
 * KYC, Identity, On-ramp, Off-ramp routes.
 * KYC/Identity endpoints require auth. Webhooks are public.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { KYCController } from './kyc.controller.js';

export function kycRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate] };

  // KYC
  app.post('/api/v1/kyc/initiate', auth, (req, reply) => KYCController.initiateKYC(req, reply));
  app.get('/api/v1/kyc/status', auth, (req, reply) => KYCController.getStatus(req, reply));
  app.post('/api/v1/kyc/webhook', (req, reply) => KYCController.veriffWebhook(req, reply)); // public

  // Identity
  app.get('/api/v1/identity/did', auth, (req, reply) => KYCController.getDID(req, reply));
  app.get('/api/v1/identity/vc', auth, (req, reply) => KYCController.getVC(req, reply));

  // On-ramp
  app.post('/api/v1/onramp/initiate', auth, (req, reply) =>
    KYCController.initiateOnRamp(req, reply),
  );
  app.post('/api/v1/onramp/webhook', (req, reply) => KYCController.onRampWebhook(req, reply)); // public

  // Off-ramp
  app.post('/api/v1/offramp/initiate', auth, (req, reply) =>
    KYCController.initiateOffRamp(req, reply),
  );
  app.post('/api/v1/offramp/webhook', (req, reply) => KYCController.offRampWebhook(req, reply)); // public
}
