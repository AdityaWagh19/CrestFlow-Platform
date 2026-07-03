/**
 * Alert Evaluator
 * Evaluates 8 alert conditions against analyzer outputs.
 * Returns a list of conditions with isTriggered flag.
 */

import { Decimal } from '@crestflow/shared';
import { HF_THRESHOLDS } from '../analyzers/liquidation.analyzer.js';
import type { MarketRiskResult } from '../analyzers/market-risk.analyzer.js';
import type { LiquidationRiskResult } from '../analyzers/liquidation.analyzer.js';
import type { ConcentrationRiskResult } from '../analyzers/concentration.analyzer.js';
import type { LiquidityRiskResult } from '../analyzers/liquidity.analyzer.js';

export interface AlertCondition {
  alertType: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  isTriggered: boolean;
}

export function evaluateAlertConditions(
  market: MarketRiskResult,
  liquidation: LiquidationRiskResult,
  concentration: ConcentrationRiskResult,
  liquidity: LiquidityRiskResult,
  protocolScores: Record<string, number>,
): AlertCondition[] {
  const conditions: AlertCondition[] = [];
  const minHf = liquidation.minHealthFactor
    ? new Decimal(liquidation.minHealthFactor).toNumber()
    : null;

  // 1. LIQUIDATION_IMMINENT — HF < 1.1
  conditions.push({
    alertType: 'LIQUIDATION_IMMINENT',
    severity: 'CRITICAL',
    title: 'Liquidation Risk: Critical',
    message: `Health factor of ${minHf?.toFixed(3) ?? 'N/A'} is dangerously close to liquidation. Add collateral or repay debt immediately.`,
    metadata: {
      healthFactor: liquidation.minHealthFactor,
      positions: liquidation.positions,
    },
    isTriggered: minHf !== null && minHf < HF_THRESHOLDS.CRITICAL,
  });

  // 2. LIQUIDATION_WARNING — HF 1.1-1.3
  conditions.push({
    alertType: 'LIQUIDATION_WARNING',
    severity: 'HIGH',
    title: 'Liquidation Risk: Warning',
    message: `Health factor of ${minHf?.toFixed(3) ?? 'N/A'} is approaching the liquidation zone. Consider reducing exposure.`,
    metadata: { healthFactor: liquidation.minHealthFactor },
    isTriggered: minHf !== null && minHf >= HF_THRESHOLDS.CRITICAL && minHf < HF_THRESHOLDS.WARNING,
  });

  // 3. HIGH_CONCENTRATION — HHI > 5000
  const assetHhiNum = new Decimal(concentration.assetHhi).toNumber();
  conditions.push({
    alertType: 'HIGH_CONCENTRATION',
    severity: 'HIGH',
    title: 'High Portfolio Concentration',
    message: `Concentration index of ${Math.round(assetHhiNum)}/10,000 indicates severe single-asset dependency.`,
    metadata: { hhi: concentration.assetHhi, threshold: 5000 },
    isTriggered: assetHhiNum > 5000,
  });

  // 4. MODERATE_CONCENTRATION — HHI 2500-5000
  conditions.push({
    alertType: 'MODERATE_CONCENTRATION',
    severity: 'MEDIUM',
    title: 'Moderate Portfolio Concentration',
    message: `Concentration index of ${Math.round(assetHhiNum)}/10,000 indicates moderate concentration risk.`,
    metadata: { hhi: concentration.assetHhi },
    isTriggered: assetHhiNum > 2500 && assetHhiNum <= 5000,
  });

  // 5. HIGH_VOLATILITY — 30D annualized vol > 80%
  const vol30d = market.realizedVol30dPercent
    ? new Decimal(market.realizedVol30dPercent).toNumber()
    : null;
  conditions.push({
    alertType: 'HIGH_VOLATILITY',
    severity: 'MEDIUM',
    title: 'High Portfolio Volatility',
    message: `30-day annualized volatility is ${vol30d?.toFixed(1) ?? 'N/A'}% — above typical DeFi benchmarks.`,
    metadata: { vol30dPercent: market.realizedVol30dPercent },
    isTriggered: vol30d !== null && vol30d > 80,
  });

  // 6. SIGNIFICANT_DRAWDOWN — MDD > 30%
  const mddPct = market.maxDrawdownPercent
    ? new Decimal(market.maxDrawdownPercent).mul(100).toNumber()
    : null;
  conditions.push({
    alertType: 'SIGNIFICANT_DRAWDOWN',
    severity: 'HIGH',
    title: 'Significant Portfolio Drawdown',
    message: `Maximum drawdown of ${mddPct?.toFixed(1) ?? 'N/A'}% from portfolio peak.`,
    metadata: { maxDrawdownPercent: market.maxDrawdownPercent },
    isTriggered: mddPct !== null && mddPct > 30,
  });

  // 7. LOW_LIQUIDITY — any position exit impact > 2%
  const maxImpact = new Decimal(liquidity.maxExitImpactPercent).toNumber();
  conditions.push({
    alertType: 'LOW_LIQUIDITY',
    severity: 'MEDIUM',
    title: 'Low Exit Liquidity',
    message: `Exiting your largest position would cause ~${maxImpact.toFixed(2)}% price impact.`,
    metadata: {
      maxImpactPercent: liquidity.maxExitImpactPercent,
      highImpactPositions: liquidity.positions.filter(
        (p) => new Decimal(p.impactPercent).toNumber() > 2,
      ),
    },
    isTriggered: maxImpact > 2,
  });

  // 8. LOW_PROTOCOL_SCORE — any used protocol < 60
  const lowProtocols = Object.entries(protocolScores).filter(([, score]) => score < 60);
  conditions.push({
    alertType: 'LOW_PROTOCOL_SCORE',
    severity: 'MEDIUM',
    title: 'Protocol Risk Detected',
    message: `Protocols with below-threshold safety scores: ${lowProtocols.map(([p]) => p).join(', ') || 'none'}.`,
    metadata: { lowProtocols: lowProtocols.map(([p, s]) => ({ protocol: p, score: s })) },
    isTriggered: lowProtocols.length > 0,
  });

  return conditions;
}
