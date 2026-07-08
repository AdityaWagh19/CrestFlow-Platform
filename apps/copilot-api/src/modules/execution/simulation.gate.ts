/**
 * Simulation Gate — validates transactions against chain state before signing.
 * Uses algod.simulateTransactions() when available, falls back to basic validation.
 */

import { createLogger } from '@crestflow/shared';
import { algodClient } from '../../lib/algorand.js';

const logger = createLogger('execution:simulation');

export interface SimulationResult {
  passed: boolean;
  failedGroupIndex: number | null;
  failureReason: string | null;
  simulatedAt: string;
}

/**
 * Simulate execution of planned steps.
 * Attempts real algod simulation if transaction bytes are provided.
 * Falls back to basic validation checks for MVP (no real txn bytes yet).
 */
export async function simulateExecution(
  stepCount: number,
  txnGroupBytes?: Uint8Array[][],
): Promise<SimulationResult> {
  const simulatedAt = new Date().toISOString();

  // If real transaction bytes are provided, simulate on-chain
  if (txnGroupBytes && txnGroupBytes.length > 0) {
    for (let i = 0; i < txnGroupBytes.length; i++) {
      const group = txnGroupBytes[i];
      if (!group || group.length === 0) continue;

      try {
        // Build simulation request
        const result = await algodClient.simulateRawTransactions(group).do();

        // Check for failure in simulation result
        const txnGroups = result.txnGroups ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupResult = txnGroups[0] as any;

        if (groupResult?.failureMessage) {
          const reason = groupResult.failureMessage;
          logger.warn({ groupIndex: i, reason }, 'simulation failed');
          return {
            passed: false,
            failedGroupIndex: i,
            failureReason: String(reason),
            simulatedAt,
          };
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ groupIndex: i, err: errMsg }, 'simulation error');
        return {
          passed: false,
          failedGroupIndex: i,
          failureReason: `Simulation error: ${errMsg}`,
          simulatedAt,
        };
      }
    }

    logger.info({ groupCount: txnGroupBytes.length }, 'all transaction groups passed simulation');
    return { passed: true, failedGroupIndex: null, failureReason: null, simulatedAt };
  }

  // Fallback: basic validation when no real txn bytes available (MVP mode)
  if (stepCount === 0) {
    return {
      passed: false,
      failedGroupIndex: null,
      failureReason: 'No steps to simulate',
      simulatedAt,
    };
  }

  logger.info({ stepCount }, 'simulation gate passed (basic validation — no txn bytes)');
  return { passed: true, failedGroupIndex: null, failureReason: null, simulatedAt };
}
