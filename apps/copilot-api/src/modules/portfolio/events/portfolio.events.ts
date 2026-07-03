/**
 * Portfolio domain events — emitted by Engine 1 after snapshot creation.
 *
 * Subscribed by:
 * - Engine 2 (Risk Analysis) — uses totalValueUsd + trueExposure
 * - Engine 4 (Yield Discovery) — uses protocolPositions + allocation
 * - Engine 5 (User Intelligence) — uses everything
 */

export const PortfolioEvents = {
  PORTFOLIO_SNAPSHOT_CREATED: 'PortfolioSnapshotCreated',
} as const;

export interface PortfolioSnapshotCreatedPayload {
  snapshotId: string;
  userId: string;
  totalValueUsd: string;
  healthScore: number;
  hhi: string;
  isPartial: boolean;
  timestamp: string; // ISO8601 UTC
}
