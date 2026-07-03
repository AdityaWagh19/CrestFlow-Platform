/**
 * Gora Oracle Adapter — STUB
 *
 * GORA_TODO: Full implementation deferred to Engine 6 / Execution Plan.
 *
 * Gora is a decentralized oracle on Algorand. Price feeds are delivered
 * on-chain into specific Algorand app global state by Gora validator nodes.
 * Reading them requires:
 *   1. Knowing the per-asset Gora feed app IDs
 *   2. Querying the app global state via algod
 *   3. Decoding the ABI-encoded price value
 *
 * For Engines 1-4, CoinGecko pricing (60s refresh) is sufficient.
 * Gora price verification is mandatory only at execution time (Engine 6)
 * to ensure prices are not stale before any on-chain transaction.
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('knowledge:gora');

export const GoraOracleAdapter = {
  /**
   * Returns null — Gora not wired in this plan.
   * GORA_TODO: implement in Engine 6 / Execution Plan.
   * Will query Gora feed app global state via algod.getApplicationByID().
   */
  getPrice(_assetId: number): { priceUsd: string; confidence: string; timestamp: number } | null {
    logger.debug('Gora Oracle getPrice called — returning null (stub)');
    return null;
  },

  /**
   * Returns empty map — Gora not wired in this plan.
   * GORA_TODO: batch query multiple Gora feeds.
   */
  getPrices(
    _assetIds: number[],
  ): Record<number, { priceUsd: string; confidence: string; timestamp: number } | null> {
    return {};
  },

  /**
   * Check if Gora Oracle is available and configured.
   * Always returns false in this plan.
   */
  isAvailable(): boolean {
    return false;
  },
};
