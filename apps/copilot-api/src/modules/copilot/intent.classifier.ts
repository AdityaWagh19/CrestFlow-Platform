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
  // GOAL_CHANGE checked first — specific multi-word patterns that overlap with risk/strategy
  {
    intent: 'GOAL_CHANGE',
    pattern:
      /(change\s+my|update\s+my|set\s+my|switch\s+to|more\s+(conservative|aggressive)|goal\s*profile|risk\s*tolerance|persona|conservative\s+profile|aggressive\s+mode)/i,
  },
  {
    intent: 'PORTFOLIO_QUERY',
    pattern:
      /\b(portfolio|holdings?|balance|assets?|positions?|exposure|pnl|profit|loss|performance|net\s*worth|total\s*value|how\s+much|what\s+do\s+i\s+(own|have|hold))\b/i,
  },
  {
    intent: 'RISK_QUERY',
    pattern:
      /\b(risk|volatil\w*|drawdown|liquidat\w*|cvar|sharpe|sortino|max\s*draw|danger\w*|safe\b|risky|vulnerable|concentrated|diversif\w*)\b/i,
  },
  {
    intent: 'STRATEGY_QUERY',
    pattern:
      /\b(strateg\w*|rebalanc\w*|optimiz\w*|reallocat\w*|allocat\w*|recommend\w*|suggest\w*|should\s+i\s+(buy|sell|swap|move|rebalance))\b/i,
  },
  {
    intent: 'YIELD_QUERY',
    pattern:
      /\b(yield|apy|apr|interest|earn\w*|stak\w*|lend\w*|borrow\w*|farm\w*|liquidity\s*pool|supply|idle|passive\s*income|reward\w*|folks\s*finance|tinyman|pact)\b/i,
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
