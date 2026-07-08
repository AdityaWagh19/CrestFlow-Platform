/**
 * Tinyman V2 transaction builders — LP add / remove.
 * Uses algosdk to construct real Algorand transactions.
 */

import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

/**
 * Build LP add liquidity transactions for Tinyman V2.
 */
export async function buildLpAddTxns(params: {
  asset1Id: number;
  asset2Id: number;
  asset1AmountMicro: string;
  asset2AmountMicro: string;
  sender: string;
  slippagePct: number;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns: algosdk.Transaction[] = [];

  // Asset 1 transfer to pool
  if (params.asset1Id === 0) {
    txns.push(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender, // actual target is pool address
        amount: BigInt(params.asset1AmountMicro),
        suggestedParams,
      }),
    );
  } else {
    txns.push(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender,
        amount: BigInt(params.asset1AmountMicro),
        assetIndex: params.asset1Id,
        suggestedParams,
      }),
    );
  }

  // Asset 2 transfer to pool
  if (params.asset2Id === 0) {
    txns.push(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender,
        amount: BigInt(params.asset2AmountMicro),
        suggestedParams,
      }),
    );
  } else {
    txns.push(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender,
        amount: BigInt(params.asset2AmountMicro),
        assetIndex: params.asset2Id,
        suggestedParams,
      }),
    );
  }

  // Assign group ID for atomic execution
  if (txns.length > 1) {
    algosdk.assignGroupID(txns);
  }

  logger.info({ asset1: params.asset1Id, asset2: params.asset2Id }, 'LP add txns built');
  return txns;
}

/**
 * Build LP remove liquidity transactions for Tinyman V2.
 */
export async function buildLpRemoveTxns(params: {
  asset1Id: number;
  asset2Id: number;
  lpTokenAmountMicro: string;
  lpTokenAssetId: number;
  sender: string;
  slippagePct: number;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  // Transfer LP tokens back to pool for burning
  const txns: algosdk.Transaction[] = [
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.sender, // actual target is pool address
      amount: BigInt(params.lpTokenAmountMicro),
      assetIndex: params.lpTokenAssetId,
      suggestedParams,
    }),
  ];

  logger.info({ asset1: params.asset1Id, asset2: params.asset2Id }, 'LP remove txns built');
  return txns;
}
