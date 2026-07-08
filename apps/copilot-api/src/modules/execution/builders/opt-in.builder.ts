/**
 * ASA Opt-In builder.
 * Builds a real algosdk asset transfer transaction (self-transfer, amount=0).
 */

import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

/**
 * Build an ASA opt-in transaction.
 * An opt-in is a 0-unit asset transfer from account to itself.
 */
export async function buildOptInTxn(assetId: number, sender: string): Promise<algosdk.Transaction> {
  const params = await algodClient.getTransactionParams().do();

  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sender, // self-transfer
    amount: 0, // 0 units = opt-in
    assetIndex: assetId,
    suggestedParams: params,
  });

  logger.info({ assetId, sender: sender.slice(0, 8) + '...' }, 'opt-in txn built');
  return txn;
}

/**
 * Check if an account is opted into a given ASA.
 * Returns true for ALGO (assetId=0) unconditionally.
 */
export async function isAccountOptedIn(address: string, assetId: number): Promise<boolean> {
  if (assetId === 0) return true;
  try {
    const info = await algodClient.accountInformation(address).do();
    const assets = (info.assets ?? []) as Array<{ assetId: bigint }>;
    return assets.some((a) => parseInt(String(a.assetId), 10) === assetId);
  } catch {
    return false;
  }
}
