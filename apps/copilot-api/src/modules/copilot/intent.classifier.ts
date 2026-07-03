/**
 * Intent Classifier — Regex-based keyword matching for copilot queries.
 * Maps user queries to one of the known CopilotIntent categories.
 */

export type CopilotIntent =
  'PORTFOLIO_QUERY' | 'RISK_QUERY' | 'STRATEGY_QUERY' | 'YIELD_QUERY' | 'GOAL_CHANGE' | 'GENERAL';

interface IntentRule {
  intent: CopilotIntent;
  pattern: RegExp;
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'PORTFOLIO_QUERY',
    pattern:
      /\b(portfolio|holdings?|balance|allocation|assets?|positions?|exposure|pnl|profit|loss|performance|net\s?worth|total\s?value|how\s+much|what\s+do\s+i\s+(own|have|hold))\b/i,
  },
  {
    intent: 'RISK_QUERY',
    pattern:
      /\b(risk|volatility|drawdown|liquidat|var\b|cvar|sharpe|sortino|max\s?draw|risk\s?score|danger|safe|risky|vulnerable|concentrated|diversif|correlation|beta)\b/i,
  },
  {
    intent: 'STRATEGY_QUERY',
    pattern:
      /\b(strateg|rebalance|optimiz|reallocat|weight|mean.?variance|hrp|black.?litterman|inverse.?vol|equal.?weight|recommend|suggest|should\s+i\s+(buy|sell|swap|move|rebalance)|action|trade)\b/i,
  },
  {
    intent: 'YIELD_QUERY',
    pattern:
      /\b(yield|apy|apr|interest|earn|staking|lend|borrow|farm|liquidity\s?pool|supply|idle|passive\s?income|reward|folks\s?finance|tinyman|pact)\b/i,
  },
  {
    intent: 'GOAL_CHANGE',
    pattern:
      /\b(goal|target|objective|change\s+my|update\s+my|set\s+my|risk\s?tolerance|time\s?horizon|persona|conservative|aggressive|balanced|growth|yield.?seek)\b/i,
  },
];

/**
 * Classify a user query into one of the known intent categories.
 * Uses ordered regex rules; first match wins. Falls back to GENERAL.
 */
export function classifyIntent(query: string): CopilotIntent {
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(query)) {
      return rule.intent;
    }
  }
  return 'GENERAL';
}
