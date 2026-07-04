/**
 * Folks Finance transaction builders — lend deposit / withdraw.
 * MVP STUB: Returns mock txn IDs.
 * Production: Uses @folks-finance/algorand-js-sdk.
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

// MVP STUB
export function buildLendDepositTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): string[] {
  logger.info(
    { assetId: params.assetId, amount: params.amountMicro, marketId: params.marketId },
    'lend deposit txn built (MVP stub)',
  );
  return [`mock-deposit-txn-${crypto.randomUUID().slice(0, 8)}`];
}

// MVP STUB
export function buildLendWithdrawTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): string[] {
  logger.info(
    { assetId: params.assetId, amount: params.amountMicro },
    'lend withdraw txn built (MVP stub)',
  );
  return [`mock-withdraw-txn-${crypto.randomUUID().slice(0, 8)}`];
}
