/**
 * Yield domain events — emitted after Engine 4 completes yield discovery.
 *
 * Subscribed by:
 * - Engine 3 (Strategy) — uses ranked opportunities for allocation recommendations
 * - Engine 5 (User Intelligence) — uses opportunities + idle capital for AI context
 */

export const YieldEvents = {
  YIELD_OPPORTUNITIES_UPDATED: 'YieldOpportunitiesUpdated',
} as const;

export interface YieldOpportunitiesUpdatedPayload {
  userId: string;
  portfolioSnapshotId: string;
  opportunityCount: number;
  idleSignalCount: number;
  topOpportunityId: string | null;
  timestamp: string; // ISO8601 UTC
}
