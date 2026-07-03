/**
 * Context Assembler — Gathers cross-engine data for copilot prompts.
 * Uses Promise.allSettled for resilience: failed fetches yield null sections.
 */

import { createLogger, getPrisma } from '@crestflow/shared';

const logger = createLogger('copilot:context');

export interface CopilotContext {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    algorandAddress: string | null;
    persona: string | null;
  } | null;
  portfolio: {
    totalValueUsd: unknown;
    healthScore: unknown;
    hhi: unknown;
    changePercent: unknown;
    assetAllocation: unknown;
    protocolAllocation: unknown;
    snapshotAt: string | null;
  } | null;
  risk: {
    compositeScore: unknown;
    marketRisk: unknown;
    liquidationRisk: unknown;
    concentrationRisk: unknown;
    protocolRisk: unknown;
    liquidityRisk: unknown;
    riskLevel: unknown;
    analyzedAt: string | null;
  } | null;
  strategy: {
    optimizer: unknown;
    targetAllocations: unknown;
    rebalanceActions: unknown;
    goalProfile: unknown;
    generatedAt: string | null;
  } | null;
  yield: {
    topOpportunities: unknown[];
    idleCapitalSignals: unknown[];
    updatedAt: string | null;
  } | null;
}

/**
 * Assemble a full cross-engine context for a given user.
 * Each section fetches independently; failures are logged and return null.
 */
export async function assembleCopilotContext(userId: string): Promise<CopilotContext> {
  const prisma = getPrisma();

  const [userResult, portfolioResult, riskResult, strategyResult, yieldResult] =
    await Promise.allSettled([
      // User profile
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          algorandAddress: true,
          persona: true,
        },
      }),

      // Latest portfolio snapshot
      prisma.portfolioSnapshot.findFirst({
        where: { userId },
        orderBy: { snapshotAt: 'desc' },
        select: {
          totalValueUsd: true,
          healthScore: true,
          hhi: true,
          changePercent: true,
          assetAllocation: true,
          protocolAllocation: true,
          snapshotAt: true,
        },
      }),

      // Latest risk snapshot
      prisma.riskSnapshot.findFirst({
        where: { userId },
        orderBy: { analyzedAt: 'desc' },
        select: {
          compositeScore: true,
          marketRisk: true,
          liquidationRisk: true,
          concentrationRisk: true,
          protocolRisk: true,
          liquidityRisk: true,
          riskLevel: true,
          analyzedAt: true,
        },
      }),

      // Latest strategy snapshot
      prisma.strategySnapshot.findFirst({
        where: { userId },
        orderBy: { generatedAt: 'desc' },
        select: {
          optimizer: true,
          targetAllocations: true,
          rebalanceActions: true,
          goalProfile: true,
          generatedAt: true,
        },
      }),

      // Top yield opportunities + idle capital
      Promise.all([
        prisma.yieldOpportunitySnapshot.findMany({
          where: { userId },
          orderBy: { finalScore: 'desc' },
          take: 5,
        }),
        prisma.idleCapitalSignal.findMany({
          where: { userId, dismissed: false },
          orderBy: { detectedAt: 'desc' },
          take: 5,
        }),
      ]),
    ]);

  // Extract values, logging failures
  const user =
    userResult.status === 'fulfilled' && userResult.value
      ? {
          id: userResult.value.id as string,
          email: userResult.value.email as string | null,
          displayName: userResult.value.displayName as string | null,
          algorandAddress: userResult.value.algorandAddress as string | null,
          persona: userResult.value.persona as string | null,
        }
      : logAndReturnNull('user', userResult);

  const portfolio =
    portfolioResult.status === 'fulfilled' && portfolioResult.value
      ? {
          totalValueUsd: portfolioResult.value.totalValueUsd,
          healthScore: portfolioResult.value.healthScore,
          hhi: portfolioResult.value.hhi,
          changePercent: portfolioResult.value.changePercent,
          assetAllocation: portfolioResult.value.assetAllocation,
          protocolAllocation: portfolioResult.value.protocolAllocation,
          snapshotAt: portfolioResult.value.snapshotAt
            ? String(portfolioResult.value.snapshotAt)
            : null,
        }
      : logAndReturnNull('portfolio', portfolioResult);

  const risk =
    riskResult.status === 'fulfilled' && riskResult.value
      ? {
          compositeScore: riskResult.value.compositeScore,
          marketRisk: riskResult.value.marketRisk,
          liquidationRisk: riskResult.value.liquidationRisk,
          concentrationRisk: riskResult.value.concentrationRisk,
          protocolRisk: riskResult.value.protocolRisk,
          liquidityRisk: riskResult.value.liquidityRisk,
          riskLevel: riskResult.value.riskLevel,
          analyzedAt: riskResult.value.analyzedAt ? String(riskResult.value.analyzedAt) : null,
        }
      : logAndReturnNull('risk', riskResult);

  const strategy =
    strategyResult.status === 'fulfilled' && strategyResult.value
      ? {
          optimizer: strategyResult.value.optimizer,
          targetAllocations: strategyResult.value.targetAllocations,
          rebalanceActions: strategyResult.value.rebalanceActions,
          goalProfile: strategyResult.value.goalProfile,
          generatedAt: strategyResult.value.generatedAt
            ? String(strategyResult.value.generatedAt)
            : null,
        }
      : logAndReturnNull('strategy', strategyResult);

  let yieldSection: CopilotContext['yield'] = null;
  if (yieldResult.status === 'fulfilled') {
    const [opportunities, signals] = yieldResult.value;
    yieldSection = {
      topOpportunities: opportunities as unknown[],
      idleCapitalSignals: signals as unknown[],
      updatedAt:
        opportunities.length > 0
          ? ((opportunities[0] as { createdAt?: string }).createdAt ?? null)
          : null,
    };
  } else {
    logger.warn({ err: yieldResult.reason, userId }, 'failed to fetch yield context');
  }

  return { user, portfolio, risk, strategy, yield: yieldSection };
}

function logAndReturnNull(section: string, result: PromiseSettledResult<unknown>): null {
  if (result.status === 'rejected') {
    logger.warn({ err: result.reason, section }, 'failed to fetch copilot context section');
  }
  return null;
}
