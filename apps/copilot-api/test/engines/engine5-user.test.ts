/**
 * Engine 5 — User Intelligence Tests
 * Tests persona classification, drift scoring, intent classification.
 */

import { describe, it, expect } from 'vitest';

import {
  classifyPersona,
  personaToGoalProfile,
  computeDriftScore,
} from '../../src/modules/user/persona.classifier.js';
import { computeRawScore, normalizeScore } from '../../src/modules/user/questionnaire.scorer.js';
import { classifyIntent } from '../../src/modules/copilot/intent.classifier.js';

// ════════════════════════════════════════════════════════════════════════════
// PERSONA CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 5 — Persona Classification', () => {
  it('score 0-19 → CONSERVATIVE', () => {
    expect(classifyPersona(0)).toBe('CONSERVATIVE');
    expect(classifyPersona(19)).toBe('CONSERVATIVE');
  });

  it('score 20-39 → BALANCED', () => {
    expect(classifyPersona(20)).toBe('BALANCED');
    expect(classifyPersona(39)).toBe('BALANCED');
  });

  it('score 40-59 → GROWTH', () => {
    expect(classifyPersona(40)).toBe('GROWTH');
    expect(classifyPersona(59)).toBe('GROWTH');
  });

  it('score 60-79 → AGGRESSIVE', () => {
    expect(classifyPersona(60)).toBe('AGGRESSIVE');
    expect(classifyPersona(79)).toBe('AGGRESSIVE');
  });

  it('score 80-100 → YIELD_SEEKER', () => {
    expect(classifyPersona(80)).toBe('YIELD_SEEKER');
    expect(classifyPersona(100)).toBe('YIELD_SEEKER');
  });

  it('persona → goalProfile mapping', () => {
    expect(personaToGoalProfile('CONSERVATIVE')).toBe('CONSERVATIVE');
    expect(personaToGoalProfile('BALANCED')).toBe('CONSERVATIVE');
    expect(personaToGoalProfile('GROWTH')).toBe('MODERATE');
    expect(personaToGoalProfile('AGGRESSIVE')).toBe('AGGRESSIVE');
    expect(personaToGoalProfile('YIELD_SEEKER')).toBe('AGGRESSIVE');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE SCORING
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 5 — Questionnaire Scoring', () => {
  it('all conservative answers → low score → CONSERVATIVE persona', () => {
    const raw = computeRawScore({ q1: 'a', q2: 'a', q3: 'a', q4: 'a', q5: 'a', q6: 'a', q7: 'a' });
    const normalized = normalizeScore(raw);
    expect(normalized).toBeLessThan(20);
    expect(classifyPersona(normalized)).toBe('CONSERVATIVE');
  });

  it('all aggressive answers → high score → YIELD_SEEKER persona', () => {
    const raw = computeRawScore({ q1: 'd', q2: 'c', q3: 'd', q4: 'd', q5: 'd', q6: 'd', q7: 'c' });
    const normalized = normalizeScore(raw);
    expect(normalized).toBeGreaterThan(70);
  });

  it('normalized score always in [0, 100]', () => {
    // Min possible raw: 10 + (-10) + (-20) + 0 + 10 + 5 + 0 = -5 → clamped to 0
    const minRaw = computeRawScore({
      q1: 'a',
      q2: 'a',
      q3: 'a',
      q4: 'a',
      q5: 'a',
      q6: 'a',
      q7: 'a',
    });
    const minNorm = normalizeScore(minRaw);
    expect(minNorm).toBeGreaterThanOrEqual(0);
    expect(minNorm).toBeLessThanOrEqual(100);

    const maxRaw = computeRawScore({
      q1: 'd',
      q2: 'c',
      q3: 'd',
      q4: 'd',
      q5: 'd',
      q6: 'd',
      q7: 'c',
    });
    const maxNorm = normalizeScore(maxRaw);
    expect(maxNorm).toBeGreaterThanOrEqual(0);
    expect(maxNorm).toBeLessThanOrEqual(100);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL DRIFT SCORING
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 5 — Drift Scoring', () => {
  const now = new Date();
  const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
  const oldDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

  it('empty signals → drift = 0', () => {
    expect(computeDriftScore([])).toBe(0);
  });

  it('ACTED_ON_REBALANCE signals → positive drift', () => {
    const signals = [
      { signalType: 'ACTED_ON_REBALANCE', occurredAt: recentDate },
      { signalType: 'ACTED_ON_REBALANCE', occurredAt: recentDate },
    ];
    const drift = computeDriftScore(signals);
    expect(drift).toBeGreaterThan(0); // +5 per signal
  });

  it('GOAL_DE_ESCALATION → strong negative drift', () => {
    const signals = [{ signalType: 'GOAL_DE_ESCALATION', occurredAt: recentDate }];
    const drift = computeDriftScore(signals);
    expect(drift).toBeLessThan(0); // -15
  });

  it('signals older than 30 days → excluded', () => {
    const signals = [
      { signalType: 'GOAL_ESCALATION', occurredAt: oldDate }, // 45 days ago — excluded
    ];
    const drift = computeDriftScore(signals);
    expect(drift).toBe(0);
  });

  it('mixed signals → weighted sum', () => {
    const signals = [
      { signalType: 'ACTED_ON_REBALANCE', occurredAt: recentDate }, // +5
      { signalType: 'IGNORED_CRITICAL_ALERT', occurredAt: recentDate }, // +10
      { signalType: 'IGNORES_YIELD_SUGGESTIONS', occurredAt: recentDate }, // -8
    ];
    const drift = computeDriftScore(signals);
    expect(drift).toBe(7); // 5 + 10 - 8
  });
});

// ════════════════════════════════════════════════════════════════════════════
// INTENT CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════════

describe('Engine 5 — Intent Classifier', () => {
  it('portfolio keywords → PORTFOLIO_QUERY', () => {
    expect(classifyIntent('What is my portfolio worth?')).toBe('PORTFOLIO_QUERY');
    expect(classifyIntent('show my holdings')).toBe('PORTFOLIO_QUERY');
    expect(classifyIntent('total value')).toBe('PORTFOLIO_QUERY');
  });

  it('risk keywords → RISK_QUERY', () => {
    expect(classifyIntent('What is my risk score?')).toBe('RISK_QUERY');
    expect(classifyIntent('am I close to liquidation?')).toBe('RISK_QUERY');
    expect(classifyIntent('show me volatility data')).toBe('RISK_QUERY');
  });

  it('strategy keywords → STRATEGY_QUERY', () => {
    expect(classifyIntent('should I rebalance now?')).toBe('STRATEGY_QUERY');
    expect(classifyIntent('what does the strategy recommend?')).toBe('STRATEGY_QUERY');
  });

  it('yield keywords → YIELD_QUERY', () => {
    expect(classifyIntent('best APY for ALGO?')).toBe('YIELD_QUERY');
    expect(classifyIntent('where can I earn more?')).toBe('YIELD_QUERY');
    expect(classifyIntent('show me idle capital')).toBe('YIELD_QUERY');
  });

  it('goal change keywords → GOAL_CHANGE', () => {
    expect(classifyIntent('change my goal profile')).toBe('GOAL_CHANGE');
    expect(classifyIntent('update my profile to conservative')).toBe('GOAL_CHANGE');
    expect(classifyIntent('switch to aggressive mode')).toBe('GOAL_CHANGE');
  });

  it('unknown query → GENERAL', () => {
    expect(classifyIntent('hello')).toBe('GENERAL');
    expect(classifyIntent('what is the weather?')).toBe('GENERAL');
  });

  it('case insensitive matching', () => {
    expect(classifyIntent('MY PORTFOLIO VALUE')).toBe('PORTFOLIO_QUERY');
    expect(classifyIntent('RISK SCORE')).toBe('RISK_QUERY');
  });
});
