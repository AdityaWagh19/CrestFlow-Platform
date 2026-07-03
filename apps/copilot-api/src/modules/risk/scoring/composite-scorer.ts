/**
 * Composite Risk Scorer
 * Combines 5 component scores into a single 0-100 risk score.
 * Higher score = more risk.
 */

export interface CompositeScoreResult {
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  components: {
    market: number;
    liquidation: number;
    concentration: number;
    protocol: number;
    liquidity: number;
  };
}

// Component weights — sum to 1.0
const WEIGHTS_WITH_LIQUIDATION = {
  market: 0.35,
  liquidation: 0.25,
  concentration: 0.2,
  protocol: 0.1,
  liquidity: 0.1,
} as const;

const WEIGHTS_WITHOUT_LIQUIDATION = {
  market: 0.45,
  liquidation: 0.0,
  concentration: 0.3,
  protocol: 0.1,
  liquidity: 0.15,
} as const;

export function computeCompositeRiskScore(
  marketScore: number,
  liquidationScore: number,
  concentrationScore: number,
  protocolScore: number,
  liquidityScore: number,
  hasLiquidationData: boolean,
): CompositeScoreResult {
  const weights = hasLiquidationData ? WEIGHTS_WITH_LIQUIDATION : WEIGHTS_WITHOUT_LIQUIDATION;

  const weighted =
    marketScore * weights.market +
    liquidationScore * weights.liquidation +
    concentrationScore * weights.concentration +
    protocolScore * weights.protocol +
    liquidityScore * weights.liquidity;

  const riskScore = Math.min(100, Math.max(0, Math.round(weighted)));

  const riskLevel: CompositeScoreResult['riskLevel'] =
    riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

  return {
    riskScore,
    riskLevel,
    components: {
      market: marketScore,
      liquidation: liquidationScore,
      concentration: concentrationScore,
      protocol: protocolScore,
      liquidity: liquidityScore,
    },
  };
}
