/**
 * Step 3 — Asset Classifier
 * Classifies assets into categories: volatile / stablecoin / lending / lp.
 * Uses the asset registry (network-aware) for classification.
 */

import { getAssetMeta, STABLECOIN_ASA_IDS } from '../../knowledge/constants/asset-registry.js';
import type { AssetCategory } from '@crestflow/shared';

/**
 * Classify an asset by its ASA ID.
 * Uses the network-aware STABLECOIN_ASA_IDS set from the asset registry.
 */
export function classifyAsset(assetId: number): AssetCategory {
  if (STABLECOIN_ASA_IDS.has(assetId)) return 'stablecoin';

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
