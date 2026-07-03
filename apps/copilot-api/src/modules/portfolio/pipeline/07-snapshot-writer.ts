/**
 * Step 7 — Snapshot Writer
 * Writes the immutable PortfolioSnapshot to PostgreSQL and emits the event.
 * INSERT-only — no updates, no deletes.
 */

import { getPrisma, createLogger } from '@crestflow/shared';
import { eventBus } from '../../../lib/event-bus.js';
import {
  PortfolioEvents,
  type PortfolioSnapshotCreatedPayload,
} from '../events/portfolio.events.js';
import type { SnapshotTrigger } from '@prisma/client';
import type { AllocationResult } from './04-allocation-analyzer.js';
import type { PnlResult } from './05-pnl-calculator.js';
import type { HealthScoreResult } from './06-health-scorer.js';
import type { RawPortfolioData } from './01-data-fetcher.js';
import type { LpDecomposition } from './02-lp-decomposer.js';
import type { AssetHolding, ProtocolPosition } from '@crestflow/shared';

const logger = createLogger('portfolio:writer');

export interface PerformanceResult {
  previousValueUsd: string | null;
  changeValueUsd: string | null;
  changePercent: string | null;
  return7d: string | null;
  return30d: string | null;
  return90d: string | null;
  returnAllTime: string | null;
}

export async function writeSnapshotAndEmit(
  userId: string,
  trigger: SnapshotTrigger,
  allocation: AllocationResult,
  pnl: PnlResult,
  performance: PerformanceResult,
  health: HealthScoreResult,
  rawData: RawPortfolioData,
  decompositions: LpDecomposition[],
  holdings: AssetHolding[],
  positions: ProtocolPosition[],
): Promise<string> {
  const prisma = getPrisma();
  const snapshotAt = new Date();

  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      userId,
      snapshotAt,
      trigger,
      totalValueUsd: allocation.totalValueUsd,
      previousValueUsd: performance.previousValueUsd,
      changeValueUsd: performance.changeValueUsd,
      changePercent: performance.changePercent,
      assetAllocation: allocation.assetAllocation,
      categoryAllocation: allocation.categoryAllocation,
      protocolAllocation: allocation.protocolAllocation,
      directExposure: allocation.directExposure,
      indirectExposure: allocation.indirectExposure,
      trueExposure: allocation.trueExposure,
      unrealizedPnlUsd: pnl.unrealizedPnlUsd,
      realizedPnlUsd: pnl.realizedPnlUsd,
      yieldEarnedUsd: pnl.yieldEarnedUsd,
      feePaidUsd: pnl.feePaidUsd,
      impermanentLossUsd: pnl.impermanentLossUsd,
      return7dPercent: performance.return7d,
      return30dPercent: performance.return30d,
      return90dPercent: performance.return90d,
      returnAllTimePercent: performance.returnAllTime,
      healthScore: health.score,
      healthComponents: health.components,
      strengths: health.strengths,
      weaknesses: health.weaknesses,
      hhi: allocation.hhi,
      dataQuality: rawData.dataQuality,
      isPartial: rawData.failedSources.length > 0,
      assetHoldings: holdings as unknown as Record<string, unknown>[],
      protocolPositions: positions as unknown as Record<string, unknown>[],
      lpDecomposition: decompositions as unknown as Record<string, unknown>[],
    },
  });

  logger.info(
    {
      snapshotId: snapshot.id,
      userId,
      totalValueUsd: allocation.totalValueUsd,
      healthScore: health.score,
      isPartial: rawData.failedSources.length > 0,
    },
    'portfolio snapshot written',
  );

  const payload: PortfolioSnapshotCreatedPayload = {
    snapshotId: snapshot.id,
    userId,
    totalValueUsd: allocation.totalValueUsd,
    healthScore: health.score,
    hhi: allocation.hhi,
    isPartial: rawData.failedSources.length > 0,
    timestamp: snapshotAt.toISOString(),
  };

  eventBus.emit(PortfolioEvents.PORTFOLIO_SNAPSHOT_CREATED, payload);
  return snapshot.id;
}
