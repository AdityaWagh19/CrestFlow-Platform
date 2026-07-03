/**
 * Persona Classifier — Rule-based persona assignment and behavioral drift scoring.
 *
 * Maps normalized onboarding scores to investor personas,
 * personas to Engine 3/4 goal profiles, and computes
 * behavioral drift from accumulated signals.
 */

import type { InvestorPersona, GoalProfile } from '@crestflow/shared';

/**
 * Classify normalized score (0-100) into an InvestorPersona.
 */
export function classifyPersona(normalizedScore: number): InvestorPersona {
  if (normalizedScore < 20) return 'CONSERVATIVE';
  if (normalizedScore < 40) return 'BALANCED';
  if (normalizedScore < 60) return 'GROWTH';
  if (normalizedScore < 80) return 'AGGRESSIVE';
  return 'YIELD_SEEKER';
}

/** Maps each InvestorPersona to the corresponding Engine 3/4 GoalProfile. */
const PERSONA_GOAL_MAP: Record<InvestorPersona, GoalProfile> = {
  CONSERVATIVE: 'CONSERVATIVE',
  BALANCED: 'CONSERVATIVE',
  GROWTH: 'MODERATE',
  AGGRESSIVE: 'AGGRESSIVE',
  YIELD_SEEKER: 'AGGRESSIVE',
};

/**
 * Convert an InvestorPersona to the GoalProfile consumed by Engines 3 and 4.
 */
export function personaToGoalProfile(persona: InvestorPersona): GoalProfile {
  return PERSONA_GOAL_MAP[persona];
}

/** Weight assigned to each behavioral signal type for drift calculation. */
const SIGNAL_WEIGHTS: Record<string, number> = {
  ACTED_ON_REBALANCE: 5,
  IGNORED_CRITICAL_ALERT: 10,
  IGNORES_YIELD_SUGGESTIONS: -8,
  HIGH_ENGAGEMENT: 3,
  GOAL_ESCALATION: 15,
  GOAL_DE_ESCALATION: -15,
  RISK_INACTION: 8,
};

/** 30 days in milliseconds. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compute behavioral drift score from recent signals.
 * Positive = more aggressive than stated persona.
 * Negative = more conservative than stated persona.
 * Only signals from the last 30 days are counted.
 */
export function computeDriftScore(
  signals: Array<{ signalType: string; occurredAt: Date }>,
): number {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  let sum = 0;
  for (const signal of signals) {
    if (signal.occurredAt.getTime() < cutoff) continue;
    sum += SIGNAL_WEIGHTS[signal.signalType] ?? 0;
  }
  return sum;
}
