/**
 * Step 6 — Health Scorer
 * Computes a weighted composite health score (0-100) from 5 components.
 * All scores are deterministic and decomposable.
 *
 * Components:
 *   Diversification (0-30) — from HHI concentration index
 *   Liquidity       (0-20) — % in liquid assets (ALGO + stablecoins)
 *   Yield Quality   (0-20) — risk-adjusted yield performance
 *   Sustainability  (0-15) — % from audited lending protocols
 *   Protocol Health  (0-15) — % in known, vetted protocols
 */

import { Decimal, toDecimalString } from '@crestflow/shared';
import type { ProtocolPosition } from '@crestflow/shared';
import type { AllocationResult } from './04-allocation-analyzer.js';

export interface HealthScoreResult {
  score: number; // 0-100 integer
  components: {
    diversification: number; // 0-30
    liquidity: number; // 0-20
    yieldQuality: number; // 0-20
    sustainability: number; // 0-15
    protocolHealth: number; // 0-15
  };
  strengths: string[];
  weaknesses: string[];
}

export function calculateHealthScore(
  hhi: string,
  allocation: AllocationResult,
  positions: ProtocolPosition[],
): HealthScoreResult {
  const hhiDecimal = new Decimal(hhi);
  const totalValue = new Decimal(allocation.totalValueUsd);

  // ── Component 1: Diversification (0-30) ─────────────────────────────────
  // Lower HHI = better. HHI 0 → 30pts, HHI 10000 → 0pts
  const divRaw = new Decimal(30).mul(new Decimal(1).minus(hhiDecimal.div(10000)));
  const diversification = Math.max(0, Math.min(30, Math.round(divRaw.toNumber())));

  // ── Component 2: Liquidity (0-20) ───────────────────────────────────────
  // % of portfolio in immediately liquid assets (stablecoins + native ALGO)
  const stablePercent = new Decimal(allocation.categoryAllocation.stablecoin);
  const nativePercent = new Decimal(allocation.protocolAllocation.native);
  const liquidPercent = stablePercent.plus(nativePercent);
  // 20pts if >= 40% liquid, scaled linearly
  const liqRaw = liquidPercent.div(40).mul(20);
  const liquidity = Math.max(0, Math.min(20, Math.round(liqRaw.toNumber())));

  // ── Component 3: Yield Quality (0-20) ───────────────────────────────────
  // Weighted average APY across yield-bearing positions
  let weightedApySum = new Decimal('0');
  let yieldPositionValue = new Decimal('0');

  for (const p of positions) {
    if (p.apyPercent && (p.positionType === 'supply' || p.positionType === 'lp')) {
      const posVal = new Decimal(p.valueUsd);
      weightedApySum = weightedApySum.plus(new Decimal(p.apyPercent).mul(posVal));
      yieldPositionValue = yieldPositionValue.plus(posVal);
    }
  }

  const avgApy = yieldPositionValue.gt(0)
    ? weightedApySum.div(yieldPositionValue)
    : new Decimal('0');
  // 20pts at 20%+ APY, scaled linearly
  const yqRaw = avgApy.div(20).mul(20);
  const yieldQuality = Math.max(0, Math.min(20, Math.round(yqRaw.toNumber())));

  // ── Component 4: Sustainability (0-15) ──────────────────────────────────
  // Heuristic: Folks Finance lending APY is sustainable (fee-based, not emissions)
  const folksPercent = new Decimal(allocation.protocolAllocation.folks);
  const susRaw = folksPercent.div(100).mul(15);
  const sustainability = Math.max(0, Math.min(15, Math.round(susRaw.toNumber())));

  // ── Component 5: Protocol Health (0-15) ─────────────────────────────────
  // Known, audited protocols (Folks, Tinyman, Pact) + native = full score
  const knownPercent = new Decimal(allocation.protocolAllocation.folks)
    .plus(new Decimal(allocation.protocolAllocation.tinyman))
    .plus(new Decimal(allocation.protocolAllocation.pact))
    .plus(new Decimal(allocation.protocolAllocation.native));
  const phRaw = knownPercent.div(100).mul(15);
  const protocolHealth = Math.max(0, Math.min(15, Math.round(phRaw.toNumber())));

  const score = Math.min(
    100,
    diversification + liquidity + yieldQuality + sustainability + protocolHealth,
  );

  // ── Descriptive insights ────────────────────────────────────────────────
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (diversification >= 24)
    strengths.push('Well-diversified portfolio with low concentration risk');
  if (diversification < 10)
    weaknesses.push(
      `High concentration risk — HHI ${toDecimalString(hhiDecimal, 0)} indicates over-exposure to single assets`,
    );

  if (liquidity >= 16) strengths.push('Strong liquidity buffer in stable and native assets');
  if (liquidity < 6)
    weaknesses.push('Low liquidity — majority of assets are in illiquid positions');

  if (yieldQuality >= 15) strengths.push('Portfolio generating above-benchmark DeFi yields');
  if (yieldQuality < 5 && totalValue.gt(100))
    weaknesses.push('Low yield — consider deploying idle capital to lending or LP positions');

  if (folksPercent.gt(30))
    strengths.push('Significant allocation to audited lending protocol (Folks Finance)');

  if (protocolHealth >= 13) strengths.push('All assets deployed in known, vetted protocols');

  return {
    score,
    components: { diversification, liquidity, yieldQuality, sustainability, protocolHealth },
    strengths,
    weaknesses,
  };
}
