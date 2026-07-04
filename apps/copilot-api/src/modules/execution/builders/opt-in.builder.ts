/**
 * ASA Opt-In builder.
 * MVP STUB: Returns mock txn ID.
 * Production: Builds algosdk.makeAssetTransferTxn (self-transfer, amount=0).
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

// MVP STUB
export function buildOptInTxn(assetId: number, sender: string): string {
  logger.info({ assetId, sender: sender.slice(0, 8) + '...' }, 'opt-in txn built (MVP stub)');
  return `mock-optin-txn-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Check if account is opted into an ASA.
 * MVP STUB: Returns true for ALGO (0), false otherwise.
 * Production: Queries algod.accountInformation().
 */
export function isAccountOptedIn(_address: string, assetId: number): boolean {
  return assetId === 0;
}
