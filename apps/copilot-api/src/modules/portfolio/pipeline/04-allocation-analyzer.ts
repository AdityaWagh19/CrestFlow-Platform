/**
 * Step 4 — Allocation + Exposure Analyzer
 * Computes asset, category, and protocol allocations.
 * Calculates direct, indirect (LP-decomposed), and true exposure.
 * Computes HHI concentration index on true exposure weights.
 */

import { Decimal, toDecimalString, safeDivide } from '@crestflow/shared';
import { classifyAsset } from './03-asset-classifier.js';
import type { AssetHolding, ProtocolPosition } from '@crestflow/shared';
import type { LpDecomposition } from './02-lp-decomposer.js';

export interface ExposureEntry {
  valueUsd: string;
  percent: string;
}

export interface AllocationResult {
  totalValueUsd: string;
  assetAllocation: Record<string, ExposureEntry>;
  categoryAllocation: { volatile: string; stablecoin: string; lending: string };
  protocolAllocation: { native: string; folks: string; tinyman: string; pact: string };
  directExposure: Record<string, ExposureEntry>;
  indirectExposure: Record<string, ExposureEntry>;
  trueExposure: Record<string, ExposureEntry>;
  hhi: string;
}

export function analyzeAllocation(
  holdings: AssetHolding[],
  positions: ProtocolPosition[],
  decompositions: LpDecomposition[],
): AllocationResult {
  // ── 1. Compute total value ──────────────────────────────────────────────
  let totalValue = new Decimal('0');

  // Direct wallet holdings value
  for (const h of holdings) {
    totalValue = totalValue.plus(new Decimal(h.valueUsd));
  }

  // Protocol position values (Folks supply/borrow, LP values already in holdings via normalizer)
  for (const p of positions) {
    if (p.positionType === 'supply') {
      totalValue = totalValue.plus(new Decimal(p.valueUsd));
    }
    if (p.positionType === 'borrow') {
      totalValue = totalValue.minus(new Decimal(p.valueUsd));
    }
  }

  // Ensure non-negative
  if (totalValue.isNegative()) totalValue = new Decimal('0');

  // ── 2. Direct exposure (raw wallet holdings only) ───────────────────────
  const direct: Record<string, Decimal> = {};
  for (const h of holdings) {
    const symbol = h.symbol;
    direct[symbol] = (direct[symbol] ?? new Decimal('0')).plus(new Decimal(h.valueUsd));
  }

  // ── 3. Indirect exposure (from LP decomposition) ────────────────────────
  const indirect: Record<string, Decimal> = {};
  for (const lp of decompositions) {
    const val1 = new Decimal(lp.asset1ValueUsd);
    const val2 = new Decimal(lp.asset2ValueUsd);
    indirect[lp.asset1Symbol] = (indirect[lp.asset1Symbol] ?? new Decimal('0')).plus(val1);
    indirect[lp.asset2Symbol] = (indirect[lp.asset2Symbol] ?? new Decimal('0')).plus(val2);
  }

  // ── 4. True exposure = direct + indirect ────────────────────────────────
  const trueExp: Record<string, Decimal> = {};
  for (const [symbol, val] of Object.entries(direct)) {
    trueExp[symbol] = (trueExp[symbol] ?? new Decimal('0')).plus(val);
  }
  for (const [symbol, val] of Object.entries(indirect)) {
    trueExp[symbol] = (trueExp[symbol] ?? new Decimal('0')).plus(val);
  }

  // Add Folks supply positions to true exposure
  for (const p of positions) {
    if (p.positionType === 'supply') {
      const symbol = p.assetSymbol;
      trueExp[symbol] = (trueExp[symbol] ?? new Decimal('0')).plus(new Decimal(p.valueUsd));
    }
  }

  // ── 5. HHI on true exposure weights ─────────────────────────────────────
  const trueTotal = Object.values(trueExp).reduce((s, v) => s.plus(v), new Decimal('0'));
  let hhi = new Decimal('0');
  if (trueTotal.gt(0)) {
    for (const val of Object.values(trueExp)) {
      const weight = val.div(trueTotal).mul(100);
      hhi = hhi.plus(weight.pow(2));
    }
  }

  // ── 6. Category allocation ──────────────────────────────────────────────
  let volatileVal = new Decimal('0');
  let stablecoinVal = new Decimal('0');
  let lendingVal = new Decimal('0');

  for (const h of holdings) {
    const cat = classifyAsset(h.assetId);
    if (cat === 'stablecoin') stablecoinVal = stablecoinVal.plus(new Decimal(h.valueUsd));
    else volatileVal = volatileVal.plus(new Decimal(h.valueUsd));
  }
  for (const p of positions) {
    if (p.positionType === 'supply') {
      lendingVal = lendingVal.plus(new Decimal(p.valueUsd));
    }
  }

  // ── 7. Protocol allocation ──────────────────────────────────────────────
  let nativeVal = new Decimal('0');
  let folksVal = new Decimal('0');
  let tinymanVal = new Decimal('0');
  let pactVal = new Decimal('0');

  for (const h of holdings) {
    if (h.source === 'native') nativeVal = nativeVal.plus(new Decimal(h.valueUsd));
  }
  for (const p of positions) {
    if (p.protocol === 'folks-finance') folksVal = folksVal.plus(new Decimal(p.valueUsd));
    if (p.protocol === 'tinyman') tinymanVal = tinymanVal.plus(new Decimal(p.valueUsd));
    if (p.protocol === 'pact') pactVal = pactVal.plus(new Decimal(p.valueUsd));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const toPercentMap = (
    map: Record<string, Decimal>,
    total: Decimal,
  ): Record<string, ExposureEntry> => {
    const result: Record<string, ExposureEntry> = {};
    for (const [k, v] of Object.entries(map)) {
      result[k] = {
        valueUsd: toDecimalString(v, 2),
        percent: toDecimalString(safeDivide(v, total).mul(100), 4),
      };
    }
    return result;
  };

  const pctString = (val: Decimal, total: Decimal): string =>
    toDecimalString(safeDivide(val, total).mul(100), 4);

  return {
    totalValueUsd: toDecimalString(totalValue, 2),
    assetAllocation: toPercentMap(trueExp, trueTotal.isZero() ? new Decimal('1') : trueTotal),
    categoryAllocation: {
      volatile: pctString(volatileVal, totalValue.isZero() ? new Decimal('1') : totalValue),
      stablecoin: pctString(stablecoinVal, totalValue.isZero() ? new Decimal('1') : totalValue),
      lending: pctString(lendingVal, totalValue.isZero() ? new Decimal('1') : totalValue),
    },
    protocolAllocation: {
      native: pctString(nativeVal, totalValue.isZero() ? new Decimal('1') : totalValue),
      folks: pctString(folksVal, totalValue.isZero() ? new Decimal('1') : totalValue),
      tinyman: pctString(tinymanVal, totalValue.isZero() ? new Decimal('1') : totalValue),
      pact: pctString(pactVal, totalValue.isZero() ? new Decimal('1') : totalValue),
    },
    directExposure: toPercentMap(direct, totalValue.isZero() ? new Decimal('1') : totalValue),
    indirectExposure: toPercentMap(indirect, totalValue.isZero() ? new Decimal('1') : totalValue),
    trueExposure: toPercentMap(trueExp, trueTotal.isZero() ? new Decimal('1') : trueTotal),
    hhi: toDecimalString(hhi, 4),
  };
}
