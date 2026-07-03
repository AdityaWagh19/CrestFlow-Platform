/**
 * Risk Service — Orchestrates the 6-step risk analysis pipeline.
 * Subscribes to PortfolioSnapshotCreated events from Engine 1.
 */

import { createLogger, getPrisma, NotFoundError, InternalError } from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { PortfolioEvents } from '../portfolio/events/portfolio.events.js';
import type { PortfolioSnapshotCreatedPayload } from '../portfolio/events/portfolio.events.js';
import { extractReturnSeries } from './analyzers/return-series.js';
import { analyzeMarketRisk } from './analyzers/market-risk.analyzer.js';
import { analyzeLiquidationRisk } from './analyzers/liquidation.analyzer.js';
import { analyzeConcentrationRisk } from './analyzers/concentration.analyzer.js';
import { analyzeProtocolRisk } from './analyzers/protocol-risk.analyzer.js';
import { analyzeLiquidityRisk } from './analyzers/liquidity.analyzer.js';
import { computeCompositeRiskScore } from './scoring/composite-scorer.js';
import { evaluateAlertConditions } from './alerts/alert-evaluator.js';
import { AlertRepository } from './alerts/alert-repository.js';
import { RiskSnapshotRepository } from './repositories/risk-snapshot.repository.js';
import { RiskEvents, type RiskAnalysisCompletedPayload } from './events/risk.events.js';
import type { ProtocolPosition } from '@crestflow/shared';

const logger = createLogger('risk:service');

/** Register event listener for PortfolioSnapshotCreated. */
export function initRiskEngine(): void {
  eventBus.on(
    PortfolioEvents.PORTFOLIO_SNAPSHOT_CREATED,
    (payload: PortfolioSnapshotCreatedPayload) => {
      runRiskAnalysis(payload.userId, payload.snapshotId).catch((err: unknown) => {
        logger.error({ err, userId: payload.userId }, 'risk analysis failed');
      });
    },
  );
  logger.info('Risk engine initialized — listening for PortfolioSnapshotCreated');
}

/**
 * Run the full risk analysis pipeline.
 */
async function runRiskAnalysis(userId: string, portfolioSnapshotId: string): Promise<string> {
  const startTime = Date.now();
  const prisma = getPrisma();

  // ── Step 1: Load current snapshot + historical series ──────────────────
  const currentSnapshot = await prisma.portfolioSnapshot.findUnique({
    where: { id: portfolioSnapshotId },
  });
  if (!currentSnapshot) {
    throw new InternalError(`Portfolio snapshot ${portfolioSnapshotId} not found`);
  }

  const historicalSnapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId },
    orderBy: { snapshotAt: 'desc' },
    take: 90,
    select: { totalValueUsd: true, snapshotAt: true },
  });

  logger.info(
    { userId, portfolioSnapshotId, snapshotCount: historicalSnapshots.length },
    'risk analysis started',
  );

  // ── Step 2: Extract return series ─────────────────────────────────────
  const returns = extractReturnSeries(historicalSnapshots);
  const snapshotValues = [...historicalSnapshots]
    .sort(
      (a: { snapshotAt: Date }, b: { snapshotAt: Date }) =>
        a.snapshotAt.getTime() - b.snapshotAt.getTime(),
    )
    .map((s: { totalValueUsd: string }) => s.totalValueUsd);

  // ── Step 3: Run 6 analyzers in parallel ───────────────────────────────
  const protocolPositions = (currentSnapshot.protocolPositions ??
    []) as unknown as ProtocolPosition[];
  const trueExposure = (currentSnapshot.trueExposure ?? {}) as Record<string, { percent: string }>;
  const protocolAllocation = (currentSnapshot.protocolAllocation ?? {}) as {
    folks: string;
    tinyman: string;
    pact: string;
    native: string;
  };

  const [marketResult, liquidationResult, concentrationResult, protocolResult, liquidityResult] =
    await Promise.allSettled([
      Promise.resolve(analyzeMarketRisk(returns, snapshotValues)),
      Promise.resolve(analyzeLiquidationRisk(protocolPositions)),
      Promise.resolve(analyzeConcentrationRisk(trueExposure, protocolAllocation)),
      Promise.resolve(analyzeProtocolRisk(protocolAllocation)),
      Promise.resolve(analyzeLiquidityRisk(protocolPositions)),
    ]);

  const market = marketResult.status === 'fulfilled' ? marketResult.value : null;
  const liquidation = liquidationResult.status === 'fulfilled' ? liquidationResult.value : null;
  const concentration =
    concentrationResult.status === 'fulfilled' ? concentrationResult.value : null;
  const protocol = protocolResult.status === 'fulfilled' ? protocolResult.value : null;
  const liquidity = liquidityResult.status === 'fulfilled' ? liquidityResult.value : null;

  // ── Step 4: Composite risk score ──────────────────────────────────────
  const composite = computeCompositeRiskScore(
    market?.componentScore ?? 15,
    liquidation?.componentScore ?? 0,
    concentration?.componentScore ?? 50,
    protocol?.componentScore ?? 15,
    liquidity?.componentScore ?? 0,
    liquidation?.hasActiveBorrows ?? false,
  );

  // ── Step 5: Alert generation ──────────────────────────────────────────
  const defaultMarket = {
    cvar95Percent: null,
    var95Percent: null,
    sortinoRatio: null,
    maxDrawdownPercent: null,
    calmarRatio: null,
    realizedVol7dPercent: null,
    realizedVol30dPercent: null,
    snapshotsUsed: 0,
    insufficientHistory: true,
    componentScore: 15,
  };
  const defaultLiquidation = {
    positions: [],
    minHealthFactor: null,
    componentScore: 0,
    hasActiveBorrows: false,
  };
  const defaultConcentration = { assetHhi: '0', protocolHhi: '0', componentScore: 0 };
  const defaultLiquidity = { positions: [], maxExitImpactPercent: '0', componentScore: 0 };

  const alertConditions = evaluateAlertConditions(
    market ?? defaultMarket,
    liquidation ?? defaultLiquidation,
    concentration ?? defaultConcentration,
    liquidity ?? defaultLiquidity,
    protocol?.protocolScores ?? {},
  );

  const { activeCount, criticalCount } = await AlertRepository.processAlerts(
    userId,
    alertConditions,
  );

  // ── Step 6: Write risk snapshot + emit event ──────────────────────────
  const riskSnapshot = await prisma.riskSnapshot.create({
    data: {
      userId,
      portfolioSnapshotId,
      analyzedAt: new Date(),
      cvar95Percent: market?.cvar95Percent ?? null,
      var95Percent: market?.var95Percent ?? null,
      sortinoRatio: market?.sortinoRatio ?? null,
      maxDrawdownPercent: market?.maxDrawdownPercent ?? null,
      calmarRatio: market?.calmarRatio ?? null,
      realizedVol7dPercent: market?.realizedVol7dPercent ?? null,
      realizedVol30dPercent: market?.realizedVol30dPercent ?? null,
      snapshotsUsed: market?.snapshotsUsed ?? 0,
      insufficientHistory: market?.insufficientHistory ?? true,
      liquidationPositions: liquidation?.positions ?? null,
      minHealthFactor: liquidation?.minHealthFactor ?? null,
      liquidationRiskScore: liquidation?.componentScore ?? null,
      hhi: currentSnapshot.hhi,
      assetHhi: concentration?.assetHhi ?? '0',
      protocolHhi: concentration?.protocolHhi ?? '0',
      concentrationScore: concentration?.componentScore ?? 0,
      protocolScores: protocol?.protocolScores ?? {},
      weightedProtocolScore: protocol?.weightedProtocolScore ?? '0',
      protocolRiskScore: protocol?.componentScore ?? 0,
      exitRiskPositions: liquidity?.positions ?? [],
      maxExitImpactPercent: liquidity?.maxExitImpactPercent ?? '0',
      liquidityRiskScore: liquidity?.componentScore ?? 0,
      riskScore: composite.riskScore,
      riskLevel: composite.riskLevel,
      scoreComponents: composite.components,
      activeAlertCount: activeCount,
      criticalAlertCount: criticalCount,
    },
  });

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      userId,
      riskSnapshotId: riskSnapshot.id,
      riskScore: composite.riskScore,
      riskLevel: composite.riskLevel,
      activeAlerts: activeCount,
      durationMs,
    },
    'risk analysis complete',
  );

  const eventPayload: RiskAnalysisCompletedPayload = {
    riskSnapshotId: riskSnapshot.id,
    userId,
    portfolioSnapshotId,
    riskScore: composite.riskScore,
    riskLevel: composite.riskLevel,
    activeAlertCount: activeCount,
    criticalAlertCount: criticalCount,
    timestamp: new Date().toISOString(),
  };
  eventBus.emit(RiskEvents.RISK_ANALYSIS_COMPLETED, eventPayload);

  return riskSnapshot.id;
}

export const RiskService = {
  /** Get composite risk score and breakdown. */
  async getRiskScore(userId: string) {
    const snapshot = await RiskSnapshotRepository.getLatest(userId);
    if (!snapshot)
      throw new NotFoundError('No risk analysis found. Trigger a portfolio scan first.');

    return {
      riskScore: snapshot.riskScore,
      riskLevel: snapshot.riskLevel,
      components: snapshot.scoreComponents,
      activeAlerts: snapshot.activeAlertCount,
      criticalAlerts: snapshot.criticalAlertCount,
      analyzedAt: snapshot.analyzedAt.toISOString(),
      insufficientHistory: snapshot.insufficientHistory,
    };
  },

  /** Get market risk metrics. */
  async getMarketRisk(userId: string) {
    const snapshot = await RiskSnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No risk analysis found.');

    return {
      cvar95Percent: snapshot.cvar95Percent,
      var95Percent: snapshot.var95Percent,
      sortinoRatio: snapshot.sortinoRatio,
      maxDrawdownPercent: snapshot.maxDrawdownPercent,
      calmarRatio: snapshot.calmarRatio,
      realizedVol7dPercent: snapshot.realizedVol7dPercent,
      realizedVol30dPercent: snapshot.realizedVol30dPercent,
      snapshotsUsed: snapshot.snapshotsUsed,
      insufficientHistory: snapshot.insufficientHistory,
    };
  },

  /** Get liquidation risk data. */
  async getLiquidationRisk(userId: string) {
    const snapshot = await RiskSnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No risk analysis found.');

    return {
      hasActiveBorrows: snapshot.liquidationRiskScore !== null && snapshot.liquidationRiskScore > 0,
      minHealthFactor: snapshot.minHealthFactor,
      positions: snapshot.liquidationPositions ?? [],
    };
  },

  /** Get concentration risk data. */
  async getConcentrationRisk(userId: string) {
    const snapshot = await RiskSnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No risk analysis found.');

    const assetHhi = new (await import('@crestflow/shared')).Decimal(snapshot.assetHhi).toNumber();
    const interpretation =
      assetHhi > 5000
        ? 'High concentration — HHI above 5000'
        : assetHhi > 2500
          ? 'Moderate concentration — HHI above 2500'
          : 'Well-diversified — HHI below 2500';

    return {
      assetHhi: snapshot.assetHhi,
      protocolHhi: snapshot.protocolHhi,
      hhiInterpretation: interpretation,
    };
  },

  /** Get alerts with filters. */
  async getAlerts(
    userId: string,
    filters: { status?: string; severity?: string; page?: number; pageSize?: number },
  ) {
    return AlertRepository.getAlerts(userId, filters);
  },

  /** Dismiss an alert. */
  async dismissAlert(alertId: string, userId: string) {
    const dismissed = await AlertRepository.dismiss(alertId, userId);
    if (!dismissed) throw new NotFoundError('Alert not found or already dismissed.');
    return { alertId, status: 'DISMISSED' };
  },
};
