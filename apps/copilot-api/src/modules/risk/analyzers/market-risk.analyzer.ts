/**
 * Market Risk Analyzer
 * Computes CVaR (95%), VaR (95%), Sortino Ratio, Maximum Drawdown,
 * Calmar Ratio, and realized volatility (7D/30D annualized).
 *
 * Uses historical simulation — no parametric distribution assumed.
 */

import { Decimal, toDecimalString } from '@crestflow/shared';

export const MIN_SNAPSHOTS_FOR_CVAR = 20;
export const MIN_SNAPSHOTS_FOR_SORTINO = 14;
export const MIN_SNAPSHOTS_FOR_MDD = 7;

export interface MarketRiskResult {
  cvar95Percent: string | null;
  var95Percent: string | null;
  sortinoRatio: string | null;
  maxDrawdownPercent: string | null;
  calmarRatio: string | null;
  realizedVol7dPercent: string | null;
  realizedVol30dPercent: string | null;
  snapshotsUsed: number;
  insufficientHistory: boolean;
  componentScore: number; // 0-100
}

export function analyzeMarketRisk(returns: number[], snapshotValues: string[]): MarketRiskResult {
  const n = returns.length;
  const insufficient = n < MIN_SNAPSHOTS_FOR_MDD;

  // ── CVaR (Historical Simulation, 95% confidence) ──────────────────────
  const sorted = [...returns].sort((a, b) => a - b);
  const alpha = 0.05;
  const varIndex = Math.max(1, Math.floor(alpha * sorted.length));

  const varValue = sorted[varIndex];
  const var95 =
    n >= MIN_SNAPSHOTS_FOR_CVAR && varValue !== undefined ? toDecimalString(varValue) : null;

  const tailLosses = sorted.slice(0, varIndex);
  const cvar95 =
    n >= MIN_SNAPSHOTS_FOR_CVAR && tailLosses.length > 0
      ? toDecimalString(tailLosses.reduce((sum, r) => sum + r, 0) / tailLosses.length)
      : null;

  // ── Sortino Ratio (target return = 0) ─────────────────────────────────
  let sortino: string | null = null;
  if (n >= MIN_SNAPSHOTS_FOR_SORTINO) {
    const target = 0;
    const avgReturn = returns.reduce((s, r) => s + r, 0) / n;
    const downsideReturns = returns.filter((r) => r < target);
    if (downsideReturns.length > 0) {
      const downsideDev = Math.sqrt(downsideReturns.reduce((s, r) => s + (r - target) ** 2, 0) / n);
      if (downsideDev > 0) {
        sortino = toDecimalString(new Decimal(avgReturn).div(downsideDev));
      }
    }
  }

  // ── Maximum Drawdown ──────────────────────────────────────────────────
  let mdd: string | null = null;
  let calmar: string | null = null;
  if (n >= MIN_SNAPSHOTS_FOR_MDD && snapshotValues.length >= 2) {
    const values = snapshotValues.map((v) => new Decimal(v).toNumber());
    let peak = values[0] ?? 0;
    let maxDrawdown = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    mdd = toDecimalString(maxDrawdown);

    // Calmar: annualized return / MDD
    if (maxDrawdown > 0 && values.length > 1) {
      const first = values[0] ?? 1;
      const last = values[values.length - 1] ?? first;
      if (first > 0) {
        const yearsElapsed = Math.max(1 / 365, n / 365);
        const cagr = Math.pow(last / first, 1 / yearsElapsed) - 1;
        calmar = toDecimalString(new Decimal(cagr).div(maxDrawdown));
      }
    }
  }

  // ── Realized Volatility (annualized) ──────────────────────────────────
  const vol7d = computeAnnualizedVol(returns.slice(-7));
  const vol30d = computeAnnualizedVol(returns.slice(-30));

  // ── Component Score (0-100, higher = more market risk) ────────────────
  let score = 0;
  if (cvar95 !== null) {
    const cvarAbs = Math.abs(new Decimal(cvar95).toNumber());
    score += Math.min(30, Math.round((cvarAbs / 0.1) * 30));
  } else {
    score += 15; // assume medium if insufficient
  }
  if (mdd !== null) {
    const mddNum = new Decimal(mdd).toNumber();
    score += Math.min(40, Math.round((mddNum / 0.5) * 40));
  }
  if (vol30d !== null) {
    const volNum = new Decimal(vol30d).toNumber() / 100;
    score += Math.min(30, Math.round((volNum / 1.0) * 30));
  }

  return {
    cvar95Percent: cvar95,
    var95Percent: var95,
    sortinoRatio: sortino,
    maxDrawdownPercent: mdd,
    calmarRatio: calmar,
    realizedVol7dPercent: vol7d,
    realizedVol30dPercent: vol30d,
    snapshotsUsed: n,
    insufficientHistory: insufficient,
    componentScore: Math.min(100, score),
  };
}

function computeAnnualizedVol(returns: number[]): string | null {
  if (returns.length < 3) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  return toDecimalString(new Decimal(dailyVol).mul(Math.sqrt(365)).mul(100), 4);
}
