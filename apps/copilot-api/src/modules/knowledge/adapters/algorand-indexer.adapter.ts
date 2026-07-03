/**
 * Algorand Indexer Adapter
 * Fetches account holdings, ASA metadata, and transaction history from Nodely Indexer.
 * All responses cached in Redis with appropriate TTLs.
 *
 * Uses algosdk v3 types — properties are camelCase (e.g. assetId, unitName).
 */

import { indexerClient } from '../../../lib/algorand.js';
import { CacheService, CacheTTL } from '../services/cache.service.js';
import { createLogger } from '@crestflow/shared';
import type { RawAlgorandAccount } from '../types/knowledge.types.js';
import type { TransactionRecord } from '@crestflow/shared';

const logger = createLogger('knowledge:indexer');

export const AlgorandIndexerAdapter = {
  /**
   * Returns ALGO balance + all ASA holdings for an address.
   */
  async getAccountHoldings(address: string): Promise<RawAlgorandAccount> {
    const cacheKey = address;
    const cached = await CacheService.get<RawAlgorandAccount>('indexer:account', cacheKey);
    if (cached) return cached;

    logger.debug(
      { address: address.slice(0, 8) + '...' },
      'fetching account holdings from Indexer',
    );

    const result = await indexerClient.lookupAccountByID(address).do();
    const account = result.account;

    const data: RawAlgorandAccount = {
      address: account.address ?? address,
      amount: parseInt(String(account.amount), 10),
      assets: (account.assets ?? []).map((a) => ({
        'asset-id': parseInt(String(a.assetId), 10),
        amount: parseInt(String(a.amount), 10),
      })),
    };

    await CacheService.set('indexer:account', cacheKey, data, CacheTTL.ACCOUNT_HOLDINGS);
    return data;
  },

  /**
   * Returns paginated transaction history for an address.
   */
  async getTransactionHistory(address: string, limit = 100): Promise<TransactionRecord[]> {
    const cacheKey = `${address}:${limit}`;
    const cached = await CacheService.get<TransactionRecord[]>('indexer:txns', cacheKey);
    if (cached) return cached;

    logger.debug({ address: address.slice(0, 8) + '...', limit }, 'fetching transaction history');

    const result = await indexerClient.lookupAccountTransactions(address).limit(limit).do();

    const txns = result.transactions ?? [];
    const records: TransactionRecord[] = txns.map((tx) => {
      const payTx = tx.paymentTransaction;
      const assetTx = tx.assetTransferTransaction;
      const txType = tx.txType ?? '';

      const type: TransactionRecord['type'] =
        txType === 'pay' || txType === 'axfer' || txType === 'appl' ? txType : 'appl';

      return {
        txId: tx.id ?? '',
        type,
        sender: tx.sender,
        receiver: payTx?.receiver ?? assetTx?.receiver,
        assetId: assetTx ? parseInt(String(assetTx.assetId), 10) : 0,
        amount: String(payTx?.amount ?? assetTx?.amount ?? 0),
        fee: String(tx.fee),
        roundTime: tx.roundTime ?? 0,
        confirmedRound: parseInt(String(tx.confirmedRound ?? 0), 10),
        note: tx.note ? new TextDecoder().decode(tx.note) : undefined,
      };
    });

    await CacheService.set('indexer:txns', cacheKey, records, CacheTTL.ACCOUNT_HOLDINGS);
    return records;
  },

  /**
   * Fetch ASA metadata — cached for 1 hour since ASA names/decimals rarely change.
   */
  async getAssetMetadata(
    assetId: number,
  ): Promise<{ decimals: number; unitName: string; name: string }> {
    if (assetId === 0) {
      return { decimals: 6, unitName: 'ALGO', name: 'Algorand' };
    }

    const cacheKey = String(assetId);
    const cached = await CacheService.get<{ decimals: number; unitName: string; name: string }>(
      'indexer:asa',
      cacheKey,
    );
    if (cached) return cached;

    logger.debug({ assetId }, 'fetching ASA metadata from Indexer');

    const result = await indexerClient.lookupAssetByID(assetId).do();
    const params = result.asset.params;

    const meta = {
      decimals: params.decimals ?? 0,
      unitName: params.unitName ?? `ASA-${assetId}`,
      name: params.name ?? `Unknown ASA ${assetId}`,
    };

    await CacheService.set('indexer:asa', cacheKey, meta, CacheTTL.ASA_METADATA);
    return meta;
  },
};
