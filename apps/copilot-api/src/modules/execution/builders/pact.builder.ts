/**
 * Pact transaction builders — LP add / remove.
 * Uses algosdk to construct real Algorand transactions.
 */

import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

/**
 * Build Pact LP add liquidity transactions.
 */
export async function buildPactLpAddTxns(params: {
  primaryAssetId: number;
  secondaryAssetId: number;
  primaryAmountMicro: string;
  secondaryAmountMicro: string;
  poolAppId: number;
  sender: string;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns: algosdk.Transaction[] = [];

  // Primary asset transfer
  if (params.primaryAssetId === 0) {
    txns.push(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender,
        amount: BigInt(params.primaryAmountMicro),
        suggestedParams,
      }),
    );
  } else {
    txns.push(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender,
        amount: BigInt(params.primaryAmountMicro),
        assetIndex: params.primaryAssetId,
        suggestedParams,
      }),
    );
  }

  // Secondary asset transfer
  txns.push(
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.sender,
      amount: BigInt(params.secondaryAmountMicro),
      assetIndex: params.secondaryAssetId,
      suggestedParams,
    }),
  );

  if (txns.length > 1) {
    algosdk.assignGroupID(txns);
  }

  logger.info(
    {
      primary: params.primaryAssetId,
      secondary: params.secondaryAssetId,
      poolApp: params.poolAppId,
    },
    'Pact LP add txns built',
  );
  return txns;
}

/**
 * Build Pact LP remove liquidity transactions.
 */
export async function buildPactLpRemoveTxns(params: {
  lpTokenAssetId: number;
  lpTokenAmountMicro: string;
  poolAppId: number;
  sender: string;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  const txns: algosdk.Transaction[] = [
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.sender,
      amount: BigInt(params.lpTokenAmountMicro),
      assetIndex: params.lpTokenAssetId,
      suggestedParams,
    }),
  ];

  logger.info(
    { lpToken: params.lpTokenAssetId, poolApp: params.poolAppId },
    'Pact LP remove txns built',
  );
  return txns;
}
