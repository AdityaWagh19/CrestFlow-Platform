/**
 * Hierarchical Risk Parity (HRP) Optimizer
 *
 * Implements the HRP algorithm from Lopez de Prado (2016) which builds a
 * diversified portfolio without requiring covariance matrix inversion.
 *
 * Three steps:
 *   1. Distance matrix — derived from correlation matrix via d(i,j) = sqrt(0.5*(1-corr(i,j)))
 *   2. Hierarchical clustering — single-linkage agglomerative clustering
 *   3. Recursive bisection — split clusters and allocate by inverse variance
 *
 * All weights are non-negative and sum to 1.0.
 *
 * Reference: Lopez de Prado, M. (2016) "Building Diversified Portfolios that
 *            Outperform Out-of-Sample", Journal of Portfolio Management 42(4).
 */

/**
 * Run HRP optimization to produce portfolio weights.
 *
 * @param cov   NxN covariance matrix
 * @param corr  NxN correlation matrix (must be consistent with cov)
 * @returns     Array of N non-negative weights summing to 1.0
 */
export function hrpOptimize(cov: number[][], corr: number[][]): number[] {
  const N = cov.length;
  if (N === 0) return [];
  if (N === 1) return [1.0];

  // ── Step 1: Distance matrix from correlation ───────────────────────────
  const dist: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = new Array<number>(N);
    for (let j = 0; j < N; j++) {
      row[j] = Math.sqrt(Math.max(0, 0.5 * (1 - corr[i]![j]!)));
    }
    dist.push(row);
  }

  // ── Step 2: Single-linkage hierarchical clustering ─────────────────────
  const order = singleLinkageClustering(dist, N);

  // ── Step 3: Recursive bisection with inverse-variance allocation ───────
  const weights = new Array<number>(N).fill(1.0);
  recursiveBisection(weights, cov, order);

  // Normalize to ensure exact sum = 1.0
  const total = weights.reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (let i = 0; i < N; i++) {
      weights[i] = weights[i]! / total;
    }
  } else {
    // Fallback to equal weight
    for (let i = 0; i < N; i++) {
      weights[i] = 1.0 / N;
    }
  }

  return weights;
}

/**
 * Single-linkage agglomerative clustering. Returns a quasi-optimal leaf order.
 * At each step the two closest clusters are merged. The final leaf order
 * is the concatenation order produced by the dendrogram.
 */
function singleLinkageClustering(dist: number[][], N: number): number[] {
  // Each cluster starts as a single asset
  const clusters: number[][] = [];
  for (let i = 0; i < N; i++) {
    clusters.push([i]);
  }

  // Track which clusters are still active
  const active = new Set<number>();
  for (let i = 0; i < N; i++) {
    active.add(i);
  }

  // Pairwise distance between clusters (single-linkage = min)
  const clusterDist: Map<string, number> = new Map();
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      clusterDist.set(`${i},${j}`, dist[i]![j]!);
    }
  }

  let nextId = N;
  for (let step = 0; step < N - 1; step++) {
    // Find minimum distance pair among active clusters
    let minDist = Infinity;
    let mergeA = -1;
    let mergeB = -1;

    const activeArr = Array.from(active);
    for (let ai = 0; ai < activeArr.length; ai++) {
      for (let bi = ai + 1; bi < activeArr.length; bi++) {
        const a = activeArr[ai]!;
        const b = activeArr[bi]!;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const d = clusterDist.get(key) ?? Infinity;
        if (d < minDist) {
          minDist = d;
          mergeA = a;
          mergeB = b;
        }
      }
    }

    if (mergeA < 0 || mergeB < 0) break;

    // Create new merged cluster
    const newCluster = [...clusters[mergeA]!, ...clusters[mergeB]!];
    clusters.push(newCluster);

    // Update distances (single-linkage: min of distances to merged pair)
    for (const c of active) {
      if (c === mergeA || c === mergeB) continue;
      const keyA = c < mergeA ? `${c},${mergeA}` : `${mergeA},${c}`;
      const keyB = c < mergeB ? `${c},${mergeB}` : `${mergeB},${c}`;
      const dA = clusterDist.get(keyA) ?? Infinity;
      const dB = clusterDist.get(keyB) ?? Infinity;
      const newKey = c < nextId ? `${c},${nextId}` : `${nextId},${c}`;
      clusterDist.set(newKey, Math.min(dA, dB));
    }

    active.delete(mergeA);
    active.delete(mergeB);
    active.add(nextId);
    nextId++;
  }

  // The last cluster contains the quasi-optimal leaf ordering
  return clusters[clusters.length - 1]!;
}

/**
 * Recursive bisection: split the ordered list of assets and allocate
 * weights proportional to inverse cluster variance at each split.
 */
function recursiveBisection(weights: number[], cov: number[][], items: number[]): void {
  if (items.length <= 1) return;

  const mid = Math.floor(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  const varLeft = clusterVariance(cov, left);
  const varRight = clusterVariance(cov, right);

  // Allocate inversely proportional to variance
  const totalInvVar = (varLeft > 0 ? 1 / varLeft : 0) + (varRight > 0 ? 1 / varRight : 0);

  let alphaLeft: number;
  if (totalInvVar > 0) {
    alphaLeft = varLeft > 0 ? 1 / varLeft / totalInvVar : 0;
  } else {
    alphaLeft = 0.5;
  }
  const alphaRight = 1 - alphaLeft;

  for (const i of left) {
    weights[i] = weights[i]! * alphaLeft;
  }
  for (const i of right) {
    weights[i] = weights[i]! * alphaRight;
  }

  recursiveBisection(weights, cov, left);
  recursiveBisection(weights, cov, right);
}

/**
 * Compute the variance of an inverse-variance-weighted portfolio
 * of assets within a cluster.
 */
function clusterVariance(cov: number[][], items: number[]): number {
  if (items.length === 0) return 0;
  if (items.length === 1) return cov[items[0]!]![items[0]!]!;

  // Inverse-variance weights within cluster
  const invVars: number[] = [];
  let totalInvVar = 0;
  for (const i of items) {
    const v = cov[i]![i]!;
    const iv = v > 0 ? 1 / v : 0;
    invVars.push(iv);
    totalInvVar += iv;
  }

  if (totalInvVar === 0) return 0;

  const w: number[] = invVars.map((iv) => iv / totalInvVar);

  // Portfolio variance: w' * cov * w
  let portVar = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = 0; b < items.length; b++) {
      portVar += w[a]! * w[b]! * cov[items[a]!]![items[b]!]!;
    }
  }

  return Math.max(0, portVar);
}
