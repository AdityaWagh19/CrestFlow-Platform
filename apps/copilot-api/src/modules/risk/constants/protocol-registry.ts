/**
 * Protocol safety scores (0-100, higher = safer).
 * Based on: TVL, audit status, contract age, incident history.
 * Last updated: 2026-07-03 — review quarterly.
 */

export const PROTOCOL_REGISTRY: Record<string, number> = {
  'folks-finance': 88,
  // TVL: $70M+, Auditor: Runtime Verification (gold standard for Algorand)
  // Age: 3+ years, Incidents: None post-V2

  tinyman: 82,
  // TVL: $25M+, Auditor: Certora + internal
  // Age: 3+ years, Incidents: V1 exploit fixed, V2 clean

  pact: 72,
  // TVL: $8M, Audited: Yes (less rigorous)
  // Age: 2 years, Incidents: None major
};

export const PROTOCOL_RISK_THRESHOLDS = {
  LOW_PROTOCOL_SCORE_ALERT: 60,
} as const;
