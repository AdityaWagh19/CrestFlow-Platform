/**
 * Plan of Action (POA) Builder
 * Converts abstract rebalancing actions into an ordered step graph
 * with dependency resolution and atomic group assignment.
 */

import { Decimal, toDecimalString, createLogger } from '@crestflow/shared';

const logger = createLogger('execution:poa');

export type ActionType =
  'SWAP' | 'LEND_DEPOSIT' | 'LEND_WITHDRAW' | 'LP_ADD' | 'LP_REMOVE' | 'OPT_IN' | 'NO_OP';

export interface POAStep {
  stepIndex: number;
  actionType: ActionType;
  protocol: string;
  fromAssetId: number;
  toAssetId: number | null;
  fromAmountMicro: string;
  toAmountMinMicro: string | null;
  estimatedValueUsd: string;
  dependsOn: number[];
  atomicGroupIndex: number;
  metadata: Record<string, unknown>;
}

export interface PlanOfAction {
  executionId: string;
  userId: string;
  sourceEventType: string;
  sourceEventId: string;
  goalProfile: string;
  steps: POAStep[];
  totalValueUsd: string;
  estimatedFeesAlgo: string;
  createdAt: string;
}

export interface ActionInput {
  assetSymbol: string;
  direction: string;
  deltaPercent: string;
  urgency: string;
  targetAssetId?: number;
  fromAssetId?: number;
  estimatedValueUsd?: string;
}

export function buildPOA(params: {
  userId: string;
  actions: ActionInput[];
  goalProfile: string;
  sourceEventType: string;
  sourceEventId: string;
}): PlanOfAction {
  const steps: POAStep[] = [];
  let stepIndex = 0;
  let groupIndex = 0;

  for (const action of params.actions) {
    if (action.urgency === 'NONE' || action.urgency === 'LOW') {
      steps.push({
        stepIndex: stepIndex++,
        actionType: 'NO_OP',
        protocol: 'none',
        fromAssetId: action.fromAssetId ?? 0,
        toAssetId: null,
        fromAmountMicro: '0',
        toAmountMinMicro: null,
        estimatedValueUsd: '0',
        dependsOn: [],
        atomicGroupIndex: groupIndex,
        metadata: { reason: 'drift below threshold' },
      });
      continue;
    }

    // Auto-prepend OPT_IN if targeting a new asset
    if (action.targetAssetId && action.targetAssetId > 0) {
      steps.push({
        stepIndex: stepIndex++,
        actionType: 'OPT_IN',
        protocol: 'algorand',
        fromAssetId: action.targetAssetId,
        toAssetId: null,
        fromAmountMicro: '0',
        toAmountMinMicro: null,
        estimatedValueUsd: '0',
        dependsOn: [],
        atomicGroupIndex: groupIndex++,
        metadata: { assetId: action.targetAssetId },
      });
    }

    // Main action step
    const actionType = resolveActionType(action.direction);
    const prevStepIndex = steps.length > 0 ? steps[steps.length - 1]!.stepIndex : -1;

    steps.push({
      stepIndex: stepIndex++,
      actionType,
      protocol: resolveProtocol(actionType),
      fromAssetId: action.fromAssetId ?? 0,
      toAssetId: action.targetAssetId ?? null,
      fromAmountMicro: '0', // resolved at execution time from actual balances
      toAmountMinMicro: null,
      estimatedValueUsd: action.estimatedValueUsd ?? '0',
      dependsOn: prevStepIndex >= 0 ? [prevStepIndex] : [],
      atomicGroupIndex: groupIndex++,
      metadata: { assetSymbol: action.assetSymbol, deltaPercent: action.deltaPercent },
    });
  }

  const totalValueUsd = steps
    .filter((s) => s.actionType !== 'NO_OP' && s.actionType !== 'OPT_IN')
    .reduce((sum, s) => sum.plus(new Decimal(s.estimatedValueUsd)), new Decimal(0));

  const estimatedFeesAlgo = toDecimalString(new Decimal(steps.length).mul('0.001'), 6);

  logger.info(
    {
      userId: params.userId,
      stepCount: steps.length,
      totalValueUsd: toDecimalString(totalValueUsd, 2),
    },
    'POA built',
  );

  return {
    executionId: crypto.randomUUID(),
    userId: params.userId,
    sourceEventType: params.sourceEventType,
    sourceEventId: params.sourceEventId,
    goalProfile: params.goalProfile,
    steps,
    totalValueUsd: toDecimalString(totalValueUsd, 2),
    estimatedFeesAlgo,
    createdAt: new Date().toISOString(),
  };
}

function resolveActionType(direction: string): ActionType {
  if (direction === 'SELL' || direction === 'DECREASE') return 'SWAP';
  if (direction === 'BUY' || direction === 'INCREASE') return 'LEND_DEPOSIT';
  return 'NO_OP';
}

function resolveProtocol(actionType: ActionType): string {
  switch (actionType) {
    case 'SWAP':
      return 'haystack';
    case 'LEND_DEPOSIT':
    case 'LEND_WITHDRAW':
      return 'folks-finance';
    case 'LP_ADD':
    case 'LP_REMOVE':
      return 'tinyman';
    case 'OPT_IN':
      return 'algorand';
    default:
      return 'none';
  }
}
