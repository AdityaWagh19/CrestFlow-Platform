/**
 * Yield Service — Orchestrates the Engine 4 yield discovery pipeline.
 * Subscribes to PortfolioSnapshotCreated events from Engine 1.
 *
 * Pipeline:
 *  1. Fetch pool data from all protocol adapters
 *  2. Build opportunity list with APY, sustainability, and TVL data
 *  3. Rank via TOPSIS
 *  4. Score portfolio fit + compute final score
 *  5. Write YieldOpportunitySnapshot records
 *  6. Run idle capital detection
 *  7. Write IdleCapitalSignal records
 *  8. Emit YieldOpportunitiesUpdated event
 */

import {
  Decimal,
  toDecimalString,
  createLogger,
  getPrisma,
  NotFoundError,
} from '@crestflow/shared';
import type { GoalProfile, OpportunityType, SustainabilityTier, TvlTrend } from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { PortfolioEvents } from '../portfolio/events/portfolio.events.js';
import type { PortfolioSnapshotCreatedPayload } from '../portfolio/events/portfolio.events.js';
import { FolksFinanceAdapter } from '../knowledge/adapters/folks-finance.adapter.js';
import { TinymanAdapter } from '../knowledge/adapters/tinyman.adapter.js';
import { PactAdapter } from '../knowledge/adapters/pact.adapter.js';
import { PROTOCOL_REGISTRY } from '../risk/constants/protocol-registry.js';
import { getAssetMeta } from '../knowledge/constants/asset-registry.js';
import { aprToApy, computeExcessYield } from './normalizers/apy.normalizer.js';
import { classifySustainability, sustainabilityToScore } from './scoring/sustainability.tagger.js';
import { topsisRank } from './ranking/topsis.ranker.js';
import type { TopsisInput } from './ranking/topsis.ranker.js';
import { computePortfolioFitScore, computeFinalScore } from './scoring/portfolio-fit.scorer.js';
import { detectIdleCapital } from './detection/idle-capital.detector.js';
import type { PositionInput, BestOpportunityInput } from './detection/idle-capital.detector.js';
import { YieldOpportunityRepository } from './repositories/yield-opportunity.repository.js';
import type { YieldHistoryFilters } from './repositories/yield-opportunity.repository.js';
import { IdleCapitalRepository } from './repositories/idle-capital.repository.js';
import { YieldEvents } from './events/yield.events.js';
import type { YieldOpportunitiesUpdatedPayload } from './events/yield.events.js';

const logger = createLogger('yield:service');

/** Baseline APY below which a position is considered underperforming. */
const BASELINE_APY_PERCENT = '2.0';

/** Register event listener for PortfolioSnapshotCreated. */
export function initYieldEngine(): void {
  eventBus.on(
    PortfolioEvents.PORTFOLIO_SNAPSHOT_CREATED,
    (payload: PortfolioSnapshotCreatedPayload) => {
      runYieldPipeline(payload.userId, payload.snapshotId).catch((err: unknown) => {
        logger.error({ err, userId: payload.userId }, 'yield pipeline failed');
      });
    },
  );
  logger.info('Yield engine initialized — listening for PortfolioSnapshotCreated');
}

// ── Internal opportunity shape used during pipeline ──────────────────────

interface RawOpportunity {
  protocol: string;
  opportunityType: OpportunityType;
  assetSymbol: string;
  pairSymbol: string | null;
  marketId: string | null;
  spotApyPercent: string;
  organicApyPercent: string;
  incentivizedApyPercent: string;
  netApyPercent: string;
  sustainabilityTier: SustainabilityTier;
  sustainabilityScore: number;
  tvlUsd: string;
  tvlChange7dPercent: string | null;
  tvlTrend: TvlTrend;
  utilizationRatePercent: string | null;
  protocolSafetyScore: number;
  liquidityScore: number;
  ilRiskScore: number;
  yieldConsistencyScore: number;
}

// ── Pipeline ─────────────────────────────────────────────────────────────

async function runYieldPipeline(userId: string, portfolioSnapshotId: string): Promise<void> {
  const startTime = Date.now();
  const prisma = getPrisma();

  // Load portfolio snapshot for context
  const snapshot = await prisma.portfolioSnapshot.findUnique({
    where: { id: portfolioSnapshotId },
  });
  if (!snapshot) {
    logger.warn(
      { userId, portfolioSnapshotId },
      'portfolio snapshot not found — skipping yield pipeline',
    );
    return;
  }

  // ── Step 1: Fetch pool data from all protocol adapters in parallel ───
  const [folksPools, tinymanPools, pactPools] = await Promise.all([
    FolksFinanceAdapter.getPoolData(),
    TinymanAdapter.getAllPools(),
    PactAdapter.getAllPools(),
  ]);

  logger.info(
    {
      userId,
      folksPools: folksPools.length,
      tinymanPools: tinymanPools.length,
      pactPools: pactPools.length,
    },
    'pool data fetched from adapters',
  );

  // ── Step 2: Build raw opportunity list ────────────────────────────────
  const opportunities: RawOpportunity[] = [];

  // Folks Finance lending opportunities
  for (const pool of folksPools) {
    const meta = getAssetMeta(pool.assetId);
    const spotApy = pool.supplyApy;
    const organicApy = spotApy; // Folks Finance yields are primarily organic (lending interest)
    const incentivizedApy = '0';
    const netApy = spotApy;
    const sustainability = classifySustainability(organicApy, incentivizedApy);

    opportunities.push({
      protocol: 'folks-finance',
      opportunityType: 'LENDING',
      assetSymbol: meta.symbol,
      pairSymbol: null,
      marketId: String(pool.marketAppId),
      spotApyPercent: spotApy,
      organicApyPercent: organicApy,
      incentivizedApyPercent: incentivizedApy,
      netApyPercent: netApy,
      sustainabilityTier: sustainability,
      sustainabilityScore: sustainabilityToScore(sustainability),
      tvlUsd: pool.tvlUsd,
      tvlChange7dPercent: null,
      tvlTrend: 'STABLE',
      utilizationRatePercent: pool.utilizationRate,
      protocolSafetyScore: PROTOCOL_REGISTRY['folks-finance'] ?? 50,
      liquidityScore: computeLiquidityScore(pool.tvlUsd),
      ilRiskScore: 0, // No IL risk for lending
      yieldConsistencyScore: 70, // Default — refined when historical data is available
    });
  }

  // Tinyman LP opportunities
  for (const pool of tinymanPools) {
    const meta1 = getAssetMeta(pool.asset1Id);
    const meta2 = getAssetMeta(pool.asset2Id);
    // Tinyman LP yield estimated from fee share — use fee-based APR as organic APY approximation
    const feeRate = new Decimal(pool.totalFeeShare);
    const spotApy = aprToApy(feeRate.mul(365).toString());
    const spotApyPercent = new Decimal(spotApy).mul(100).toString();
    const organicApy = spotApyPercent;
    const incentivizedApy = '0';

    opportunities.push({
      protocol: 'tinyman',
      opportunityType: 'LP',
      assetSymbol: meta1.symbol,
      pairSymbol: meta2.symbol,
      marketId: pool.address,
      spotApyPercent: toDecimalString(spotApyPercent),
      organicApyPercent: toDecimalString(organicApy),
      incentivizedApyPercent: incentivizedApy,
      netApyPercent: toDecimalString(spotApyPercent),
      sustainabilityTier: classifySustainability(organicApy, incentivizedApy),
      sustainabilityScore: sustainabilityToScore(
        classifySustainability(organicApy, incentivizedApy),
      ),
      tvlUsd: estimatePoolTvl(pool.asset1Reserves, pool.asset2Reserves),
      tvlChange7dPercent: null,
      tvlTrend: 'STABLE',
      utilizationRatePercent: null,
      protocolSafetyScore: PROTOCOL_REGISTRY['tinyman'] ?? 50,
      liquidityScore: computeLiquidityScore(
        estimatePoolTvl(pool.asset1Reserves, pool.asset2Reserves),
      ),
      ilRiskScore: computeIlRiskScore(meta1.category, meta2.category),
      yieldConsistencyScore: 60, // Default for LP
    });
  }

  // Pact LP opportunities
  for (const pool of pactPools) {
    const meta1 = getAssetMeta(pool.primaryAssetId);
    const meta2 = getAssetMeta(pool.secondaryAssetId);
    const spotApyPercent = aprToApy(new Decimal(pool.apr7d).div(100).toString());
    const spotApyPercentScaled = new Decimal(spotApyPercent).mul(100).toString();
    const organicApy = spotApyPercentScaled;
    const incentivizedApy = '0';

    opportunities.push({
      protocol: 'pact',
      opportunityType: 'LP',
      assetSymbol: meta1.symbol,
      pairSymbol: meta2.symbol,
      marketId: String(pool.appId),
      spotApyPercent: toDecimalString(spotApyPercentScaled),
      organicApyPercent: toDecimalString(organicApy),
      incentivizedApyPercent: incentivizedApy,
      netApyPercent: toDecimalString(spotApyPercentScaled),
      sustainabilityTier: classifySustainability(organicApy, incentivizedApy),
      sustainabilityScore: sustainabilityToScore(
        classifySustainability(organicApy, incentivizedApy),
      ),
      tvlUsd: pool.tvlUsd,
      tvlChange7dPercent: null,
      tvlTrend: 'STABLE',
      utilizationRatePercent: null,
      protocolSafetyScore: PROTOCOL_REGISTRY['pact'] ?? 50,
      liquidityScore: computeLiquidityScore(pool.tvlUsd),
      ilRiskScore: computeIlRiskScore(meta1.category, meta2.category),
      yieldConsistencyScore: 60,
    });
  }

  logger.info({ userId, totalOpportunities: opportunities.length }, 'opportunities built');

  if (opportunities.length === 0) {
    logger.warn({ userId }, 'no yield opportunities found — skipping ranking');
    return;
  }

  // ── Step 3: TOPSIS ranking ────────────────────────────────────────────
  // Determine goal profile from user's strategy settings
  const userGoal = await prisma.userGoalProfile.findUnique({ where: { userId } });
  const goalProfile: GoalProfile = userGoal?.goalProfile ?? 'MODERATE';

  const topsisInputs: TopsisInput[] = opportunities.map((opp, idx) => ({
    id: String(idx),
    criteria: {
      netApy: new Decimal(opp.netApyPercent).toNumber(),
      protocolSafetyScore: opp.protocolSafetyScore,
      yieldConsistencyScore: opp.yieldConsistencyScore,
      liquidityScore: opp.liquidityScore,
      ilRiskScore: opp.ilRiskScore,
    },
  }));

  const topsisResults = topsisRank(topsisInputs, goalProfile);

  // ── Step 4: Portfolio fit + final score ────────────────────────────────
  const portfolioWeights = extractPortfolioWeights(snapshot);

  const rankedOpportunities = topsisResults.map((result) => {
    const idx = parseInt(result.id, 10);
    const opp = opportunities[idx] as RawOpportunity;

    const fitScore = computePortfolioFitScore({
      opportunityAsset: opp.assetSymbol,
      opportunityType: opp.opportunityType,
      currentPortfolioWeights: portfolioWeights,
      goalProfile,
      pairAssets: opp.pairSymbol ? [opp.pairSymbol] : undefined,
    });

    const finalScore = computeFinalScore(result.closenessCoefficient, fitScore);
    const excessYield = computeExcessYield(opp.netApyPercent, BASELINE_APY_PERCENT);

    return {
      ...opp,
      topsisClosenessCoeff: result.closenessCoefficient,
      topsisRank: result.rank,
      portfolioFitScore: fitScore,
      finalScore,
      excessYieldPercent: excessYield,
      goalProfile,
    };
  });

  // ── Step 5: Write YieldOpportunitySnapshot records ────────────────────
  const snapshotRecords = rankedOpportunities.map((opp) => ({
    userId,
    portfolioSnapshotId,
    protocol: opp.protocol,
    opportunityType: opp.opportunityType,
    assetSymbol: opp.assetSymbol,
    pairSymbol: opp.pairSymbol,
    marketId: opp.marketId,
    spotApyPercent: opp.spotApyPercent,
    organicApyPercent: opp.organicApyPercent,
    incentivizedApyPercent: opp.incentivizedApyPercent,
    netApyPercent: opp.netApyPercent,
    excessYieldPercent: opp.excessYieldPercent,
    apyCv: null,
    yieldConsistencyScore: opp.yieldConsistencyScore,
    sustainabilityTier: opp.sustainabilityTier,
    sustainabilityScore: opp.sustainabilityScore,
    tvlUsd: opp.tvlUsd,
    tvlChange7dPercent: opp.tvlChange7dPercent,
    tvlTrend: opp.tvlTrend,
    utilizationRatePercent: opp.utilizationRatePercent,
    protocolSafetyScore: opp.protocolSafetyScore,
    liquidityScore: opp.liquidityScore,
    ilRiskTier: opp.ilRiskScore === 0 ? null : classifyIlRiskTier(opp.ilRiskScore),
    ilRiskScore: opp.ilRiskScore,
    goalProfile: opp.goalProfile,
    topsisClosenessCoeff: opp.topsisClosenessCoeff,
    topsisRank: opp.topsisRank,
    portfolioFitScore: opp.portfolioFitScore,
    finalScore: opp.finalScore,
  }));

  await prisma.yieldOpportunitySnapshot.createMany({ data: snapshotRecords });

  // Fetch the created records to get their IDs for idle capital detection
  const createdSnapshots = await prisma.yieldOpportunitySnapshot.findMany({
    where: {
      userId,
      portfolioSnapshotId,
      goalProfile,
    },
    orderBy: { topsisRank: 'asc' },
  });

  // ── Step 6: Idle capital detection ────────────────────────────────────
  const protocolPositions = (snapshot.protocolPositions ?? []) as Array<{
    protocol: string;
    positionType: string;
    assetSymbol: string;
    valueUsd: string;
    apy?: string;
  }>;

  const positions: PositionInput[] = protocolPositions.map((p) => ({
    assetSymbol: p.assetSymbol,
    protocol: p.protocol,
    apyPercent: p.apy ?? '0',
    valueUsd: p.valueUsd,
  }));

  // Build best opportunities map by asset symbol
  const bestByAsset = new Map<string, BestOpportunityInput>();
  for (const snap of createdSnapshots) {
    const existing = bestByAsset.get(snap.assetSymbol);
    if (!existing || new Decimal(snap.netApyPercent).gt(new Decimal(existing.apyPercent))) {
      bestByAsset.set(snap.assetSymbol, {
        opportunityId: snap.id,
        apyPercent: snap.netApyPercent,
      });
    }
  }

  const idleSignals = detectIdleCapital(positions, bestByAsset, BASELINE_APY_PERCENT);

  // ── Step 7: Write IdleCapitalSignal records ───────────────────────────
  if (idleSignals.length > 0) {
    const signalRecords = idleSignals.map((signal) => ({
      userId,
      portfolioSnapshotId,
      assetSymbol: signal.assetSymbol,
      currentProtocol: signal.currentProtocol,
      currentApyPercent: signal.currentApyPercent,
      bestAvailableApyPercent: signal.bestAvailableApyPercent,
      bestOpportunitySnapshotId: signal.bestAvailableOpportunityId,
      opportunityCostUsdPerYear: signal.opportunityCostUsdPerYear,
      tier: signal.tier,
      actionSuggestion: signal.actionSuggestion,
      positionValueUsd: signal.positionValueUsd,
    }));

    await prisma.idleCapitalSignal.createMany({ data: signalRecords });
  }

  // ── Step 8: Emit event ────────────────────────────────────────────────
  const eventPayload: YieldOpportunitiesUpdatedPayload = {
    userId,
    portfolioSnapshotId,
    opportunityCount: rankedOpportunities.length,
    idleSignalCount: idleSignals.length,
    topOpportunityId: createdSnapshots.length > 0 ? createdSnapshots[0].id : null,
    timestamp: new Date().toISOString(),
  };
  eventBus.emit(YieldEvents.YIELD_OPPORTUNITIES_UPDATED, eventPayload);

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      userId,
      opportunities: rankedOpportunities.length,
      idleSignals: idleSignals.length,
      goalProfile,
      durationMs,
    },
    'yield pipeline complete',
  );
}

// ── Helper functions ─────────────────────────────────────────────────────

function computeLiquidityScore(tvlUsd: string): number {
  const tvl = new Decimal(tvlUsd).toNumber();
  if (tvl >= 10_000_000) return 100;
  if (tvl >= 1_000_000) return 80;
  if (tvl >= 100_000) return 60;
  if (tvl >= 10_000) return 40;
  return 20;
}

function computeIlRiskScore(category1: string, category2: string): number {
  if (category1 === 'stablecoin' && category2 === 'stablecoin') return 5;
  if (category1 === 'stablecoin' || category2 === 'stablecoin') return 50;
  return 75; // Both volatile — highest IL risk
}

function classifyIlRiskTier(ilRiskScore: number): 'NEGLIGIBLE' | 'LOW' | 'MODERATE' | 'HIGH' {
  if (ilRiskScore <= 10) return 'NEGLIGIBLE';
  if (ilRiskScore <= 30) return 'LOW';
  if (ilRiskScore <= 60) return 'MODERATE';
  return 'HIGH';
}

function estimatePoolTvl(reserves1: string, reserves2: string): string {
  // Simple estimation — sum of reserves as proxy (actual pricing done upstream)
  const total = new Decimal(reserves1).plus(new Decimal(reserves2));
  return toDecimalString(total);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPortfolioWeights(snapshot: any): Record<string, string> {
  const weights: Record<string, string> = {};
  const exposure = (snapshot.trueExposure ?? {}) as Record<string, { percent: string }>;
  for (const [asset, data] of Object.entries(exposure)) {
    weights[asset] = data.percent;
  }
  return weights;
}

// ── Public service API ───────────────────────────────────────────────────

export const YieldService = {
  /** Get latest yield opportunities for a user, optionally filtered. */
  async getOpportunities(userId: string, filters: { goalProfile?: GoalProfile; limit?: number }) {
    const opportunities = await YieldOpportunityRepository.getLatestForUser(
      userId,
      filters.goalProfile,
      filters.limit,
    );

    if (opportunities.length === 0) {
      return { opportunities: [], count: 0 };
    }

    return { opportunities, count: opportunities.length };
  },

  /** Get top-N opportunities ranked by a specific mode. */
  async getRankings(userId: string, mode: string, limit = 10) {
    const prisma = getPrisma();

    // Determine goal profile
    const userGoal = await prisma.userGoalProfile.findUnique({ where: { userId } });
    const goalProfile: GoalProfile = userGoal?.goalProfile ?? 'MODERATE';

    const orderBy =
      mode === 'apy'
        ? { netApyPercent: 'desc' as const }
        : mode === 'safety'
          ? { protocolSafetyScore: 'desc' as const }
          : { topsisRank: 'asc' as const };

    // Find the most recent batch
    const latest = await prisma.yieldOpportunitySnapshot.findFirst({
      where: { userId, goalProfile },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!latest) return { rankings: [], goalProfile };

    const rankings = await prisma.yieldOpportunitySnapshot.findMany({
      where: { userId, goalProfile, createdAt: latest.createdAt },
      orderBy,
      take: limit,
    });

    return { rankings, goalProfile };
  },

  /** Get idle capital signals with total opportunity cost. */
  async getIdleCapital(userId: string) {
    const signals = await IdleCapitalRepository.getForUser(userId);
    const totalOpportunityCost = signals.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: Decimal, s: any) => sum.plus(new Decimal(s.opportunityCostUsdPerYear)),
      new Decimal(0),
    );

    return {
      signals,
      count: signals.length,
      totalOpportunityCostUsdPerYear: toDecimalString(totalOpportunityCost),
    };
  },

  /** Get a single opportunity by ID. */
  async getOpportunityById(userId: string, id: string) {
    const opportunity = await YieldOpportunityRepository.getById(id);
    if (!opportunity) {
      throw new NotFoundError('Yield opportunity not found');
    }
    // Verify ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((opportunity as any).userId !== userId) {
      throw new NotFoundError('Yield opportunity not found');
    }
    return opportunity;
  },

  /** Get historical yield opportunity data. */
  async getHistory(userId: string, filters: YieldHistoryFilters) {
    const history = await YieldOpportunityRepository.getHistory(userId, filters);
    return { history, count: history.length };
  },

  /** Get upgrade suggestions — positions below baseline with better alternatives. */
  async getUpgrades(userId: string) {
    const idle = await IdleCapitalRepository.getForUser(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upgrades = idle.filter(
      (s: any) => s.tier === 'UNDERPERFORMING' || s.tier === 'SUBOPTIMAL',
    );
    return { upgrades, count: upgrades.length };
  },
};
