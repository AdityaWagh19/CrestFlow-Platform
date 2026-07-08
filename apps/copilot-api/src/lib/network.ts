/**
 * Network Constants Module — single source of truth for ALL network-specific values.
 * Derived from ALGORAND_NETWORK env var. All adapters, builders, and middleware import from here.
 *
 * Switching networks: change ALGORAND_NETWORK=testnet|mainnet in .env — zero code changes.
 * Extensible: add LocalNet support by adding a third case.
 */

import { config } from '../config/env.js';

export const isTestnet = config.ALGORAND_NETWORK === 'testnet';

export const network = {
  isTestnet,

  /** Network label for API responses and explorer links */
  networkLabel: isTestnet ? 'algorand-testnet' : 'algorand-mainnet',

  /** Algorand node endpoints (from env) */
  algodUrl: config.ALGORAND_ALGOD_URL,
  indexerUrl: config.ALGORAND_INDEXER_URL,

  /** Block explorer URLs */
  explorerBaseUrl: isTestnet
    ? 'https://testnet.explorer.perawallet.app'
    : 'https://explorer.perawallet.app',
  alloInfoUrl: isTestnet ? 'https://testnet.allo.info' : 'https://allo.info',

  /** Build explorer link for a transaction ID */
  txExplorerUrl: (txId: string) =>
    isTestnet ? `https://testnet.allo.info/tx/${txId}` : `https://allo.info/tx/${txId}`,

  // ─── Asset IDs ──────────────────────────────────────────────────────────

  /** USDC ASA ID */
  usdcAsaId: isTestnet ? 10_458_941 : 31_566_704,

  /** USDt ASA ID */
  usdtAsaId: isTestnet ? 0 : 312_769, // USDt not available on testnet

  /** Core asset IDs per network */
  assets: isTestnet
    ? {
        ALGO: 0,
        USDC: 10_458_941,
        USDt: 0, // not on testnet
        goETH: 0, // not on testnet
        goBTC: 0, // not on testnet
        wBTC: 0, // not on testnet
      }
    : {
        ALGO: 0,
        USDC: 31_566_704,
        USDt: 312_769,
        goETH: 386_195_940,
        goBTC: 386_192_725,
        wBTC: 793_124_631,
      },

  // ─── Protocol Constants ─────────────────────────────────────────────────

  /** Folks Finance on-chain app IDs */
  folks: {
    poolManagerAppId: isTestnet ? 147_169_673 : 971_350_278,
    depositsAppId: isTestnet ? 147_170_678 : 971_368_268,
  },

  /** Tinyman analytics API */
  tinymanApiUrl: isTestnet
    ? 'https://testnet.analytics.tinyman.org'
    : 'https://mainnet.analytics.tinyman.org',

  /** Pact API — same URL for both networks */
  pactApiUrl: 'https://api.pact.fi',

  /** Folks Finance REST API base */
  folksApiUrl: isTestnet ? 'https://testnet-api.folks.finance' : 'https://api.folks.finance',

  // ─── GoPlausible / x402 ────────────────────────────────────────────────

  /** GoPlausible DID network prefix */
  didNetwork: isTestnet ? 'testnet' : 'mainnet',
};
