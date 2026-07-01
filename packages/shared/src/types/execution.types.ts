export type ActionType =
  'SWAP' | 'LEND_DEPOSIT' | 'LEND_WITHDRAW' | 'LP_ADD' | 'LP_REMOVE' | 'OPT_IN' | 'NO_OP';

export type ExecutionStatus =
  | 'PENDING'
  | 'POLICY_BLOCKED'
  | 'AWAITING_APPROVAL'
  | 'SIMULATION_FAILED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED';

export type PolicyDecision = 'APPROVED' | 'BLOCKED' | 'REQUIRES_APPROVAL';

export interface POAStep {
  index: number;
  groupIndex: number;
  actionType: ActionType;
  protocol: string;
  fromAssetId: number;
  fromSymbol: string;
  toAssetId: number;
  toSymbol: string;
  amount: string; // DECIMAL
  estimatedValueUsd: string; // DECIMAL
  estimatedSlippagePct?: string; // DECIMAL
}

export interface PlanOfAction {
  executionId: string;
  userId: string;
  steps: POAStep[];
  totalValueUsd: string; // DECIMAL
  estimatedFeesAlgo: string; // DECIMAL
  sourceEventType: string;
  sourceEventId: string;
  goalProfile: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason?: string;
  blockedStepIndices?: number[];
}
