/**
 * Plain-English Strategy Explanation Generator
 *
 * Produces human-readable explanations of strategy decisions for the copilot UI.
 * Covers model selection rationale, defensive mode, concentration commentary,
 * largest rebalancing action, and data sufficiency notes.
 */

import { Decimal } from '@crestflow/shared';
import type { GoalProfile, ModelType, StrategyExplanation } from '@crestflow/shared';
import type { RebalancingAction } from '../rebalancing/action-generator.js';

// ── Model descriptions ───────────────────────────────────────────────────────

const MODEL_DESCRIPTIONS: Record<ModelType, string> = {
  EQUAL_WEIGHT:
    'Equal-weight allocation distributes capital equally across all assets. ' +
    'This is used when insufficient historical data is available for more advanced models.',
  INVERSE_VOL:
    'Inverse-volatility weighting allocates more to lower-volatility assets. ' +
    'This reduces portfolio variance without requiring a full covariance matrix.',
  HRP_CVAR:
    'Hierarchical Risk Parity with CVaR optimization clusters correlated assets ' +
    'and allocates risk budget using Conditional Value at Risk (95% confidence).',
  BL_HRP_CVAR:
    'Black-Litterman enhanced HRP with CVaR optimization incorporates market views ' +
    'into the covariance structure before applying hierarchical risk parity.',
};

// ── Explainer ─────────────────────────────────────────────────────────────────

export interface ExplainStrategyParams {
  model: ModelType;
  dataPointsUsed: number;
  goalProfile: GoalProfile;
  riskScore: number;
  defensiveMode: boolean;
  hhi: string; // DECIMAL 0-10000
  rebalancingActions: RebalancingAction[];
  insufficientHistory: boolean;
}

export function explainStrategy(params: ExplainStrategyParams): StrategyExplanation {
  const {
    model,
    dataPointsUsed,
    goalProfile,
    riskScore,
    defensiveMode,
    hhi,
    rebalancingActions,
    insufficientHistory,
  } = params;

  const reasons: string[] = [];

  // Model rationale
  reasons.push(MODEL_DESCRIPTIONS[model]);

  // Defensive mode explanation
  if (defensiveMode) {
    reasons.push(
      `Defensive mode is active because the portfolio risk score (${riskScore}) ` +
        `exceeds the ${goalProfile} profile threshold. CrestFlow shifted 10% allocation ` +
        `from volatile assets to stablecoins to reduce exposure.`,
    );
  }

  // HHI concentration commentary
  const hhiNum = new Decimal(hhi).toNumber();
  if (hhiNum > 5000) {
    reasons.push(
      `Portfolio concentration is very high (HHI ${Math.round(hhiNum)}/10,000). ` +
        `The strategy actively diversifies to reduce single-asset dependency.`,
    );
  } else if (hhiNum > 2500) {
    reasons.push(
      `Portfolio concentration is moderate (HHI ${Math.round(hhiNum)}/10,000). ` +
        `The strategy aims to improve diversification across available assets.`,
    );
  } else {
    reasons.push(`Portfolio diversification is healthy (HHI ${Math.round(hhiNum)}/10,000).`);
  }

  // Largest rebalancing action
  const actionableItems = rebalancingActions.filter((a) => a.action !== 'HOLD');
  if (actionableItems.length > 0) {
    const largest = actionableItems[0]; // Already sorted by |delta| descending
    if (largest) {
      const direction = largest.action === 'INCREASE' ? 'increase' : 'decrease';
      reasons.push(
        `The largest recommended action is to ${direction} ${largest.assetSymbol} ` +
          `by ${largest.deltaPercent}% (${largest.urgency} urgency).`,
      );
    }
  } else {
    reasons.push(
      'No rebalancing actions are currently needed — all positions are within tolerance.',
    );
  }

  // Insufficient data note
  if (insufficientHistory) {
    reasons.push(
      'Note: Limited historical data is available. As more portfolio snapshots accumulate, ' +
        'CrestFlow will upgrade to more sophisticated optimization models.',
    );
  }

  // Risk context summary
  const riskContext =
    `${goalProfile} profile with risk score ${riskScore}/100` +
    (defensiveMode ? ' (defensive mode active)' : '') +
    '.';

  return {
    modelUsed: model,
    dataPointsUsed,
    goalProfile,
    riskContext,
    reasons,
    disclaimer:
      'CrestFlow provides strategy recommendations only. No trades are executed ' +
      'without your explicit approval. Past performance does not guarantee future results.',
  };
}
