/**
 * Domain event type definitions for CrestFlow.
 * All 18+ core events defined in instructions.md §13.
 * Events are emitted via BullMQ queues — each event carries all data needed to process it.
 */

// ─── Platform Events ────────────────────────────────────────────────────────

export interface UserOnboardedEvent {
  type: 'UserOnboarded';
  userId: string;
  email: string;
  algorandAddress: string;
  timestamp: string;
}

export interface WalletConnectedEvent {
  type: 'WalletConnected';
  userId: string;
  algorandAddress: string;
  timestamp: string;
}

export interface KYCCompletedEvent {
  type: 'KYCCompleted';
  userId: string;
  status: 'APPROVED' | 'DECLINED' | 'RESUBMISSION_REQUESTED';
  timestamp: string;
}

export interface DIDIssuedEvent {
  type: 'DIDIssued';
  userId: string;
  did: string;
  vcId: string;
  timestamp: string;
}

// ─── Engine 1: Portfolio Events ─────────────────────────────────────────────

export interface PortfolioScanTriggeredEvent {
  type: 'PortfolioScanTriggered';
  userId: string;
  trigger: 'ONBOARDING' | 'MANUAL' | 'POST_EXECUTION' | 'SCHEDULED';
  timestamp: string;
}

export interface PortfolioSnapshotCreatedEvent {
  type: 'PortfolioSnapshotCreated';
  userId: string;
  snapshotId: string;
  totalValueUsd: string;
  healthScore: number;
  timestamp: string;
}

// ─── Engine 2: Risk Events ──────────────────────────────────────────────────

export interface RiskAnalysisCompletedEvent {
  type: 'RiskAnalysisCompleted';
  userId: string;
  riskSnapshotId: string;
  riskScore: number;
  riskLevel: string;
  timestamp: string;
}

export interface RiskAlertCreatedEvent {
  type: 'RiskAlertCreated';
  userId: string;
  alertId: string;
  alertType: string;
  severity: string;
  timestamp: string;
}

// ─── Engine 3: Strategy Events ──────────────────────────────────────────────

export interface StrategyPlanCreatedEvent {
  type: 'StrategyPlanCreated';
  userId: string;
  strategySnapshotId: string;
  model: string;
  goalProfile: string;
  rebalanceRequired: boolean;
  timestamp: string;
}

// ─── Engine 4: Yield Events ─────────────────────────────────────────────────

export interface YieldOpportunitiesUpdatedEvent {
  type: 'YieldOpportunitiesUpdated';
  userId: string;
  opportunityCount: number;
  idleCapitalSignalCount: number;
  timestamp: string;
}

// ─── Engine 5: User Intelligence Events ─────────────────────────────────────

export interface InvestorProfileUpdatedEvent {
  type: 'InvestorProfileUpdated';
  userId: string;
  persona: string;
  goalProfile: string;
  driftScore: number;
  timestamp: string;
}

// ─── Engine 6: Execution Events ─────────────────────────────────────────────

export interface ExecutionPlanCreatedEvent {
  type: 'ExecutionPlanCreated';
  userId: string;
  executionId: string;
  stepCount: number;
  totalValueUsd: string;
  timestamp: string;
}

export interface ExecutionApprovedEvent {
  type: 'ExecutionApproved';
  userId: string;
  executionId: string;
  timestamp: string;
}

export interface ExecutionConfirmedEvent {
  type: 'ExecutionConfirmed';
  userId: string;
  executionId: string;
  txIds: string[];
  timestamp: string;
}

export interface ExecutionFailedEvent {
  type: 'ExecutionFailed';
  userId: string;
  executionId: string;
  reason: string;
  timestamp: string;
}

// ─── Union Type ─────────────────────────────────────────────────────────────

export type DomainEvent =
  | UserOnboardedEvent
  | WalletConnectedEvent
  | KYCCompletedEvent
  | DIDIssuedEvent
  | PortfolioScanTriggeredEvent
  | PortfolioSnapshotCreatedEvent
  | RiskAnalysisCompletedEvent
  | RiskAlertCreatedEvent
  | StrategyPlanCreatedEvent
  | YieldOpportunitiesUpdatedEvent
  | InvestorProfileUpdatedEvent
  | ExecutionPlanCreatedEvent
  | ExecutionApprovedEvent
  | ExecutionConfirmedEvent
  | ExecutionFailedEvent;
