/**
 * Portfolio Service — Orchestrates the 7-step portfolio analysis pipeline.
 * This is the main entry point for portfolio scans.
 */

import {
  createLogger,
  NotFoundError,
  InternalError,
  Decimal,
  toDecimalString,
} from '@crestflow/shared';
import { fetchPortfolioData } from './pipeline/01-data-fetcher.js';
import { decomposeLpPositions } from './pipeline/02-lp-decomposer.js';
import { analyzeAllocation } from './pipeline/04-allocation-analyzer.js';
import { calculatePnl } from './pipeline/05-pnl-calculator.js';
import { calculateHealthScore } from './pipeline/06-health-scorer.js';
import { writeSnapshotAndEmit } from './pipeline/07-snapshot-writer.js';
import { SnapshotRepository } from './repositories/snapshot.repository.js';
import { CostBasisRepository } from './repositories/cost-basis.repository.js';
import {
  PriceService,
  normalizeAssetHoldings,
  normalizeFolksPositions,
  normalizeTinymanPositions,
  normalizePactPositions,
} from '../knowledge/knowledge.module.js';
import type { SnapshotTrigger } from '@prisma/client';

const logger = createLogger('portfolio:service');

export const PortfolioService = {
  /**
   * Run the full 7-step portfolio analysis pipeline.
   * Returns the snapshotId of the newly created snapshot.
   */
  async runScan(
    userId: string,
    algorandAddress: string,
    trigger: SnapshotTrigger,
  ): Promise<string> {
    const startTime = Date.now();
    logger.info(
      { userId, trigger, address: algorandAddress.slice(0, 8) + '...' },
      'portfolio scan started',
    );

    // ── Step 1: Parallel data fetch ─────────────────────────────────────
    const rawData = await fetchPortfolioData(algorandAddress);

    // If ALL adapters failed, abort — do NOT write empty snapshot
    if (!rawData.account && rawData.failedSources.includes('indexer')) {
      logger.error({ userId }, 'all adapters failed — aborting scan');
      throw new InternalError('Portfolio scan failed — could not fetch account data');
    }

    // ── Step 2: Collect all unique asset IDs for price fetch ────────────
    const assetIds = new Set<number>();
    assetIds.add(0); // native ALGO always needed

    if (rawData.account) {
      for (const asa of rawData.account.assets) {
        assetIds.add(asa['asset-id']);
      }
    }

    for (const fp of rawData.folksPositions) {
      assetIds.add(fp.assetId);
    }
    for (const tp of rawData.tinymanPositions) {
      assetIds.add(tp.pool.asset1Id);
      assetIds.add(tp.pool.asset2Id);
    }
    for (const pp of rawData.pactPositions) {
      assetIds.add(pp.pool.primaryAssetId);
      assetIds.add(pp.pool.secondaryAssetId);
    }

    // ── Step 3: Fetch prices for all detected assets ────────────────────
    const prices = await PriceService.getPricesForAssets([...assetIds]);

    // ── Step 4: Normalize raw data into canonical types ─────────────────
    const holdings = rawData.account ? normalizeAssetHoldings(rawData.account, prices) : [];

    const folksPositions = normalizeFolksPositions(rawData.folksPositions, prices);
    const tinymanPositions = normalizeTinymanPositions(rawData.tinymanPositions, prices);
    const pactPositions = normalizePactPositions(rawData.pactPositions, prices);
    const allPositions = [...folksPositions, ...tinymanPositions, ...pactPositions];

    // ── Step 5: LP Decomposition ────────────────────────────────────────
    const decompositions = decomposeLpPositions(
      rawData.tinymanPositions,
      rawData.pactPositions,
      prices,
    );

    // ── Step 6: Allocation + Exposure Analysis ──────────────────────────
    const allocation = analyzeAllocation(holdings, allPositions, decompositions);

    // ── Step 7: PnL Calculation ─────────────────────────────────────────
    const costBases = await CostBasisRepository.getAllForUser(userId);
    const pnl = calculatePnl(holdings, costBases, rawData.transactions, decompositions, prices);

    // ── Step 8: Performance (historical comparison) ─────────────────────
    const performance = await SnapshotRepository.calculatePerformance(
      userId,
      allocation.totalValueUsd,
    );

    // ── Step 9: Health Score ─────────────────────────────────────────────
    const health = calculateHealthScore(allocation.hhi, allocation, allPositions);

    // ── Step 10: Write snapshot + emit event ─────────────────────────────
    const snapshotId = await writeSnapshotAndEmit(
      userId,
      trigger,
      allocation,
      pnl,
      performance,
      health,
      rawData,
      decompositions,
      holdings,
      allPositions,
    );

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        userId,
        snapshotId,
        totalValueUsd: allocation.totalValueUsd,
        healthScore: health.score,
        durationMs,
      },
      'portfolio scan complete',
    );

    return snapshotId;
  },

  /** Get the latest portfolio overview for a user. */
  async getOverview(userId: string) {
    const snapshot = await SnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No portfolio snapshot found. Trigger a scan first.');

    return {
      totalValueUsd: snapshot.totalValueUsd,
      previousValueUsd: snapshot.previousValueUsd,
      changeValueUsd: snapshot.changeValueUsd,
      changePercent: snapshot.changePercent,
      healthScore: snapshot.healthScore,
      hhi: snapshot.hhi,
      isPartial: snapshot.isPartial,
      snapshotAt: snapshot.snapshotAt.toISOString(),
      trigger: snapshot.trigger,
    };
  },

  /** Get full allocation breakdown. */
  async getAllocation(userId: string) {
    const snapshot = await SnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No portfolio snapshot found.');

    return {
      assets: snapshot.assetAllocation,
      categories: snapshot.categoryAllocation,
      protocols: snapshot.protocolAllocation,
    };
  },

  /** Get exposure breakdown (direct, indirect, true). */
  async getExposure(userId: string) {
    const snapshot = await SnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No portfolio snapshot found.');

    return {
      direct: snapshot.directExposure,
      indirect: snapshot.indirectExposure,
      true: snapshot.trueExposure,
      impermanentLoss: {
        totalUsd: snapshot.impermanentLossUsd,
        byPool: snapshot.lpDecomposition,
      },
    };
  },

  /** Get performance and PnL data. */
  async getPerformance(userId: string) {
    const snapshot = await SnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No portfolio snapshot found.');

    // Calculate return USD from percentage + total value
    const totalVal = new Decimal(snapshot.totalValueUsd);
    const calcReturnUsd = (pct: string | null): string | null => {
      if (!pct) return null;
      const p = new Decimal(pct).div(100);
      const prevVal = totalVal.div(p.plus(1));
      return toDecimalString(totalVal.minus(prevVal), 2);
    };

    return {
      '7d': {
        returnPercent: snapshot.return7dPercent,
        returnUsd: calcReturnUsd(snapshot.return7dPercent),
      },
      '30d': {
        returnPercent: snapshot.return30dPercent,
        returnUsd: calcReturnUsd(snapshot.return30dPercent),
      },
      '90d': {
        returnPercent: snapshot.return90dPercent,
        returnUsd: calcReturnUsd(snapshot.return90dPercent),
      },
      allTime: {
        returnPercent: snapshot.returnAllTimePercent,
        returnUsd: calcReturnUsd(snapshot.returnAllTimePercent),
      },
      pnl: {
        unrealizedUsd: snapshot.unrealizedPnlUsd,
        realizedUsd: snapshot.realizedPnlUsd,
        yieldEarnedUsd: snapshot.yieldEarnedUsd,
        feePaidUsd: snapshot.feePaidUsd,
        impermanentLossUsd: snapshot.impermanentLossUsd,
      },
    };
  },

  /** Get health score with component breakdown. */
  async getHealth(userId: string) {
    const snapshot = await SnapshotRepository.getLatest(userId);
    if (!snapshot) throw new NotFoundError('No portfolio snapshot found.');

    return {
      score: snapshot.healthScore,
      components: snapshot.healthComponents,
      strengths: snapshot.strengths,
      weaknesses: snapshot.weaknesses,
      hhi: snapshot.hhi,
    };
  },

  /** Get paginated snapshot history. */
  async getSnapshots(userId: string, page: number, pageSize: number) {
    const [snapshots, total] = await Promise.all([
      SnapshotRepository.getHistory(userId, page, pageSize),
      SnapshotRepository.count(userId),
    ]);

    return {
      snapshots,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },
};
