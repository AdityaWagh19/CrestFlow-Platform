/**
 * Veriff API Client — KYC document verification + liveness + AML.
 * MVP stub: logs intent, returns mock session data.
 * Production: calls Veriff REST API.
 */

import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('kyc:veriff');

export const VeriffClient = {
  /** Create a Veriff verification session. Returns sessionUrl + sessionId. */
  async createSession(params: {
    person: { fullName: string; email: string };
    vendorData: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!config.VERIFF_API_KEY) {
      // MVP stub
      const mockId = crypto.randomUUID();
      logger.info({ vendorData: params.vendorData }, 'Veriff session created (MVP stub)');
      return { url: `https://veriff.me/v/${mockId}`, sessionId: mockId };
    }

    const resp = await fetch(`${config.VERIFF_API_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': config.VERIFF_API_KEY,
      },
      body: JSON.stringify({
        verification: {
          person: { fullName: params.person.fullName },
          vendorData: params.vendorData,
          timestamp: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await resp.json();
    return { url: data.verification.url, sessionId: data.verification.id };
  },

  /** Verify HMAC-SHA256 webhook signature. */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!config.VERIFF_WEBHOOK_SECRET) return true; // MVP: skip verification
    const expected = crypto
      .createHmac('sha256', config.VERIFF_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature.toLowerCase(), 'hex'),
    );
  },
};
