/**
 * Strategy domain events — emitted after strategy plan generation completes.
 *
 * Subscribed by:
 * - Engine 4 (Execution & Safety) — picks up rebalancing actions
 * - Engine 5 (User Intelligence / Copilot) — uses strategy context for AI responses
 */

export const StrategyEvents = {
  STRATEGY_PLAN_CREATED: 'StrategyPlanCreated',
} as const;

export interface StrategyPlanCreatedPayload {
  strategySnapshotId: string;
  userId: string;
  portfolioSnapshotId: string;
  riskSnapshotId: string;
  model: string;
  goalProfile: string;
  rebalanceRequired: boolean;
  actionCount: number;
  defensiveMode: boolean;
  timestamp: string; // ISO8601 UTC
}
