/**
 * Tinyman V2 transaction builders — LP add / remove.
 * MVP STUB: Returns mock txn IDs.
 * Production: Uses @tinymanorg/tinyman-js-sdk.
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

// MVP STUB
export function buildLpAddTxns(params: {
  asset1Id: number;
  asset2Id: number;
  asset1AmountMicro: string;
  asset2AmountMicro: string;
  sender: string;
  slippagePct: number;
}): string[] {
  logger.info({ asset1: params.asset1Id, asset2: params.asset2Id }, 'LP add txn built (MVP stub)');
  return [`mock-lp-add-txn-${crypto.randomUUID().slice(0, 8)}`];
}

// MVP STUB
export function buildLpRemoveTxns(params: {
  asset1Id: number;
  asset2Id: number;
  lpTokenAmountMicro: string;
  sender: string;
  slippagePct: number;
}): string[] {
  logger.info(
    { asset1: params.asset1Id, asset2: params.asset2Id },
    'LP remove txn built (MVP stub)',
  );
  return [`mock-lp-remove-txn-${crypto.randomUUID().slice(0, 8)}`];
}
