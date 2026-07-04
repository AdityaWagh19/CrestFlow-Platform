/**
 * KYC Service — manages verification flow, identity issuance, on-ramp, off-ramp.
 */

import { createLogger, getPrisma, NotFoundError } from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { VeriffClient } from './veriff.client.js';
import { GoPlausibleClient } from './goplausible.client.js';
import { KYCEvents } from './kyc.events.js';

const logger = createLogger('kyc:service');

export const KYCService = {
  /** Initiate KYC session via Veriff. */
  async initiateKYC(userId: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, kycStatus: true },
    });

    if (user.kycStatus === 'APPROVED') {
      return { alreadyApproved: true, sessionUrl: null, sessionId: null };
    }

    const priorAttempts: number = await prisma.kYCApplication.count({ where: { userId } });

    const session = await VeriffClient.createSession({
      person: { fullName: user.name ?? '', email: user.email },
      vendorData: userId,
    });

    await prisma.kYCApplication.create({
      data: {
        userId,
        status: 'PENDING',
        provider: 'veriff',
        providerSessionId: session.sessionId,
        attemptNumber: priorAttempts + 1,
      },
    });

    eventBus.emit(KYCEvents.KYC_INITIATED, { userId, sessionId: session.sessionId });
    logger.info({ userId, sessionId: session.sessionId }, 'KYC session created');

    return { alreadyApproved: false, sessionUrl: session.url, sessionId: session.sessionId };
  },

  /** Get KYC status + application history. */
  async getStatus(userId: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true, didId: true, vcId: true },
    });

    const applications = await prisma.kYCApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return { kycStatus: user.kycStatus, didId: user.didId, vcId: user.vcId, applications };
  },

  /** Handle Veriff webhook. */
  async handleVeriffWebhook(sessionId: string, decision: string, vendorData: string) {
    const prisma = getPrisma();
    const userId = vendorData;

    const application = await prisma.kYCApplication.findFirst({
      where: { providerSessionId: sessionId },
    });

    if (!application) {
      logger.warn({ sessionId }, 'webhook for unknown session');
      return;
    }

    const statusMap: Record<string, string> = {
      approved: 'APPROVED',
      declined: 'DECLINED',
      resubmission_requested: 'RESUBMISSION_REQUESTED',
      expired: 'EXPIRED',
    };
    const kycStatus = statusMap[decision] ?? 'PENDING';

    await prisma.$transaction([
      prisma.kYCApplication.update({
        where: { id: application.id },
        data: { status: kycStatus, providerDecision: decision, decidedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { kycStatus },
      }),
    ]);

    logger.info({ userId, decision, kycStatus }, 'Veriff webhook processed');

    if (kycStatus === 'APPROVED') {
      eventBus.emit(KYCEvents.KYC_APPROVED, { userId });
      await KYCService.issueIdentity(userId);
    } else {
      eventBus.emit(KYCEvents.KYC_DECLINED, { userId, decision });
    }
  },

  /** Issue GoPlausible DID + KYC VC after approval. */
  async issueIdentity(userId: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { algorandAddress: true },
    });

    if (!user.algorandAddress) {
      logger.error({ userId }, 'cannot issue identity — no Algorand address');
      return;
    }

    try {
      const did = await GoPlausibleClient.createDID({ algorandAddress: user.algorandAddress });
      const vc = await GoPlausibleClient.issueKYCCredential({
        did: did.id,
        claims: { kycVerified: true, provider: 'veriff', tier: 'TIER_1' },
      });

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { didId: did.id, vcId: vc.id },
        }),
        prisma.identityRecord.create({
          data: { userId, did: did.id, vcId: vc.id, vcJwt: vc.jwt, kycTier: 'TIER_1' },
        }),
      ]);

      eventBus.emit(KYCEvents.IDENTITY_ISSUED, { userId, did: did.id, vcId: vc.id });
      logger.info({ userId, did: did.id }, 'identity issued');
    } catch (err: unknown) {
      logger.error({ err, userId }, 'identity issuance failed — KYC remains approved');
    }
  },

  /** Get DID for a user. */
  async getDID(userId: string) {
    const prisma = getPrisma();
    const record = await prisma.identityRecord.findUnique({ where: { userId } });
    if (!record) throw new NotFoundError('No DID issued yet. Complete KYC first.');
    return { did: record.did, kycTier: record.kycTier, country: record.country };
  },

  /** Get VC for a user. */
  async getVC(userId: string) {
    const prisma = getPrisma();
    const record = await prisma.identityRecord.findUnique({ where: { userId } });
    if (!record) throw new NotFoundError('No VC issued yet. Complete KYC first.');
    return { vcId: record.vcId, kycTier: record.kycTier };
  },

  /** Initiate on-ramp (INR → crypto). */
  async initiateOnRamp(userId: string, fiatAmountInr: string, targetAsset: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true, algorandAddress: true },
    });

    if (user.kycStatus !== 'APPROVED') {
      throw new Error('KYC approval required before using the on-ramp');
    }

    const tx = await prisma.onRampTransaction.create({
      data: {
        userId,
        status: 'INITIATED',
        fiatAmountInr,
        cryptoAsset: targetAsset,
      },
    });

    // MVP stub: return mock payment URL
    logger.info({ userId, txId: tx.id, fiatAmountInr }, 'on-ramp initiated');
    return { transactionId: tx.id, paymentUrl: `https://global.transak.com/?orderId=${tx.id}` };
  },

  /** Handle on-ramp webhook. */
  async handleOnRampWebhook(
    transactionId: string,
    status: string,
    cryptoAmount?: string,
    algorandTxId?: string,
  ) {
    const prisma = getPrisma();
    await prisma.onRampTransaction.update({
      where: { id: transactionId },
      data: {
        status:
          status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PROCESSING',
        cryptoAmount: cryptoAmount ?? undefined,
        algorandTxId: algorandTxId ?? undefined,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });
    logger.info({ transactionId, status }, 'on-ramp webhook processed');
  },

  /** Initiate off-ramp (crypto → INR). */
  async initiateOffRamp(userId: string, cryptoAmount: string, cryptoAsset: string, upiId: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { kycStatus: true },
    });

    if (user.kycStatus !== 'APPROVED') {
      throw new Error('KYC approval required before using the off-ramp');
    }

    // Hash UPI ID for storage (never plaintext)
    const crypto = await import('node:crypto');
    const upiIdHash = crypto.createHash('sha256').update(upiId).digest('hex');

    const tx = await prisma.offRampTransaction.create({
      data: {
        userId,
        status: 'INITIATED',
        cryptoAmount,
        cryptoAsset,
        upiIdHash,
      },
    });

    eventBus.emit(KYCEvents.OFFRAMP_INITIATED, { userId, offRampId: tx.id });
    logger.info({ userId, txId: tx.id, cryptoAsset }, 'off-ramp initiated');
    return { transactionId: tx.id };
  },

  /** Handle off-ramp webhook. */
  async handleOffRampWebhook(
    transactionId: string,
    status: string,
    fiatAmountInr?: string,
    providerTxId?: string,
  ) {
    const prisma = getPrisma();
    await prisma.offRampTransaction.update({
      where: { id: transactionId },
      data: {
        status:
          status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PROCESSING',
        fiatAmountInr: fiatAmountInr ?? undefined,
        providerTxId: providerTxId ?? undefined,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });
    logger.info({ transactionId, status }, 'off-ramp webhook processed');
  },
};
