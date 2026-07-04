/**
 * KYC Controller — HTTP handlers for KYC, identity, on-ramp, off-ramp.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { KYCService } from './kyc.service.js';
import { VeriffClient } from './veriff.client.js';
import { UnauthorizedError } from '@crestflow/shared';

function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

export const KYCController = {
  async initiateKYC(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await KYCService.initiateKYC(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getStatus(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await KYCService.getStatus(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async veriffWebhook(req: FastifyRequest, reply: FastifyReply) {
    // Verify HMAC signature
    const signature = (req.headers['x-hmac-signature'] as string) ?? '';
    const rawBody = JSON.stringify(req.body);

    if (!VeriffClient.verifyWebhookSignature(rawBody, signature)) {
      return reply.status(401).send({ success: false, error: 'Invalid webhook signature' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    await KYCService.handleVeriffWebhook(
      body.verification?.id ?? body.sessionId,
      body.verification?.status ?? body.decision,
      body.verification?.vendorData ?? body.vendorData,
    );

    return reply.status(200).send({ success: true });
  },

  async getDID(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await KYCService.getDID(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async getVC(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const data = await KYCService.getVC(userId);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async initiateOnRamp(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as { fiatAmountInr: string; targetAsset: string };
    const data = await KYCService.initiateOnRamp(userId, body.fiatAmountInr, body.targetAsset);
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async onRampWebhook(req: FastifyRequest, reply: FastifyReply) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    await KYCService.handleOnRampWebhook(
      body.partnerOrderId ?? body.transactionId,
      body.status,
      body.cryptoAmount,
      body.blockchainTxId ?? body.algorandTxId,
    );
    return reply.status(200).send({ success: true });
  },

  async initiateOffRamp(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as { cryptoAmount: string; cryptoAsset: string; upiId: string };
    const data = await KYCService.initiateOffRamp(
      userId,
      body.cryptoAmount,
      body.cryptoAsset,
      body.upiId,
    );
    return reply.send({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async offRampWebhook(req: FastifyRequest, reply: FastifyReply) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    await KYCService.handleOffRampWebhook(
      body.partnerOrderId ?? body.transactionId,
      body.status,
      body.fiatAmountInr,
      body.providerTxId,
    );
    return reply.status(200).send({ success: true });
  },
};
