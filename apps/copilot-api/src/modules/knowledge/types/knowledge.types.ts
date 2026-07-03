/**
 * Raw adapter types — internal to the knowledge module.
 * These are NOT exported outside the knowledge module.
 * Engines consume only the canonical types from @crestflow/shared.
 */

// ─── Raw Algorand Indexer Types ────────────────────────────────────────────

export interface RawAlgorandAccount {
  address: string;
  amount: number; // microALGO — converted to Decimal by normalizer
  assets: Array<{ 'asset-id': number; amount: number }>;
}

export interface RawAlgorandTransaction {
  id: string;
  'confirmed-round': number;
  'round-time': number;
  'tx-type': string;
  sender: string;
  fee: number;
  note?: string;
  'payment-transaction'?: {
    receiver: string;
    amount: number;
  };
  'asset-transfer-transaction'?: {
    'asset-id': number;
    receiver: string;
    amount: number;
  };
}

// ─── Raw Folks Finance Types ───────────────────────────────────────────────

export interface RawFolksPosition {
  protocol: 'folks-finance';
  marketAppId: number;
  assetId: number;
  depositBalance: string; // string from SDK
  borrowBalance: string;
  depositInterestRate: string;
  borrowInterestRate: string;
  collateralFactor?: string;
  liquidationThreshold?: string;
  healthFactor?: string;
}

export interface RawFolksPool {
  marketAppId: number;
  assetId: number;
  supplyApy: string;
  borrowApy: string;
  tvlUsd: string;
  depositSize: string;
  borrowSize: string;
  utilizationRate: string;
}

// ─── Raw Tinyman Types ─────────────────────────────────────────────────────

export interface RawTinymanPool {
  address: string;
  asset1Id: number;
  asset2Id: number;
  asset1Reserves: string;
  asset2Reserves: string;
  issuedLiquidity: string;
  lpTokenAssetId: number;
  totalFeeShare: string;
}

// ─── Raw Pact Types ────────────────────────────────────────────────────────

export interface RawPactPool {
  appId: number;
  primaryAssetId: number;
  secondaryAssetId: number;
  lpTokenAssetId: number;
  tvlUsd: string;
  apr7d: string;
  volume24hUsd: string;
  primaryAssetReserves: string;
  secondaryAssetReserves: string;
  issuedLiquidity: string;
}

// ─── Raw CoinGecko Types ───────────────────────────────────────────────────

export interface RawCoinGeckoPrice {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  last_updated_at?: number;
}
