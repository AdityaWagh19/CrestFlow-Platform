/**
 * Haystack Router — smart order routing across Tinyman + Pact.
 * Uses algosdk to build a swap transaction via the best available route.
 * Production: Uses @txnlab/deflex SDK for atomic swap routing.
 */

import algosdk from 'algosdk';
import { algodClient } from '../../../lib/algorand.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:builders');

/**
 * Build swap transactions using Algorand SDK.
 * Returns an array of unsigned transactions for the swap.
 */
export async function buildSwapTxns(params: {
  fromAssetId: number;
  toAssetId: number;
  fromAmountMicro: string;
  sender: string;
  slippagePct: number;
}): Promise<algosdk.Transaction[]> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  // For ALGO → ASA swaps, build a payment + asset transfer group
  // For ASA → ASA swaps, build asset transfer pair
  // This is a simplified direct swap — production uses @txnlab/deflex for routing
  const txns: algosdk.Transaction[] = [];

  if (params.fromAssetId === 0) {
    // ALGO → ASA: payment transaction
    txns.push(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender, // placeholder — real target is DEX contract
        amount: BigInt(params.fromAmountMicro),
        suggestedParams,
      }),
    );
  } else {
    // ASA → ASA or ASA → ALGO: asset transfer
    txns.push(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: params.sender,
        receiver: params.sender, // placeholder — real target is DEX contract
        amount: BigInt(params.fromAmountMicro),
        assetIndex: params.fromAssetId,
        suggestedParams,
      }),
    );
  }

  logger.info(
    { from: params.fromAssetId, to: params.toAssetId, amount: params.fromAmountMicro },
    'swap txns built',
  );
  return txns;
}
