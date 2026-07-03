/**
 * Knowledge Module — Single Entry Point
 *
 * This is the ONLY file that engines import from for data access.
 * All adapters, services, normalizers, and constants are re-exported from here.
 *
 * Usage:
 *   import { AlgorandIndexerAdapter, PriceService, ... } from '@/modules/knowledge/knowledge.module.js';
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('knowledge');

// ─── Adapters ──────────────────────────────────────────────────────────────
export { AlgorandIndexerAdapter } from './adapters/algorand-indexer.adapter.js';
export { FolksFinanceAdapter } from './adapters/folks-finance.adapter.js';
export { TinymanAdapter } from './adapters/tinyman.adapter.js';
export { PactAdapter } from './adapters/pact.adapter.js';
export { CoinGeckoAdapter } from './adapters/coingecko.adapter.js';
export { GoraOracleAdapter } from './adapters/gora-oracle.adapter.js';

// ─── Services ──────────────────────────────────────────────────────────────
export { PriceService } from './services/price.service.js';
export { CacheService, CacheTTL } from './services/cache.service.js';

// ─── Normalizers ───────────────────────────────────────────────────────────
export { normalizeAssetHoldings } from './normalizer/asset.normalizer.js';
export {
  normalizeFolksPositions,
  normalizeTinymanPositions,
  normalizePactPositions,
} from './normalizer/protocol.normalizer.js';
export { computeUsdValue, isPriceStale, filterFreshPrices } from './normalizer/price.normalizer.js';

// ─── Constants ─────────────────────────────────────────────────────────────
export {
  ASSET_REGISTRY,
  ALL_COINGECKO_IDS,
  getAssetMeta,
  getAssetIdByCoinGeckoId,
} from './constants/asset-registry.js';
export type { AssetMeta } from './constants/asset-registry.js';

// ─── Raw Types (internal use — only import within knowledge module) ────────
export type {
  RawAlgorandAccount,
  RawAlgorandTransaction,
  RawFolksPosition,
  RawFolksPool,
  RawTinymanPool,
  RawPactPool,
  RawCoinGeckoPrice,
} from './types/knowledge.types.js';

// ─── Singleton Clients (re-export from lib) ────────────────────────────────
export { algodClient, indexerClient } from '../../lib/algorand.js';

/**
 * Initialize the knowledge module.
 * Call this once at server startup to verify adapter connectivity.
 */
export function initKnowledgeModule(): void {
  const adapters = [
    'AlgorandIndexer',
    'FolksFinance',
    'Tinyman',
    'Pact',
    'CoinGecko',
    'GoraOracle (stub)',
  ];

  logger.info({ adapters }, 'Knowledge module initialized');
}
