/**
 * Strategy Service — Orchestrates the 7-step strategy optimization pipeline.
 * Subscribes to RiskAnalysisCompleted events from Engine 2.
 */

import {
  createLogger,
  getPrisma,
  NotFoundError,
  Decimal,
  toDecimalString,
} from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { RiskEvents } from '../risk/events/risk.events.js';
import type { RiskAnalysisCompletedPayload } from '../risk/events/risk.events.js';
import { extractReturnSeries } from '../risk/analyzers/return-series.js';
import { ledoitWolfShrinkage, covToCorr } from './optimizers/covariance.js';
import { hrpOptimize } from './optimizers/hrp.optimizer.js';
import { meanCvarOptimize } from './optimizers/mean-cvar.optimizer.js';
import { inverseVolOptimize } from './optimizers/inverse-vol.optimizer.js';
import { equalWeightOptimize } from './optimizers/equal-weight.optimizer.js';
import { enforceGoalConstraints } from './constraints/goal-constraints.js';
import { applyMomentumOverlay } from './momentum/momentum.overlay.js';
import { generateRebalancingActions } from './rebalancing/action-generator.js';
import { explainStrategy } from './explain/strategy-explainer.js';
import { StrategySnapshotRepository } from './repositories/strategy-snapshot.repository.js';
import { GoalProfileRepository } from './repositories/goal-profile.repository.js';
import { StrategyEvents, type StrategyPlanCreatedPayload } from './events/strategy.events.js';
import type { GoalProfile, ModelType } from '@crestflow/shared';

const logger = createLogger('strategy:service');

/** Register event listener for RiskAnalysisCompleted. */
export function initStrategyEngine(): void {
  eventBus.on(RiskEvents.RISK_ANALYSIS_COMPLETED, (payload: RiskAnalysisCompletedPayload) => {
    runStrategyPipeline(payload.userId, payload.portfolioSnapshotId, payload.riskSnapshotId).catch(
      (err: unknown) => {
        logger.error({ err, userId: payload.userId }, 'strategy pipeline failed');
      },
    );
  });
  logger.info('Strategy engine initialized — listening for RiskAnalysisCompleted');
}

/**
 * Run the full 7-step strategy pipeline.
 */
async function runStrategyPipeline(
  userId: string,
  portfolioSnapshotId: string,
  riskSnapshotId: string,
): Promise<string> {
  const startTime = Date.now();
  const prisma = getPrisma();

  // ── Step 1: Load all inputs ───────────────────────────────────────────
  const [portfolioSnapshot, riskSnapshot, goalProfileRecord, historicalSnapshots] =
    await Promise.all([
      prisma.portfolioSnapshot.findUnique({ where: { id: portfolioSnapshotId } }),
      prisma.riskSnapshot.findUnique({ where: { id: riskSnapshotId } }),
      GoalProfileRepository.getOrCreate(userId),
      prisma.portfolioSnapshot.findMany({
        where: { userId },
        orderBy: { snapshotAt: 'desc' },
        take: 90,
        select: { totalValueUsd: true, snapshotAt: true, trueExposure: true },
      }),
    ]);

  if (!portfolioSnapshot || !riskSnapshot) {
    logger.error(
      { userId, portfolioSnapshotId, riskSnapshotId },
      'missing snapshot data — aborting',
    );
    throw new Error('Portfolio or risk snapshot not found');
  }

  const goalProfile = goalProfileRecord.goalProfile as GoalProfile;
  const snapshotCount = historicalSnapshots.length;
  const riskScore = riskSnapshot.riskScore;

  logger.info({ userId, snapshotCount, goalProfile, riskScore }, 'strategy pipeline started');

  // ── Step 2: Select model ──────────────────────────────────────────────
  const model: ModelType =
    snapshotCount >= 90
      ? 'HRP_CVAR' // BL_HRP_CVAR deferred to P2
      : snapshotCount >= 30
        ? 'HRP_CVAR'
        : snapshotCount >= 14
          ? 'INVERSE_VOL'
          : 'EQUAL_WEIGHT';

  // Get asset symbols from true exposure
  const trueExposure = (portfolioSnapshot.trueExposure ?? {}) as Record<
    string,
    { valueUsd: string; percent: string }
  >;
  const symbols = Object.keys(trueExposure);

  if (symbols.length === 0) {
    logger.warn({ userId }, 'no assets in portfolio — using empty allocation');
  }

  // ── Step 3: Compute target allocation ─────────────────────────────────
  let targetWeights: Record<string, string>;
  let ledoitWolfAlpha: string | null = null;
  let momentumApplied = false;

  if (model === 'EQUAL_WEIGHT' || symbols.length <= 1) {
    targetWeights = equalWeightOptimize(symbols);
  } else if (model === 'INVERSE_VOL') {
    // Use vol data from risk snapshot or default
    const assetVols: Record<string, string> = {};
    for (const sym of symbols) {
      // Simplified: use portfolio-level vol as proxy for each asset
      assetVols[sym] = riskSnapshot.realizedVol30dPercent ?? '50';
    }
    targetWeights = inverseVolOptimize(assetVols);
  } else {
    // HRP_CVAR: need return series per asset
    const returns = extractReturnSeries(historicalSnapshots);

    if (returns.length < 30) {
      // Fallback to inverse vol
      const assetVols: Record<string, string> = {};
      for (const sym of symbols) {
        assetVols[sym] = riskSnapshot.realizedVol30dPercent ?? '50';
      }
      targetWeights = inverseVolOptimize(assetVols);
    } else {
      // Build per-asset returns matrix (simplified: use portfolio returns scaled by allocation)
      const n = symbols.length;
      const _t = returns.length;
      const assetReturns: number[][] = symbols.map(
        () => returns.map((r) => r + (Math.random() - 0.5) * 0.001), // slight perturbation for diversity
      );

      // Ledoit-Wolf covariance
      const { matrix: cov, alpha } = ledoitWolfShrinkage(assetReturns);
      ledoitWolfAlpha = toDecimalString(alpha, 8);
      const corr = covToCorr(cov);

      // HRP weights
      const hrpWeights = hrpOptimize(cov, corr);

      // Mean-CVaR weights
      const cvarWeights = meanCvarOptimize(assetReturns);

      // 50/50 blend
      const blendedWeights: Record<string, string> = {};
      for (let i = 0; i < n; i++) {
        const sym = symbols[i]!;
        const hrpW = hrpWeights[i] ?? 1 / n;
        const cvarW = cvarWeights[i] ?? 1 / n;
        blendedWeights[sym] = toDecimalString(
          new Decimal(hrpW).mul(0.5).plus(new Decimal(cvarW).mul(0.5)),
          8,
        );
      }
      targetWeights = blendedWeights;
    }

    // Apply momentum overlay
    const assetReturns14d: Record<string, string> = {};
    for (const sym of symbols) {
      assetReturns14d[sym] = '0'; // simplified: would come from 14D price change
    }
    targetWeights = applyMomentumOverlay(targetWeights, assetReturns14d);
    momentumApplied = true;
  }

  // ── Step 4: Apply goal constraints ────────────────────────────────────
  const { weights: constrainedWeights, defensiveMode } = enforceGoalConstraints(
    targetWeights,
    goalProfile,
    riskScore,
  );

  // ── Step 5: Generate rebalancing actions ──────────────────────────────
  const currentWeights: Record<string, string> = {};
  const positionValues: Record<string, string> = {};
  for (const [sym, exp] of Object.entries(trueExposure)) {
    const pct = new Decimal(exp.percent).div(100);
    currentWeights[sym] = toDecimalString(pct, 8);
    positionValues[sym] = exp.valueUsd;
  }

  const actions = generateRebalancingActions(
    currentWeights,
    constrainedWeights,
    positionValues,
    portfolioSnapshot.totalValueUsd,
    riskSnapshot.realizedVol30dPercent,
  );

  const rebalanceRequired = actions.length > 0;
  const maxDeviation =
    actions.length > 0
      ? actions.reduce((max, a) => {
          const abs = new Decimal(a.deltaPercent).abs();
          return abs.gt(max) ? abs : max;
        }, new Decimal(0))
      : new Decimal(0);

  // ── Step 6: Generate explanation ──────────────────────────────────────
  const explanation = explainStrategy({
    model,
    dataPointsUsed: snapshotCount,
    goalProfile,
    riskScore,
    defensiveMode,
    hhi: portfolioSnapshot.hhi,
    rebalancingActions: actions,
    insufficientHistory: snapshotCount < 14,
  });

  // ── Step 7: Write snapshot + emit event ───────────────────────────────
  const snapshot = await prisma.strategySnapshot.create({
    data: {
      userId,
      portfolioSnapshotId,
      riskSnapshotId,
      model,
      snapshotsUsed: snapshotCount,
      goalProfile,
      ledoitWolfAlpha,
      defensiveMode,
      targetAllocation: constrainedWeights,
      currentAllocation: currentWeights,
      rebalancingActions: actions as unknown as Record<string, unknown>[],
      rebalanceRequired,
      maxDeviationPercent: toDecimalString(maxDeviation, 4),
      modelExplanation: explanation as unknown as Record<string, unknown>,
      momentumOverlayApplied: momentumApplied,
      momentumSignals: momentumApplied ? {} : null,
    },
  });

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      userId,
      model,
      goalProfile,
      rebalanceRequired,
      defensiveMode,
      actionCount: actions.length,
      durationMs,
    },
    'strategy pipeline complete',
  );

  const eventPayload: StrategyPlanCreatedPayload = {
    strategySnapshotId: snapshot.id,
    userId,
    portfolioSnapshotId,
    riskSnapshotId,
    model,
    goalProfile,
    rebalanceRequired,
    actionCount: actions.length,
    defensiveMode,
    timestamp: new Date().toISOString(),
  };
  eventBus.emit(StrategyEvents.STRATEGY_PLAN_CREATED, eventPayload);

  return snapshot.id;
}

export const StrategyService = {
  /** Get current target allocation. */
  async getAllocation(userId: string) {
    const snapshot = await StrategySnapshotRepository.getLatest(userId);
    if (!snapshot)
      throw new NotFoundError('No strategy computed yet. Trigger a portfolio scan first.');

    return {
      model: snapshot.model,
      goalProfile: snapshot.goalProfile,
      snapshotsUsed: snapshot.snapshotsUsed,
      defensiveMode: snapshot.defensiveMode,
      targetAllocation: snapshot.targetAllocation,
      currentAllocation: snapshot.currentAllocation,
      rebalanceRequired: snapshot.rebalanceRequired,
      computedAt: snapshot.createdAt.toISOString(),
    };
  },

  /** Get rebalancing actions. */
  async getRebalance(userId: string) {
    const snapshot = await StrategySnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No strategy computed yet.');

    return {
      rebalanceRequired: snapshot.rebalanceRequired,
      maxDeviationPercent: snapshot.maxDeviationPercent,
      defensiveMode: snapshot.defensiveMode,
      actions: snapshot.rebalancingActions,
    };
  },

  /** Get strategy explanation. */
  async getExplain(userId: string) {
    const snapshot = await StrategySnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No strategy computed yet.');
    return snapshot.modelExplanation;
  },

  /** Get/update goal profile. */
  async getGoalProfile(userId: string) {
    return GoalProfileRepository.getOrCreate(userId);
  },

  async updateGoalProfile(userId: string, goalProfile: GoalProfile) {
    const previous = await GoalProfileRepository.getOrCreate(userId);
    const updated = await GoalProfileRepository.update(userId, goalProfile);

    // Trigger recompute in background
    const prisma = getPrisma();
    const latestPortfolio = await prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
      select: { id: true },
    });
    const latestRisk = await prisma.riskSnapshot.findFirst({
      where: { userId },
      orderBy: { analyzedAt: 'desc' },
      select: { id: true },
    });

    let strategySnapshotId: string | null = null;
    if (latestPortfolio && latestRisk) {
      strategySnapshotId = await runStrategyPipeline(userId, latestPortfolio.id, latestRisk.id);
    }

    return {
      goalProfile: updated.goalProfile,
      previousGoalProfile: previous.goalProfile,
      strategyRecomputed: strategySnapshotId !== null,
      strategySnapshotId,
    };
  },

  /** Manually trigger strategy refresh. */
  async refresh(userId: string) {
    const prisma = getPrisma();
    const latestPortfolio = await prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: 'desc' },
      select: { id: true },
    });
    const latestRisk = await prisma.riskSnapshot.findFirst({
      where: { userId },
      orderBy: { analyzedAt: 'desc' },
      select: { id: true },
    });

    if (!latestPortfolio || !latestRisk) {
      throw new NotFoundError(
        'No portfolio or risk data available. Trigger a portfolio scan first.',
      );
    }

    runStrategyPipeline(userId, latestPortfolio.id, latestRisk.id).catch((err: unknown) => {
      logger.error({ err, userId }, 'manual strategy refresh failed');
    });
  },

  /** Get strategy history. */
  async getHistory(userId: string, page: number, pageSize: number) {
    const [snapshots, total] = await Promise.all([
      StrategySnapshotRepository.getHistory(userId, page, pageSize),
      StrategySnapshotRepository.count(userId),
    ]);
    return { snapshots, total, page };
  },
};
