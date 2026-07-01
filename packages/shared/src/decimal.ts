import { Decimal } from 'decimal.js';

// Configure decimal.js for financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -28,
  toExpPos: 28,
});

export { Decimal };
export type DecimalValue = Decimal.Value;

/** Convert a value to a fixed-precision decimal string (default 8 decimal places). */
export function toDecimalString(value: Decimal.Value, decimalPlaces = 8): string {
  return new Decimal(value).toFixed(decimalPlaces);
}

/** Convert a decimal value (e.g. 0.0544) to basis points (e.g. 544). */
export function toBasisPoints(value: Decimal.Value): number {
  return new Decimal(value).mul(10000).toNumber();
}

/** Convert basis points (e.g. 544) to a decimal value (e.g. 0.0544). */
export function fromBasisPoints(bps: number): Decimal {
  return new Decimal(bps).div(10000);
}

/** Convert micro-units to standard units (e.g. microALGO to ALGO, divide by 10^decimals). */
export function fromMicroUnits(microUnits: Decimal.Value, decimals = 6): Decimal {
  return new Decimal(microUnits).div(new Decimal(10).pow(decimals));
}

/** Convert standard units to micro-units (e.g. ALGO to microALGO, multiply by 10^decimals). */
export function toMicroUnits(units: Decimal.Value, decimals = 6): Decimal {
  return new Decimal(units).mul(new Decimal(10).pow(decimals)).floor();
}

/** Safely divide two values, returning zero if divisor is zero. */
export function safeDivide(
  numerator: Decimal.Value,
  denominator: Decimal.Value,
  fallback: Decimal.Value = 0,
): Decimal {
  const d = new Decimal(denominator);
  if (d.isZero()) {
    return new Decimal(fallback);
  }
  return new Decimal(numerator).div(d);
}
