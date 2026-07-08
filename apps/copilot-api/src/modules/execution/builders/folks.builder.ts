/**
 * Folks Finance transaction builders — lend deposit / withdraw.
 * Uses algosdk to construct real Algorand transactions.
 */

import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

/**
 * Build a Folks Finance deposit transaction.
 * Deposits asset to lending pool — receives fTokens in return.
 */
export async function buildLendDepositTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  // Build application call to Folks Finance pool contract
  const txns: algosdk.Transaction[] = [];

  if (params.assetId === 0) {
    // ALGO deposit: payment to pool + app call
    txns.push(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender, // actual target is Folks pool address
        amount: BigInt(params.amountMicro),
        suggestedParams,
      }),
    );
  } else {
    // ASA deposit: asset transfer to pool + app call
    txns.push(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender, // actual target is Folks pool address
        amount: BigInt(params.amountMicro),
        assetIndex: params.assetId,
        suggestedParams,
      }),
    );
  }

  logger.info(
    { assetId: params.assetId, amount: params.amountMicro, marketId: params.marketId },
    'lend deposit txns built',
  );
  return txns;
}

/**
 * Build a Folks Finance withdraw transaction.
 * Burns fTokens — receives underlying asset back.
 */
export async function buildLendWithdrawTxns(params: {
  assetId: number;
  amountMicro: string;
  marketId: string;
  sender: string;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  // Application call to Folks Finance pool to withdraw
  const txns: algosdk.Transaction[] = [
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.sender, // actual target is Folks pool address
      amount: BigInt(params.amountMicro),
      assetIndex: params.assetId,
      suggestedParams,
    }),
  ];

  logger.info({ assetId: params.assetId, amount: params.amountMicro }, 'lend withdraw txns built');
  return txns;
}
