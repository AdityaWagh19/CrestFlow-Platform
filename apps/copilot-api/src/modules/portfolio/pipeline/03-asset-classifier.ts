/**
 * Step 3 — Asset Classifier
 * Classifies assets into categories: volatile / stablecoin / lending / lp.
 * Uses the asset registry for known assets and heuristics for unknown ones.
 */

import { getAssetMeta } from '../../knowledge/knowledge.module.js';
import type { AssetCategory } from '@crestflow/shared';

const STABLECOIN_ASSET_IDS = new Set([
  31566704, // USDC
  312769, // USDt
]);

/**
 * Classify an asset by its ASA ID.
 * Returns a category that determines how it's grouped in allocation analysis.
 */
export function classifyAsset(assetId: number): AssetCategory {
  if (STABLECOIN_ASSET_IDS.has(assetId)) return 'stablecoin';

  const meta = getAssetMeta(assetId);
  return meta.category === 'stablecoin' ? 'stablecoin' : 'volatile';
}

/**
 * Determine the source/protocol of a holding for protocol allocation.
 */
export function classifySource(
  assetId: number,
  isLpToken: boolean,
  isFolksPosition: boolean,
  lpProtocol?: 'tinyman' | 'pact',
): 'native' | 'folks-finance' | 'tinyman' | 'pact' {
  if (isFolksPosition) return 'folks-finance';
  if (isLpToken && lpProtocol) return lpProtocol;
  return 'native';
}
