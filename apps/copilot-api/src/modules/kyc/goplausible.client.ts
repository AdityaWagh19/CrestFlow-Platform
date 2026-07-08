/**
 * GoPlausible API Client — Algorand-native DID + KYC Verifiable Credential.
 * Network-aware: uses testnet or mainnet DID prefix based on ALGORAND_NETWORK.
 * Returns mock data when API key is not configured.
 */

import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { network } from '../../lib/network.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('kyc:goplausible');

export const GoPlausibleClient = {
  /** Create a DID anchored to an Algorand wallet address. */
  async createDID(params: { algorandAddress: string }): Promise<{ id: string }> {
    if (!config.GOPLAUSIBLE_API_KEY) {
      const mockDid = `did:algo:${network.didNetwork}:${params.algorandAddress.slice(0, 16)}`;
      logger.info(
        { address: params.algorandAddress.slice(0, 8) + '...', network: network.didNetwork },
        'DID created (mock — no API key)',
      );
      return { id: mockDid };
    }

    const resp = await fetch(`${config.GOPLAUSIBLE_API_URL}/did/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GOPLAUSIBLE_API_KEY}`,
      },
      body: JSON.stringify({ address: params.algorandAddress, network: network.didNetwork }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) throw new Error(`GoPlausible DID creation failed: ${resp.status}`);
    return resp.json() as Promise<{ id: string }>;
  },

  /** Issue a KYC Verifiable Credential for an existing DID. */
  async issueKYCCredential(params: {
    did: string;
    claims: Record<string, unknown>;
  }): Promise<{ id: string; jwt: string }> {
    if (!config.GOPLAUSIBLE_API_KEY) {
      const mockVcId = crypto.randomUUID();
      logger.info({ did: params.did }, 'KYC VC issued (mock — no API key)');
      return { id: mockVcId, jwt: `mock-vc-jwt-${mockVcId.slice(0, 8)}` };
    }

    const resp = await fetch(`${config.GOPLAUSIBLE_API_URL}/vc/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GOPLAUSIBLE_API_KEY}`,
      },
      body: JSON.stringify({
        subject: params.did,
        type: ['VerifiableCredential', 'KYCCredential'],
        claims: params.claims,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) throw new Error(`GoPlausible VC issuance failed: ${resp.status}`);
    return resp.json() as Promise<{ id: string; jwt: string }>;
  },
};
