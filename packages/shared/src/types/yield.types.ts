export type OpportunityType = 'LENDING' | 'LP';
export type SustainabilityTier = 'ORGANIC' | 'MIXED' | 'INCENTIVIZED';
export type TvlTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'DISTRESS';
export type ILRiskTier = 'NEGLIGIBLE' | 'LOW' | 'MODERATE' | 'HIGH';
export type IdleTier = 'IDLE' | 'UNDERPERFORMING' | 'SUBOPTIMAL';

export type GoalProfile = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

export interface YieldOpportunity {
  id: string;
  protocol: string;
  opportunityType: OpportunityType;
  assetSymbol: string;
  pairSymbol?: string;
  marketId?: string;
  spotApyPercent: string; // DECIMAL
  netApyPercent: string; // DECIMAL
  sustainabilityTier: SustainabilityTier;
  sustainabilityScore: number; // 0-100
  tvlUsd: string; // DECIMAL
  tvlTrend: TvlTrend;
  ilRiskTier?: ILRiskTier;
  topsisRank: number;
  finalScore: string; // DECIMAL
  portfolioFitScore: number; // 0-100
}

export interface IdleCapitalSignal {
  id: string;
  assetSymbol: string;
  currentProtocol: string;
  currentApyPercent: string; // DECIMAL
  bestAvailableApyPercent: string; // DECIMAL
  opportunityCostUsdPerYear: string; // DECIMAL
  tier: IdleTier;
  actionSuggestion: string;
  positionValueUsd: string; // DECIMAL
}
