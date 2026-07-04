/**
 * Execution domain events.
 *
 * ExecutionConfirmed → consumed by Engine 1 (triggers fresh portfolio scan)
 * ExecutionConfirmed → consumed by Engine 5 (ACTED_ON_REBALANCE behavioral signal)
 */

export const ExecutionEvents = {
  EXECUTION_CONFIRMED: 'ExecutionConfirmed',
  EXECUTION_FAILED: 'ExecutionFailed',
  EXECUTION_BLOCKED: 'ExecutionBlocked',
} as const;

export interface ExecutionConfirmedPayload {
  userId: string;
  executionId: string;
  totalValueUsd: string;
  stepCount: number;
  txIds: string[];
  goalProfile: string;
  timestamp: string;
}
