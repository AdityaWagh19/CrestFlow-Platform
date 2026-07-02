/** Portfolio snapshot trigger. */
export type SnapshotTrigger = 'ONBOARDING' | 'MANUAL' | 'POST_EXECUTION' | 'SCHEDULED';

/** Allocation breakdown — Record<identifier, { valueUsd, percent }>. */
export interface AllocationEntry {
  valueUsd: string; // DECIMAL
  percent: string; // DECIMAL (0.xx)
}

/** Health score component values. */
export interface HealthComponents {
  diversification: number; // 0-100
  liquidity: number; // 0-100
  yieldQuality: number; // 0-100
  sustainability: number; // 0-100
  protocolHealth: number; // 0-100
}

/** Data quality per source. */
export interface DataQuality {
  indexer: 'ok' | 'failed';
  folks: 'ok' | 'failed';
  tinyman: 'ok' | 'failed';
  pact: 'ok' | 'failed';
}

/** LP decomposition record. */
export interface LpDecomposition {
  asset1Symbol: string;
  asset1Amount: string; // DECIMAL
  asset2Symbol: string;
  asset2Amount: string; // DECIMAL
  ownershipRatio: string; // DECIMAL
  ilPercent: string; // DECIMAL
}
