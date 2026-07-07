/**
 * Execution Service — orchestrates the 5-layer execution pipeline.
 */

import { createLogger, getPrisma, NotFoundError, Decimal } from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { buildPOA, type ActionInput } from './poa.builder.js';
import { evaluatePolicy } from './policy.engine.js';
import { simulateExecution } from './simulation.gate.js';
import { ExecutionEvents, type ExecutionConfirmedPayload } from './execution.events.js';

const logger = createLogger('execution:service');

/** Register event listener for StrategyPlanCreated — primary trigger for Engine 6. */
export function initExecutionEngine(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('StrategyPlanCreated', (payload: any) => {
    const userId = payload.userId as string;
    const actions = ((payload.rebalancingActions ?? []) as ActionInput[]).filter(
      (a: ActionInput) => a.urgency !== 'LOW' && a.urgency !== 'NONE',
    );

    if (actions.length === 0) return;

    ExecutionService.planExecution(userId, {
      sourceEventType: 'StrategyPlanCreated',
      sourceEventId: (payload.strategySnapshotId as string) ?? '',
      actions,
    }).catch((err: unknown) => {
      logger.error({ err, userId }, 'auto-execution plan from strategy failed');
    });
  });
  logger.info('Execution engine initialized — listening for StrategyPlanCreated');
}

const PROFILE_RISK_CAPS: Record<string, number> = {
  CONSERVATIVE: 35,
  MODERATE: 60,
  AGGRESSIVE: 85,
};

export const ExecutionService = {
  /** Build POA, run policy + simulation checks. Does NOT execute. */
  async planExecution(
    userId: string,
    params: {
      sourceEventType: string;
      sourceEventId: string;
      actions: ActionInput[];
    },
  ) {
    const prisma = getPrisma();

    const [userProfile, riskSnap] = await Promise.all([
      prisma.userGoalProfile.findUnique({ where: { userId } }),
      prisma.riskSnapshot.findFirst({ where: { userId }, orderBy: { analyzedAt: 'desc' } }),
    ]);

    const goalProfile = userProfile?.goalProfile ?? 'MODERATE';

    // Build POA
    const poa = buildPOA({
      userId,
      actions: params.actions,
      goalProfile,
      sourceEventType: params.sourceEventType,
      sourceEventId: params.sourceEventId,
    });

    // Policy check
    const volumeUsed = await getVolumeUsed24h(userId);
    const riskScoreCap = PROFILE_RISK_CAPS[goalProfile] ?? 60;

    const policyResult = await evaluatePolicy({
      poa,
      goalProfile,
      riskScore: riskSnap?.riskScore ?? 0,
      riskScoreCap,
      volumeUsed24h: volumeUsed,
      userId,
    });

    // Simulation (MVP stub)
    const simResult = simulateExecution(poa.steps.length);

    // Write execution record
    await prisma.executionRecord.create({
      data: {
        id: poa.executionId,
        userId,
        status:
          policyResult.decision === 'BLOCKED'
            ? 'POLICY_BLOCKED'
            : policyResult.decision === 'REQUIRES_APPROVAL'
              ? 'AWAITING_APPROVAL'
              : 'PENDING',
        sourceEventType: params.sourceEventType,
        sourceEventId: params.sourceEventId,
        goalProfile,
        totalValueUsd: poa.totalValueUsd,
        estimatedFeesAlgo: poa.estimatedFeesAlgo,
        stepsJson: poa.steps as unknown as Record<string, unknown>[],
        failureReason: policyResult.reason,
      },
    });

    logger.info(
      {
        userId,
        executionId: poa.executionId,
        policyDecision: policyResult.decision,
        stepCount: poa.steps.length,
      },
      'execution planned',
    );

    return {
      executionId: poa.executionId,
      policyDecision: policyResult.decision,
      policyReason: policyResult.reason,
      simulationPassed: simResult.passed,
      steps: poa.steps,
      totalValueUsd: poa.totalValueUsd,
      estimatedFeesAlgo: poa.estimatedFeesAlgo,
    };
  },

  /** Dry-run simulation — builds POA + policy + simulation but does NOT write or execute. */
  async simulateExecution(
    userId: string,
    params: { sourceEventType: string; sourceEventId: string; actions: ActionInput[] },
  ) {
    const prisma = getPrisma();
    const [userProfile, riskSnap] = await Promise.all([
      prisma.userGoalProfile.findUnique({ where: { userId } }),
      prisma.riskSnapshot.findFirst({ where: { userId }, orderBy: { analyzedAt: 'desc' } }),
    ]);
    const goalProfile = userProfile?.goalProfile ?? 'MODERATE';

    const poa = buildPOA({
      userId,
      actions: params.actions,
      goalProfile,
      sourceEventType: params.sourceEventType,
      sourceEventId: params.sourceEventId,
    });

    const volumeUsed = await getVolumeUsed24h(userId);
    const policyResult = await evaluatePolicy({
      poa,
      goalProfile,
      riskScore: riskSnap?.riskScore ?? 0,
      riskScoreCap: PROFILE_RISK_CAPS[goalProfile] ?? 60,
      volumeUsed24h: volumeUsed,
      userId,
    });

    const simResult = simulateExecution(poa.steps.length);

    logger.info(
      { userId, stepCount: poa.steps.length, policyDecision: policyResult.decision },
      'execution simulated (dry-run)',
    );

    return {
      executionId: poa.executionId,
      policyDecision: policyResult.decision,
      policyReason: policyResult.reason,
      simulationPassed: simResult.passed,
      simulationDetails: simResult,
      steps: poa.steps,
      totalValueUsd: poa.totalValueUsd,
      estimatedFeesAlgo: poa.estimatedFeesAlgo,
      dryRun: true,
    };
  },

  /** Execute a previously planned POA. */
  async submitExecution(userId: string, executionId: string) {
    const prisma = getPrisma();

    const record = await prisma.executionRecord.findFirst({
      where: { id: executionId, userId },
    });

    if (!record) throw new NotFoundError('Execution record not found');

    if (record.status !== 'PENDING' && record.status !== 'AWAITING_APPROVAL') {
      return {
        executionId,
        status: record.status,
        message: `Cannot submit — current status: ${record.status}`,
      };
    }

    // MVP: Mark as SUBMITTED then CONFIRMED (real signing/broadcast deferred)
    await prisma.executionRecord.update({
      where: { id: executionId },
      data: { status: 'SUBMITTED' },
    });

    // Write mock transaction records
    const steps = record.stepsJson as unknown as Array<{ stepIndex: number; actionType: string }>;
    const txIds: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || step.actionType === 'NO_OP') continue;

      const txId = `mock-txn-${crypto.randomUUID().slice(0, 12)}`;
      txIds.push(txId);

      await prisma.executionTransaction.create({
        data: {
          executionRecordId: executionId,
          groupIndex: i,
          txId,
          confirmed: true,
          confirmedRound: 48293710 + i,
        },
      });
    }

    // Mark confirmed
    await prisma.executionRecord.update({
      where: { id: executionId },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), durationMs: 5000 },
    });

    // Emit event
    const payload: ExecutionConfirmedPayload = {
      userId,
      executionId,
      totalValueUsd: record.totalValueUsd,
      stepCount: steps.length,
      txIds,
      goalProfile: record.goalProfile,
      timestamp: new Date().toISOString(),
    };
    eventBus.emit(ExecutionEvents.EXECUTION_CONFIRMED, payload);

    logger.info({ userId, executionId, txCount: txIds.length }, 'execution confirmed (MVP stub)');

    return { executionId, status: 'CONFIRMED', message: 'Execution confirmed', txIds };
  },

  /** Get execution status. */
  async getStatus(userId: string, executionId: string) {
    const prisma = getPrisma();
    const record = await prisma.executionRecord.findFirst({
      where: { id: executionId, userId },
      include: { transactions: true },
    });
    if (!record) throw new NotFoundError('Execution not found');
    return record;
  },

  /** Paginated execution history. */
  async getHistory(userId: string, page: number, pageSize: number) {
    const prisma = getPrisma();
    const [records, total] = await Promise.all([
      prisma.executionRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          totalValueUsd: true,
          goalProfile: true,
          confirmedAt: true,
          durationMs: true,
          createdAt: true,
        },
      }),
      prisma.executionRecord.count({ where: { userId } }),
    ]);
    return { records, total, page };
  },

  /** Enable autopilot (Phase 3 stub). */
  async enableAutopilot(userId: string) {
    const prisma = getPrisma();
    await prisma.autopilotConfig.upsert({
      where: { userId },
      create: { userId, enabled: true, enabledAt: new Date() },
      update: { enabled: true, enabledAt: new Date() },
    });
    return {
      autopilotEnabled: true,
      message: 'Autopilot preference saved. Autonomous execution launches in Phase 3.',
      currentBehavior: 'All actions continue to require your explicit approval.',
    };
  },

  /** Disable autopilot. */
  async disableAutopilot(userId: string) {
    const prisma = getPrisma();
    await prisma.autopilotConfig.upsert({
      where: { userId },
      create: { userId, enabled: false, disabledAt: new Date() },
      update: { enabled: false, disabledAt: new Date() },
    });
    return { autopilotEnabled: false, message: 'Autopilot disabled.' };
  },
};

async function getVolumeUsed24h(userId: string): Promise<string> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const records = await prisma.executionRecord.findMany({
    where: { userId, status: 'CONFIRMED', confirmedAt: { gte: since } },
    select: { totalValueUsd: true },
  });
  return records
    .reduce(
      (sum: Decimal, r: { totalValueUsd: string }) => sum.plus(new Decimal(r.totalValueUsd)),
      new Decimal(0),
    )
    .toFixed(8);
}
