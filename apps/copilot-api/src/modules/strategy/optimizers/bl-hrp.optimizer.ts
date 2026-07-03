/**
 * Black-Litterman + HRP Hybrid Optimizer — Phase 2 Stub
 *
 * This optimizer combines the Black-Litterman (1992) model with Hierarchical
 * Risk Parity to incorporate analyst "views" (expected return tilts) into
 * the HRP allocation framework.
 *
 * **Not yet implemented.**  The BL-HRP hybrid requires:
 *   - At least 90 daily portfolio snapshots for stable covariance estimation
 *   - A views matrix derived from CrestFlow's momentum and sentiment engines
 *   - Calibrated uncertainty parameters (tau, omega)
 *
 * This will be implemented in Phase 2 when:
 *   1. Engine 2 (Risk) has accumulated 90+ snapshots for active users
 *   2. Engine 4 (Momentum) produces calibrated return forecasts
 *   3. Engine 5 (Knowledge) provides sentiment-derived view confidence
 *
 * Reference: Black, F. & Litterman, R. (1992) "Global Portfolio Optimization",
 *            Financial Analysts Journal 48(5), 28-43.
 */

/**
 * Black-Litterman + HRP optimization.
 *
 * @throws Error  Always — this is a Phase 2 feature requiring 90+ snapshots.
 */
export function blHrpOptimize(): never {
  throw new Error(
    'BL-HRP optimizer is a Phase 2 feature. ' +
      'Requires 90+ daily snapshots for stable covariance estimation, ' +
      'calibrated momentum views from Engine 4, and sentiment confidence from Engine 5. ' +
      'Use hrpOptimize or meanCvarOptimize for Phase 1.',
  );
}
