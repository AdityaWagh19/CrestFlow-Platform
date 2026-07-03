/**
 * Concentration Risk Analyzer
 * Computes asset and protocol HHI, generates concentration risk score.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

export interface ConcentrationRiskResult {
  assetHhi: string;
  protocolHhi: string;
  componentScore: number; // 0-100
}

export function analyzeConcentrationRisk(
  trueExposure: Record<string, { percent: string }>,
  protocolAllocation: Record<string, string>,
): ConcentrationRiskResult {
  // Asset HHI (on true exposure percentages)
  const assetHhi = Object.values(trueExposure).reduce(
    (sum, e) => sum.plus(new Decimal(e.percent).pow(2)),
    new Decimal(0),
  );

  // Protocol HHI
  const protocolHhi = Object.values(protocolAllocation).reduce(
    (sum, pct) => sum.plus(new Decimal(pct).pow(2)),
    new Decimal(0),
  );

  // Component score: HHI 0 → 0 risk, HHI 10000 → 100 risk
  const assetScore = Math.min(100, Math.round(assetHhi.div(10000).mul(100).toNumber()));
  const protocolScore = Math.min(100, Math.round(protocolHhi.div(10000).mul(100).toNumber()));
  // Weight: asset 70%, protocol 30%
  const componentScore = Math.round(assetScore * 0.7 + protocolScore * 0.3);

  return {
    assetHhi: toDecimalString(assetHhi, 4),
    protocolHhi: toDecimalString(protocolHhi, 4),
    componentScore,
  };
}
