/** Normalized token holding with USD value. */
export interface AssetHolding {
  assetId: number; // Algorand ASA ID (0 = native ALGO)
  symbol: string;
  name: string;
  decimals: number;
  amount: string; // DECIMAL string — raw units
  amountStandard: string; // DECIMAL string — human-readable units
  priceUsd: string; // DECIMAL string
  valueUsd: string; // DECIMAL string
  category: AssetCategory;
  source: 'native' | 'folks-finance' | 'tinyman' | 'pact';
}

export type AssetCategory = 'volatile' | 'stablecoin' | 'lp' | 'lending' | 'staking';

/** Supply/borrow/LP position with APY. */
export interface ProtocolPosition {
  protocol: ProtocolName;
  positionType: PositionType;
  assetSymbol: string;
  pairSymbol?: string; // Secondary asset for LP
  marketId?: string; // Protocol-specific pool/market ID
  suppliedAmount?: string; // DECIMAL string
  borrowedAmount?: string; // DECIMAL string
  lpTokenAmount?: string; // DECIMAL string
  valueUsd: string; // DECIMAL string
  apyPercent?: string; // DECIMAL string
  healthFactor?: string; // DECIMAL string — lending only
  liquidationThreshold?: string; // DECIMAL string — lending only
}

export type ProtocolName = 'folks-finance' | 'tinyman' | 'pact';
export type PositionType = 'supply' | 'borrow' | 'lp' | 'staking';

/** Token price with 24h change and market cap. */
export interface PriceData {
  assetId: number;
  symbol: string;
  priceUsd: string; // DECIMAL string
  change24hPercent: string; // DECIMAL string
  marketCapUsd?: string; // DECIMAL string
  volume24hUsd?: string; // DECIMAL string
  lastUpdatedAt: string; // ISO8601
}

/** Normalized on-chain transaction. */
export interface TransactionRecord {
  txId: string;
  type: 'pay' | 'axfer' | 'appl';
  sender: string;
  receiver?: string;
  assetId: number;
  amount: string; // DECIMAL string
  fee: string; // DECIMAL string — in ALGO
  roundTime: number; // Unix timestamp
  confirmedRound: number;
  note?: string;
}
