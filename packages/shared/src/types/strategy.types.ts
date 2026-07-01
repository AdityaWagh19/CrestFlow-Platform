import type { GoalProfile } from './yield.types.js';

export type ModelType = 'EQUAL_WEIGHT' | 'INVERSE_VOL' | 'HRP_CVAR' | 'BL_HRP_CVAR';

export type RebalanceUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface RebalancingAction {
  assetSymbol: string;
  direction: 'INCREASE' | 'DECREASE' | 'NO_CHANGE';
  currentPercent: string; // DECIMAL
  targetPercent: string; // DECIMAL
  deltaPercent: string; // DECIMAL
  estimatedValueUsd: string; // DECIMAL
  urgency: RebalanceUrgency;
}

export interface StrategyExplanation {
  modelUsed: string; // Human-readable label
  dataPointsUsed: number;
  goalProfile: GoalProfile;
  riskContext: string;
  reasons: string[];
  disclaimer: string;
}

export { GoalProfile };
