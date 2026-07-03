/**
 * Step 1 — Parallel Data Fetcher
 * Fires all adapter calls with Promise.allSettled.
 * If one protocol adapter fails, the scan continues with partial data.
 */

import {
  AlgorandIndexerAdapter,
  FolksFinanceAdapter,
  TinymanAdapter,
  PactAdapter,
} from '../../knowledge/knowledge.module.js';
import { createLogger } from '@crestflow/shared';
import type { TransactionRecord } from '@crestflow/shared';
import type { RawAlgorandAccount, RawFolksPosition } from '../../knowledge/knowledge.module.js';
import type { RawTinymanPool, RawPactPool } from '../../knowledge/knowledge.module.js';

const logger = createLogger('portfolio:fetcher');

export interface RawPortfolioData {
  account: RawAlgorandAccount | null;
  transactions: TransactionRecord[];
  folksPositions: RawFolksPosition[];
  tinymanPositions: { pool: RawTinymanPool; lpTokenAmount: string }[];
  pactPositions: { pool: RawPactPool; lpTokenAmount: string }[];
  dataQuality: Record<string, 'ok' | 'failed'>;
  failedSources: string[];
}

function settle<T>(
  result: PromiseSettledResult<T>,
  name: string,
  fallback: T,
  failedSources: string[],
  dataQuality: Record<string, 'ok' | 'failed'>,
): T {
  if (result.status === 'rejected') {
    logger.warn({ source: name, reason: String(result.reason) }, 'adapter fetch failed');
    failedSources.push(name);
    dataQuality[name] = 'failed';
    return fallback;
  }
  dataQuality[name] = 'ok';
  return result.value;
}

export async function fetchPortfolioData(address: string): Promise<RawPortfolioData> {
  logger.debug({ address: address.slice(0, 8) + '...' }, 'starting parallel data fetch');

  // Step 1a: Fetch account holdings first (needed for LP detection)
  const accountResult = await AlgorandIndexerAdapter.getAccountHoldings(address).catch(() => null);

  // Build ASA holdings list for LP detection
  const asaHoldings: Array<{ assetId: number; amount: string }> = [];
  if (accountResult) {
    for (const asa of accountResult.assets) {
      if (asa.amount > 0) {
        asaHoldings.push({
          assetId: asa['asset-id'],
          amount: String(asa.amount),
        });
      }
    }
  }

  // Step 1b: Fire remaining fetches in parallel
  const [txResult, folksResult, tinymanResult, pactResult] = await Promise.allSettled([
    AlgorandIndexerAdapter.getTransactionHistory(address, 200),
    FolksFinanceAdapter.getUserPositions(address),
    TinymanAdapter.getUserLpPositions(address, asaHoldings),
    PactAdapter.getUserLpPositions(address, asaHoldings),
  ]);

  const failedSources: string[] = [];
  const dataQuality: Record<string, 'ok' | 'failed'> = {};

  if (!accountResult) {
    failedSources.push('indexer');
    dataQuality['indexer'] = 'failed';
  } else {
    dataQuality['indexer'] = 'ok';
  }

  const transactions = settle(txResult, 'transactions', [], failedSources, dataQuality);
  const folksPositions = settle(folksResult, 'folks', [], failedSources, dataQuality);
  const tinymanPositions = settle(tinymanResult, 'tinyman', [], failedSources, dataQuality);
  const pactPositions = settle(pactResult, 'pact', [], failedSources, dataQuality);

  logger.info(
    {
      address: address.slice(0, 8) + '...',
      failedSources,
      asaCount: accountResult?.assets.length ?? 0,
      folksCount: folksPositions.length,
      tinymanCount: tinymanPositions.length,
      pactCount: pactPositions.length,
    },
    'data fetch complete',
  );

  return {
    account: accountResult,
    transactions,
    folksPositions,
    tinymanPositions,
    pactPositions,
    dataQuality,
    failedSources,
  };
}
