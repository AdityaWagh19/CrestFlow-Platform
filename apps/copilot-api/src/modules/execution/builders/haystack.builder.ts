/**
 * Haystack Router — smart order routing across Tinyman + Pact.
 * MVP STUB: Logs swap intent, returns mock txn IDs.
 * Production: Uses @txnlab/deflex SDK for atomic swap routing.
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

// MVP STUB
export function buildSwapTxns(params: {
  fromAssetId: number;
  toAssetId: number;
  fromAmountMicro: string;
  sender: string;
  slippagePct: number;
}): string[] {
  logger.info(
    { from: params.fromAssetId, to: params.toAssetId, amount: params.fromAmountMicro },
    'swap txn built (MVP stub)',
  );
  return [`mock-swap-txn-${crypto.randomUUID().slice(0, 8)}`];
}
