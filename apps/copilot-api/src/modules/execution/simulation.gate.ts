/**
 * Simulation Gate — validates transactions against chain state before signing.
 *
 * MVP STUB: Always returns passed=true.
 * Production: Will call algod.simulateTransaction() on each txn group.
 */

import { createLogger } from '@crestflow/shared';

const logger = createLogger('execution:simulation');

export interface SimulationResult {
  passed: boolean;
  failedGroupIndex: number | null;
  failureReason: string | null;
  simulatedAt: string;
}

/**
 * MVP stub — simulates execution validation.
 * In production, this calls algod.simulateTransaction() on each atomic group.
 */
export function simulateExecution(stepCount: number): SimulationResult {
  // MVP STUB: always passes
  // Production: iterate txn groups, call algod.simulateTransaction(),
  // catch reverts, slippage failures, opt-in failures, insufficient balance
  logger.info({ stepCount }, 'simulation gate passed (MVP stub)');

  return {
    passed: true,
    failedGroupIndex: null,
    failureReason: null,
    simulatedAt: new Date().toISOString(),
  };
}
