/**
 * Risk domain events — emitted after risk analysis completes.
 *
 * Subscribed by:
 * - Engine 5 (User Intelligence / Copilot) — uses riskScore + alerts for AI context
 */

export const RiskEvents = {
  RISK_ANALYSIS_COMPLETED: 'RiskAnalysisCompleted',
} as const;

export interface RiskAnalysisCompletedPayload {
  riskSnapshotId: string;
  userId: string;
  portfolioSnapshotId: string;
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  activeAlertCount: number;
  criticalAlertCount: number;
  timestamp: string; // ISO8601 UTC
}
