export type InvestorPersona =
  'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE' | 'YIELD_SEEKER';

export type BehavioralSignalType =
  | 'ACTED_ON_REBALANCE'
  | 'IGNORED_CRITICAL_ALERT'
  | 'IGNORES_YIELD_SUGGESTIONS'
  | 'HIGH_ENGAGEMENT'
  | 'GOAL_ESCALATION'
  | 'GOAL_DE_ESCALATION'
  | 'RISK_INACTION';

export type CopilotIntent =
  | 'PORTFOLIO_QUERY'
  | 'RISK_QUERY'
  | 'STRATEGY_QUERY'
  | 'YIELD_QUERY'
  | 'GOAL_CHANGE'
  | 'EXECUTION_REQUEST'
  | 'GENERAL';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CopilotResponse {
  answer: string;
  dataPoints: CopilotDataPoint[];
  confidence: ConfidenceLevel;
  disclaimer: string;
  followUps: string[];
}

export interface CopilotDataPoint {
  label: string;
  value: string;
  source: string;
}

export interface DriftSignal {
  direction: 'MORE_AGGRESSIVE' | 'MORE_CONSERVATIVE';
  suggestedPersona: InvestorPersona;
  driftScore: number;
}
