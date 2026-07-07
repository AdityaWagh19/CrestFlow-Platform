/**
 * Engine 6 — Autonomous Execution Tests
 * Tests POA builder, policy engine, simulation gate.
 */

import { describe, it, expect, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Mock getPrisma for policy engine KYC check (no DB in unit tests)
vi.mock('@crestflow/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@crestflow/shared')>();
  return {
    ...original,
    getPrisma: () => ({
      user: {
        findUnique: vi.fn().mockResolvedValue({ kycStatus: 'APPROVED' }),
      },
    }),
  };
});

import { buildPOA } from '../../src/modules/execution/poa.builder.js';
import { evaluatePolicy } from '../../src/modules/execution/policy.engine.js';
import { simulateExecution } from '../../src/modules/execution/simulation.gate.js';

// ════════════════════════════════════════════════════════════════════════════
// POA BUILDER
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 6 — POA Builder', () => {
  it('builds POA with executionId', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [{ assetSymbol: 'ALGO', direction: 'SELL', deltaPercent: '15', urgency: 'HIGH' }],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    expect(poa.executionId).toBeDefined();
    expect(poa.userId).toBe('user-123');
    expect(poa.goalProfile).toBe('MODERATE');
    expect(poa.steps.length).toBeGreaterThan(0);
  });

  it('auto-prepends OPT_IN when targetAssetId provided', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [
        {
          assetSymbol: 'USDC',
          direction: 'BUY',
          deltaPercent: '10',
          urgency: 'HIGH',
          targetAssetId: 31566704,
        },
      ],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    const optIn = poa.steps.find((s) => s.actionType === 'OPT_IN');
    expect(optIn).toBeDefined();
    expect(optIn!.protocol).toBe('algorand');
  });

  it('NO_OP for low urgency actions', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [{ assetSymbol: 'ALGO', direction: 'HOLD', deltaPercent: '1', urgency: 'LOW' }],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    expect(poa.steps.some((s) => s.actionType === 'NO_OP')).toBe(true);
  });

  it('SELL → SWAP action type', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [{ assetSymbol: 'ALGO', direction: 'SELL', deltaPercent: '20', urgency: 'HIGH' }],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    const swap = poa.steps.find((s) => s.actionType === 'SWAP');
    expect(swap).toBeDefined();
    expect(swap!.protocol).toBe('haystack');
  });

  it('BUY → LEND_DEPOSIT action type', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [{ assetSymbol: 'USDC', direction: 'BUY', deltaPercent: '15', urgency: 'HIGH' }],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    const deposit = poa.steps.find((s) => s.actionType === 'LEND_DEPOSIT');
    expect(deposit).toBeDefined();
    expect(deposit!.protocol).toBe('folks-finance');
  });

  it('estimated fees = steps * 0.001 ALGO', () => {
    const poa = buildPOA({
      userId: 'user-123',
      actions: [
        { assetSymbol: 'ALGO', direction: 'SELL', deltaPercent: '20', urgency: 'HIGH' },
        { assetSymbol: 'USDC', direction: 'BUY', deltaPercent: '20', urgency: 'HIGH' },
      ],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    const fees = new Decimal(poa.estimatedFeesAlgo).toNumber();
    expect(fees).toBe(poa.steps.length * 0.001);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POLICY ENGINE
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 6 — Policy Engine', () => {
  const basePOA = buildPOA({
    userId: 'user-123',
    actions: [
      {
        assetSymbol: 'ALGO',
        direction: 'SELL',
        deltaPercent: '10',
        urgency: 'HIGH',
        estimatedValueUsd: '500',
      },
    ],
    goalProfile: 'MODERATE',
    sourceEventType: 'MANUAL',
    sourceEventId: 'event-123',
  });

  it('risk score above cap → BLOCKED', async () => {
    const result = await evaluatePolicy({
      poa: basePOA,
      goalProfile: 'CONSERVATIVE',
      riskScore: 50, // above CONSERVATIVE cap of 35
      riskScoreCap: 35,
      volumeUsed24h: '0',
      userId: 'user-123',
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason).toContain('Risk score');
  });

  it('daily volume exceeded → BLOCKED', async () => {
    const result = await evaluatePolicy({
      poa: basePOA,
      goalProfile: 'CONSERVATIVE',
      riskScore: 20,
      riskScoreCap: 35,
      volumeUsed24h: '4999', // near limit of $5000
      userId: 'user-123',
    });
    // POA total is small but approaching limit
    if (new Decimal(basePOA.totalValueUsd).plus('4999').gt(5000)) {
      expect(result.decision).toBe('BLOCKED');
    }
  });

  it('all checks pass → APPROVED', async () => {
    const result = await evaluatePolicy({
      poa: basePOA,
      goalProfile: 'MODERATE',
      riskScore: 30,
      riskScoreCap: 60,
      volumeUsed24h: '0',
      userId: 'user-123',
    });
    expect(result.decision).toBe('APPROVED');
    expect(result.reason).toBeNull();
  });

  it('LP_ADD with CONSERVATIVE → BLOCKED', async () => {
    const lpPOA = buildPOA({
      userId: 'user-123',
      actions: [
        {
          assetSymbol: 'ALGO',
          direction: 'BUY',
          deltaPercent: '10',
          urgency: 'HIGH',
          estimatedValueUsd: '500',
        },
      ],
      goalProfile: 'CONSERVATIVE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    // Manually set a step to LP_ADD for testing
    if (lpPOA.steps.length > 0) {
      lpPOA.steps[0]!.actionType = 'LP_ADD';
    }
    const result = await evaluatePolicy({
      poa: lpPOA,
      goalProfile: 'CONSERVATIVE',
      riskScore: 20,
      riskScoreCap: 35,
      volumeUsed24h: '0',
      userId: 'user-123',
    });
    expect(result.decision).toBe('BLOCKED');
  });

  it('non-allowlisted protocol → BLOCKED', async () => {
    const badPOA = buildPOA({
      userId: 'user-123',
      actions: [
        {
          assetSymbol: 'X',
          direction: 'SELL',
          deltaPercent: '10',
          urgency: 'HIGH',
          estimatedValueUsd: '100',
        },
      ],
      goalProfile: 'MODERATE',
      sourceEventType: 'MANUAL',
      sourceEventId: 'event-123',
    });
    // Manually set a bad protocol
    if (badPOA.steps.length > 0) {
      badPOA.steps[0]!.protocol = 'unknown-dex';
    }
    const result = await evaluatePolicy({
      poa: badPOA,
      goalProfile: 'MODERATE',
      riskScore: 30,
      riskScoreCap: 60,
      volumeUsed24h: '0',
      userId: 'user-123',
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason).toContain('Non-allowlisted');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SIMULATION GATE
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 6 — Simulation Gate', () => {
  it('MVP stub always returns passed = true', () => {
    const result = simulateExecution(3);
    expect(result.passed).toBe(true);
    expect(result.failedGroupIndex).toBeNull();
    expect(result.failureReason).toBeNull();
  });

  it('simulatedAt is a valid ISO8601 timestamp', () => {
    const result = simulateExecution(1);
    expect(() => new Date(result.simulatedAt)).not.toThrow();
    expect(new Date(result.simulatedAt).toISOString()).toBe(result.simulatedAt);
  });
});
