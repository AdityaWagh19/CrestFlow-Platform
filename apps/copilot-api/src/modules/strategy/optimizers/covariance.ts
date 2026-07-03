/**
 * Covariance Estimation — Ledoit-Wolf Shrinkage
 *
 * Computes a shrunk covariance matrix using the Ledoit-Wolf (2004) linear
 * shrinkage estimator.  The sample covariance is blended with a structured
 * target (scaled identity) to reduce estimation error, especially when the
 * number of observations is comparable to the number of assets.
 *
 * Also provides a helper to convert a covariance matrix into a correlation
 * matrix, which is needed by HRP and other optimizers.
 *
 * Reference: Ledoit, O. & Wolf, M. (2004) "A well-conditioned estimator for
 *            large-dimensional covariance matrices", Journal of Multivariate
 *            Analysis 88(2), 365-411.
 */

/**
 * Compute the Ledoit-Wolf shrunk covariance matrix.
 *
 * @param returns  T x N matrix — T observations for N assets (row-major).
 * @returns        The NxN shrunk covariance matrix and the shrinkage intensity alpha.
 */
export function ledoitWolfShrinkage(returns: number[][]): {
  matrix: number[][];
  alpha: number;
} {
  const T = returns.length;
  if (T === 0) return { matrix: [], alpha: 0 };

  const N = returns[0]!.length;
  if (N === 0) return { matrix: [], alpha: 0 };

  // ── 1. Column means ────────────────────────────────────────────────────
  const means: number[] = new Array<number>(N).fill(0);
  for (let t = 0; t < T; t++) {
    const row = returns[t]!;
    for (let i = 0; i < N; i++) {
      means[i]! += row[i]!;
    }
  }
  for (let i = 0; i < N; i++) {
    means[i] = means[i]! / T;
  }

  // ── 2. De-meaned returns ───────────────────────────────────────────────
  const X: number[][] = [];
  for (let t = 0; t < T; t++) {
    const row = returns[t]!;
    const xRow: number[] = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      xRow[i] = row[i]! - means[i]!;
    }
    X.push(xRow);
  }

  // ── 3. Sample covariance (1/T, not 1/(T-1)) ───────────────────────────
  const S: number[][] = [];
  for (let i = 0; i < N; i++) {
    const sRow: number[] = new Array<number>(N).fill(0);
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let t = 0; t < T; t++) {
        sum += X[t]![i]! * X[t]![j]!;
      }
      sRow[j] = sum / T;
    }
    S.push(sRow);
  }

  // ── 4. Shrinkage target: mu * I (scaled identity) ─────────────────────
  let trace = 0;
  for (let i = 0; i < N; i++) {
    trace += S[i]![i]!;
  }
  const mu = trace / N;

  // ── 5. Compute optimal shrinkage intensity (Ledoit-Wolf formula) ──────
  // sum of squared off-diagonal + diagonal terms of (S - mu*I)
  let delta = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const target = i === j ? mu : 0;
      delta += (S[i]![j]! - target) ** 2;
    }
  }
  delta /= N * N;

  // Estimate pi_hat: sum of asymptotic variances of entries of S
  let piHat = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let sumSq = 0;
      for (let t = 0; t < T; t++) {
        sumSq += (X[t]![i]! * X[t]![j]! - S[i]![j]!) ** 2;
      }
      piHat += sumSq / T;
    }
  }
  piHat /= N * N;

  // Alpha = pi_hat / (T * delta), clamped to [0, 1]
  let alpha = delta > 0 ? piHat / (T * delta) : 1;
  alpha = Math.max(0, Math.min(1, alpha));

  // ── 6. Shrunk covariance: alpha * mu * I + (1 - alpha) * S ────────────
  const shrunk: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = new Array<number>(N);
    for (let j = 0; j < N; j++) {
      const target = i === j ? mu : 0;
      row[j] = alpha * target + (1 - alpha) * S[i]![j]!;
    }
    shrunk.push(row);
  }

  return { matrix: shrunk, alpha };
}

/**
 * Convert a covariance matrix to a correlation matrix.
 *
 * corr[i][j] = cov[i][j] / sqrt(cov[i][i] * cov[j][j])
 * Diagonal entries are set to exactly 1.0.
 */
export function covToCorr(cov: number[][]): number[][] {
  const N = cov.length;
  if (N === 0) return [];

  const stds: number[] = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    stds[i] = Math.sqrt(Math.max(0, cov[i]![i]!));
  }

  const corr: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = new Array<number>(N);
    for (let j = 0; j < N; j++) {
      if (i === j) {
        row[j] = 1.0;
      } else if (stds[i]! > 0 && stds[j]! > 0) {
        row[j] = cov[i]![j]! / (stds[i]! * stds[j]!);
      } else {
        row[j] = 0;
      }
    }
    corr.push(row);
  }

  return corr;
}
