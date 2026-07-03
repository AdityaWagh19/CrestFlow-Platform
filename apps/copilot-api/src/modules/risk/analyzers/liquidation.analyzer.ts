/**
 * Liquidation Risk Analyzer
 * Monitors Folks Finance health factors and computes distance to liquidation.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { ProtocolPosition } from '@crestflow/shared';

export const HF_THRESHOLDS = {
  CRITICAL: 1.1,
  WARNING: 1.3,
  MODERATE: 2.0,
  SAFE: 3.0,
} as const;

export interface LiquidationPosition {
  marketId: string;
  assetSymbol: string;
  healthFactor: string;
  distanceToLiquidationPercent: string;
  status: 'SAFE' | 'MODERATE' | 'WARNING' | 'CRITICAL';
}

export interface LiquidationRiskResult {
  positions: LiquidationPosition[];
  minHealthFactor: string | null;
  componentScore: number;
  hasActiveBorrows: boolean;
}

export function analyzeLiquidationRisk(
  protocolPositions: ProtocolPosition[],
): LiquidationRiskResult {
  const borrowPositions = protocolPositions.filter(
    (p) => p.protocol === 'folks-finance' && p.positionType === 'borrow',
  );

  if (borrowPositions.length === 0) {
    return { positions: [], minHealthFactor: null, componentScore: 0, hasActiveBorrows: false };
  }

  const positions: LiquidationPosition[] = borrowPositions.map((p) => {
    const hf = new Decimal(p.healthFactor ?? '999');
    const hfNum = hf.toNumber();

    // Distance to liquidation: (HF - 1.0) / HF * 100
    const distance = hf.gt(0) ? hf.minus(1).div(hf).mul(100) : new Decimal(0);

    let status: LiquidationPosition['status'] = 'SAFE';
    if (hfNum < HF_THRESHOLDS.CRITICAL) status = 'CRITICAL';
    else if (hfNum < HF_THRESHOLDS.WARNING) status = 'WARNING';
    else if (hfNum < HF_THRESHOLDS.MODERATE) status = 'MODERATE';

    return {
      marketId: p.marketId ?? p.assetSymbol,
      assetSymbol: p.assetSymbol,
      healthFactor: toDecimalString(hf),
      distanceToLiquidationPercent: toDecimalString(distance, 4),
      status,
    };
  });

  const minHf = positions.reduce(
    (min, p) => Math.min(min, new Decimal(p.healthFactor).toNumber()),
    Infinity,
  );
  const minHealthFactor = minHf < Infinity ? toDecimalString(minHf) : null;

  // Component score
  let score = 0;
  if (minHf < 1.0) score = 100;
  else if (minHf < HF_THRESHOLDS.CRITICAL) score = 90;
  else if (minHf < HF_THRESHOLDS.WARNING) score = 70;
  else if (minHf < HF_THRESHOLDS.MODERATE) score = 40;
  else score = 10;

  return {
    positions,
    minHealthFactor,
    componentScore: score,
    hasActiveBorrows: true,
  };
}
