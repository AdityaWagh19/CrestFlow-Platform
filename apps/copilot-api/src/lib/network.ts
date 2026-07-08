/**
 * Network Constants Module — single source of truth for all network-specific values.
 * Derived from ALGORAND_NETWORK env var. All adapters import from here.
 */

import { config } from '../config/env.js';

export const isTestnet = config.ALGORAND_NETWORK === 'testnet';

export const network = {
  isTestnet,

  // Algorand nodes
  algodUrl: config.ALGORAND_ALGOD_URL,
  indexerUrl: config.ALGORAND_INDEXER_URL,

  // USDC ASA ID — testnet vs mainnet
  usdcAsaId: isTestnet ? 10_458_941 : 31_566_704,

  // Folks Finance on-chain constants
  folks: {
    // Simplified app IDs — full SDK integration uses these to query on-chain state
    poolManagerAppId: isTestnet ? 147_169_673 : 971_350_278,
    depositsAppId: isTestnet ? 147_170_678 : 971_368_268,
  },

  // Tinyman analytics API
  tinymanApiUrl: isTestnet
    ? 'https://testnet.analytics.tinyman.org'
    : 'https://mainnet.analytics.tinyman.org',

  // Pact API — same URL for both networks
  pactApiUrl: 'https://api.pact.fi',
};
