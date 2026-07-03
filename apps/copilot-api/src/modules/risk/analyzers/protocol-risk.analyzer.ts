/**
 * Protocol Risk Analyzer
 * Scores protocol safety and computes allocation-weighted portfolio protocol risk.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import { PROTOCOL_REGISTRY } from '../constants/protocol-registry.js';

export interface ProtocolRiskResult {
  protocolScores: Record<string, number>;
  weightedProtocolScore: string;
  componentScore: number; // 0-100 (higher = more risk)
}

export function analyzeProtocolRisk(protocolAllocation: {
  folks: string;
  tinyman: string;
  pact: string;
  native: string;
}): ProtocolRiskResult {
  const scores = { ...PROTOCOL_REGISTRY };

  const totalProtocol = new Decimal(protocolAllocation.folks)
    .plus(protocolAllocation.tinyman)
    .plus(protocolAllocation.pact);

  let weightedSafetyScore = new Decimal(100); // default if no protocol exposure
  if (totalProtocol.gt(0)) {
    const folksWeight = new Decimal(protocolAllocation.folks).div(totalProtocol);
    const tinymanWeight = new Decimal(protocolAllocation.tinyman).div(totalProtocol);
    const pactWeight = new Decimal(protocolAllocation.pact).div(totalProtocol);

    weightedSafetyScore = new Decimal(scores['folks-finance'] ?? 0)
      .mul(folksWeight)
      .plus(new Decimal(scores['tinyman'] ?? 0).mul(tinymanWeight))
      .plus(new Decimal(scores['pact'] ?? 0).mul(pactWeight));
  }

  // Invert: safety 100 → risk 0, safety 0 → risk 100
  const componentScore = Math.max(
    0,
    Math.min(100, Math.round(100 - weightedSafetyScore.toNumber())),
  );

  return {
    protocolScores: scores,
    weightedProtocolScore: toDecimalString(weightedSafetyScore, 4),
    componentScore,
  };
}
