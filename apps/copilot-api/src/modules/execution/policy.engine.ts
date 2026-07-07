/**
 * Policy Engine — mandatory guardrail before any execution.
 * Fail-closed: any check failure blocks execution entirely.
 */

import { Decimal, createLogger, getPrisma } from '@crestflow/shared';
import type { PlanOfAction, ActionType } from './poa.builder.js';

const logger = createLogger('execution:policy');

const PROTOCOL_ALLOWLIST = new Set([
  'folks-finance',
  'tinyman',
  'pact',
  'haystack',
  'algorand',
  'none',
]);

const MAX_SINGLE_TXN_USD: Record<string, number> = {
  CONSERVATIVE: 1_000,
  MODERATE: 5_000,
  AGGRESSIVE: 20_000,
};

const MAX_DAILY_USD: Record<string, number> = {
  CONSERVATIVE: 5_000,
  MODERATE: 25_000,
  AGGRESSIVE: 100_000,
};

// Slippage caps by profile (used by builders at txn construction time)
export const MAX_SLIPPAGE_PCT: Record<string, number> = {
  CONSERVATIVE: 0.5,
  MODERATE: 1.0,
  AGGRESSIVE: 2.0,
};

const HIGH_VALUE_THRESHOLD_USD = 2_000;

const BLOCKED_ACTIONS: Record<string, ActionType[]> = {
  CONSERVATIVE: ['LP_ADD'],
  MODERATE: [],
  AGGRESSIVE: [],
};

export type PolicyDecision = 'APPROVED' | 'REQUIRES_APPROVAL' | 'BLOCKED';

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string | null;
  blockedStep: number | null;
}

export async function evaluatePolicy(params: {
  poa: PlanOfAction;
  goalProfile: string;
  riskScore: number;
  riskScoreCap: number;
  volumeUsed24h: string;
  userId: string;
}): Promise<PolicyResult> {
  const { poa, goalProfile, riskScore, riskScoreCap, volumeUsed24h, userId } = params;

  // 0. KYC gate — FIRST check before any other policy rule
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } });
  if (user?.kycStatus !== 'APPROVED') {
    return {
      decision: 'BLOCKED',
      reason:
        'KYC verification is required before executing transactions. Complete your identity verification in Settings.',
      blockedStep: null,
    };
  }

  // 1. Risk score gate
  if (riskScore > riskScoreCap) {
    return {
      decision: 'BLOCKED',
      reason: `Risk score (${riskScore}) exceeds profile cap (${riskScoreCap}). Execution blocked.`,
      blockedStep: null,
    };
  }

  // 2. Daily volume
  const totalPOA = new Decimal(poa.totalValueUsd);
  const usedToday = new Decimal(volumeUsed24h);
  const dailyLimit = MAX_DAILY_USD[goalProfile] ?? 5_000;

  if (usedToday.plus(totalPOA).gt(dailyLimit)) {
    return {
      decision: 'BLOCKED',
      reason: `Daily limit ($${dailyLimit}) would be exceeded. Used: $${usedToday.toFixed(2)}, POA: $${totalPOA.toFixed(2)}.`,
      blockedStep: null,
    };
  }

  // 3. Per-step checks
  let requiresApproval = false;
  const singleTxnLimit = MAX_SINGLE_TXN_USD[goalProfile] ?? 5_000;
  const blockedActions = BLOCKED_ACTIONS[goalProfile] ?? [];

  for (const step of poa.steps) {
    if (step.actionType === 'NO_OP' || step.actionType === 'OPT_IN') continue;

    if (!PROTOCOL_ALLOWLIST.has(step.protocol)) {
      return {
        decision: 'BLOCKED',
        reason: `Non-allowlisted protocol: ${step.protocol}`,
        blockedStep: step.stepIndex,
      };
    }

    if (blockedActions.includes(step.actionType)) {
      return {
        decision: 'BLOCKED',
        reason: `${step.actionType} not permitted for ${goalProfile}`,
        blockedStep: step.stepIndex,
      };
    }

    const stepValue = new Decimal(step.estimatedValueUsd);
    if (stepValue.gt(singleTxnLimit)) {
      return {
        decision: 'BLOCKED',
        reason: `Step value ($${stepValue.toFixed(2)}) exceeds limit ($${singleTxnLimit})`,
        blockedStep: step.stepIndex,
      };
    }

    if (stepValue.gt(HIGH_VALUE_THRESHOLD_USD)) {
      requiresApproval = true;
    }
  }

  if (requiresApproval) {
    return {
      decision: 'REQUIRES_APPROVAL',
      reason: `Steps exceed $${HIGH_VALUE_THRESHOLD_USD} — user approval required.`,
      blockedStep: null,
    };
  }

  logger.info({ executionId: poa.executionId, goalProfile }, 'policy approved');
  return { decision: 'APPROVED', reason: null, blockedStep: null };
}
