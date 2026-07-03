/**
 * Liquidity / Exit Risk Analyzer
 * Estimates price impact for exiting each LP or supply position.
 * Uses simplified constant-product AMM approximation: impact ~ position/TVL.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { ProtocolPosition } from '@crestflow/shared';

export interface ExitRiskPosition {
  protocol: string;
  label: string;
  positionUsd: string;
  poolTvlUsd: string;
  impactPercent: string;
  riskTier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export interface LiquidityRiskResult {
  positions: ExitRiskPosition[];
  maxExitImpactPercent: string;
  componentScore: number; // 0-100
}

export function analyzeLiquidityRisk(protocolPositions: ProtocolPosition[]): LiquidityRiskResult {
  const lpAndSupplyPositions = protocolPositions.filter(
    (p) => p.positionType === 'lp' || p.positionType === 'supply',
  );

  const positions: ExitRiskPosition[] = lpAndSupplyPositions.map((pos) => {
    const posUsd = new Decimal(pos.valueUsd);
    // Use a conservative TVL estimate — in production, this comes from pool data
    const defaultTvl = '1000000';
    const tvlUsd = new Decimal(defaultTvl);

    // Price impact approximation: position / tvl * 100
    const impact = posUsd.div(tvlUsd).mul(100);
    const impactNum = impact.toNumber();

    let riskTier: ExitRiskPosition['riskTier'] = 'LOW';
    if (impactNum > 5) riskTier = 'CRITICAL';
    else if (impactNum > 2) riskTier = 'HIGH';
    else if (impactNum > 0.5) riskTier = 'MODERATE';

    const label =
      pos.positionType === 'lp'
        ? `${pos.assetSymbol}/${pos.pairSymbol ?? '?'} (${pos.protocol})`
        : `${pos.assetSymbol} supply (${pos.protocol})`;

    return {
      protocol: pos.protocol,
      label,
      positionUsd: toDecimalString(posUsd, 2),
      poolTvlUsd: toDecimalString(tvlUsd, 2),
      impactPercent: toDecimalString(impact, 4),
      riskTier,
    };
  });

  const maxImpact = positions.reduce(
    (max, p) => Math.max(max, new Decimal(p.impactPercent).toNumber()),
    0,
  );

  // Score: impact > 5% → 100pts, scaled linearly
  const componentScore = Math.min(100, Math.round((maxImpact / 5) * 100));

  return {
    positions,
    maxExitImpactPercent: toDecimalString(maxImpact, 4),
    componentScore,
  };
}
