/**
 * Audit Event Listeners — passive population from all engines.
 * No engine imports the audit service directly.
 * The audit layer subscribes to events via the event bus.
 */

import { createLogger } from '@crestflow/shared';
import type { EventEmitter } from 'node:events';
import { AuditService } from './audit.service.js';

const logger = createLogger('audit:listeners');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventPayload = any;

export function registerAuditListeners(eventBus: EventEmitter): void {
  // ─── Engine 1: Portfolio ────────────────────────────────────────────
  eventBus.on('PortfolioSnapshotCreated', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'PORTFOLIO_SCAN',
      action: 'portfolio_scanned',
      sourceEngine: 'engine1',
      relatedEntityId: p.snapshotId,
      metadata: {
        totalValueUsd: p.totalValueUsd,
        healthScore: p.healthScore,
        isPartial: p.isPartial,
      },
    }).catch(() => {});
  });

  // ─── Engine 2: Risk ─────────────────────────────────────────────────
  eventBus.on('RiskAnalysisCompleted', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'RISK_ANALYSIS',
      action: 'risk_analyzed',
      sourceEngine: 'engine2',
      relatedEntityId: p.riskSnapshotId,
      metadata: {
        riskScore: p.riskScore,
        riskLevel: p.riskLevel,
        activeAlertCount: p.activeAlertCount,
      },
    }).catch(() => {});
  });

  // ─── Engine 3: Strategy ─────────────────────────────────────────────
  eventBus.on('StrategyPlanCreated', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'STRATEGY_UPDATE',
      action: 'strategy_computed',
      sourceEngine: 'engine3',
      relatedEntityId: p.strategySnapshotId,
      metadata: {
        model: p.model,
        goalProfile: p.goalProfile,
        rebalanceRequired: p.rebalanceRequired,
        defensiveMode: p.defensiveMode,
        actionCount: p.actionCount,
      },
    }).catch(() => {});
  });

  // ─── Engine 4: Yield ────────────────────────────────────────────────
  eventBus.on('YieldOpportunitiesUpdated', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'YIELD_SCAN',
      action: 'yield_scan_completed',
      sourceEngine: 'engine4',
      metadata: {
        opportunityCount: p.opportunityCount,
        idleCapitalCount: p.idleCapitalCount,
        totalOpportunityCostUsdPerYear: p.totalOpportunityCostUsdPerYear,
      },
    }).catch(() => {});
  });

  // ─── Engine 5: User Intelligence ────────────────────────────────────
  eventBus.on('OnboardingCompleted', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'PROFILE_CHANGE',
      action: 'onboarding_completed',
      sourceEngine: 'engine5',
      metadata: {
        investorPersona: p.investorPersona,
        goalProfile: p.goalProfile,
        normalizedScore: p.normalizedScore,
      },
    }).catch(() => {});
  });

  eventBus.on('GoalProfileChanged', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'PROFILE_CHANGE',
      action: 'goal_profile_changed',
      sourceEngine: 'engine5',
      metadata: { fromProfile: p.fromProfile, toProfile: p.toProfile },
    }).catch(() => {});
  });

  // ─── Engine 6: Execution ─────────────────────────────────────────────
  eventBus.on('ExecutionConfirmed', (p: EventPayload) => {
    const txIds: string[] = p.txIds ?? [];
    if (txIds.length > 0) {
      AuditService.writeBatch(
        txIds.map((txId: string, i: number) => ({
          userId: p.userId,
          category: 'EXECUTION',
          action: 'transaction_confirmed',
          sourceEngine: 'engine6',
          relatedEntityId: p.executionId,
          relatedTxId: txId,
          valueUsd: p.totalValueUsd,
          metadata: {
            executionId: p.executionId,
            goalProfile: p.goalProfile,
            stepCount: p.stepCount,
            groupIndex: i,
          },
        })),
      ).catch(() => {});
    }
  });

  eventBus.on('ExecutionFailed', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'EXECUTION',
      action: 'execution_failed',
      status: 'FAILURE',
      sourceEngine: 'engine6',
      relatedEntityId: p.executionId,
      metadata: { reason: p.reason },
    }).catch(() => {});
  });

  eventBus.on('ExecutionBlocked', (p: EventPayload) => {
    AuditService.write({
      userId: p.userId,
      category: 'EXECUTION',
      action: 'execution_blocked',
      status: 'BLOCKED',
      sourceEngine: 'engine6',
      relatedEntityId: p.executionId,
      metadata: { reason: p.reason },
    }).catch(() => {});
  });

  logger.info('Audit listeners registered for all event categories');
}
