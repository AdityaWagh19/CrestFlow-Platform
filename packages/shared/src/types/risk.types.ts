export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertType =
  | 'LIQUIDATION_IMMINENT'
  | 'LIQUIDATION_WARNING'
  | 'HIGH_CONCENTRATION'
  | 'MODERATE_CONCENTRATION'
  | 'HIGH_VOLATILITY'
  | 'SIGNIFICANT_DRAWDOWN'
  | 'LOW_LIQUIDITY'
  | 'LOW_PROTOCOL_SCORE';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'DISMISSED';

export interface RiskScoreComponents {
  marketRisk: number; // 0-100
  liquidationRisk: number; // 0-100
  concentrationRisk: number; // 0-100
  protocolRisk: number; // 0-100
  liquidityRisk: number; // 0-100
}

export interface LiquidationPosition {
  marketId: string;
  assetSymbol: string;
  healthFactor: string; // DECIMAL
  distancePercent: string; // DECIMAL
  status: 'SAFE' | 'MODERATE' | 'WARNING' | 'CRITICAL';
}
