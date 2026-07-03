/**
 * User Intelligence Service — Engine 5 Part A.
 * Manages onboarding, persona classification, goal profile updates,
 * and behavioral signal accumulation.
 */

import { createLogger, getPrisma } from '@crestflow/shared';
import type { GoalProfile, BehavioralSignalType } from '@crestflow/shared';
import { eventBus } from '../../lib/event-bus.js';
import { computeRawScore, normalizeScore } from './questionnaire.scorer.js';
import type { QuestionnaireAnswers } from './questionnaire.scorer.js';
import { classifyPersona, personaToGoalProfile, computeDriftScore } from './persona.classifier.js';

const logger = createLogger('user-intelligence:service');

export const UserIntelligenceEvents = {
  ONBOARDING_COMPLETED: 'OnboardingCompleted',
  GOAL_PROFILE_CHANGED: 'GoalProfileChanged',
  DRIFT_THRESHOLD_EXCEEDED: 'DriftThresholdExceeded',
} as const;

export const UserIntelligenceService = {
  /**
   * Process onboarding questionnaire answers.
   * Computes raw score -> normalized score -> persona -> goalProfile.
   * Creates or updates UserProfile.
   */
  async processOnboarding(userId: string, answers: QuestionnaireAnswers) {
    const prisma = getPrisma();
    const rawScore = computeRawScore(answers);
    const normalized = normalizeScore(rawScore);
    const persona = classifyPersona(normalized);
    const goalProfile = personaToGoalProfile(persona);

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        investorPersona: persona,
        goalProfile,
        onboardingScore: normalized,
        onboardingAnswers: answers as unknown as Record<string, unknown>,
        behavioralDriftScore: 0,
        onboardingCompleted: true,
        profileVersion: 1,
      },
      update: {
        investorPersona: persona,
        goalProfile,
        onboardingScore: normalized,
        onboardingAnswers: answers as unknown as Record<string, unknown>,
        onboardingCompleted: true,
        profileVersion: { increment: 1 },
      },
    });

    logger.info(
      { userId, persona, goalProfile, normalizedScore: normalized },
      'onboarding completed',
    );

    eventBus.emit(UserIntelligenceEvents.ONBOARDING_COMPLETED, {
      userId,
      persona,
      goalProfile,
      normalizedScore: normalized,
      timestamp: new Date().toISOString(),
    });

    return profile;
  },

  /**
   * Retrieve the user's profile. Creates a default if none exists.
   */
  async getProfile(userId: string) {
    const prisma = getPrisma();

    let profile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId,
          investorPersona: 'BALANCED',
          goalProfile: 'MODERATE',
          behavioralDriftScore: 0,
          onboardingCompleted: false,
          profileVersion: 1,
        },
      });
      logger.info({ userId }, 'created default user profile');
    }

    return profile;
  },

  /**
   * Update goal profile directly (user explicitly chose a new profile).
   * Resets drift score and emits GoalProfileChanged event.
   */
  async updateGoalProfile(userId: string, goalProfile: GoalProfile) {
    const prisma = getPrisma();

    const profile = await prisma.userProfile.update({
      where: { userId },
      data: {
        goalProfile,
        behavioralDriftScore: 0,
        profileVersion: { increment: 1 },
      },
    });

    logger.info({ userId, goalProfile }, 'goal profile updated');

    eventBus.emit(UserIntelligenceEvents.GOAL_PROFILE_CHANGED, {
      userId,
      goalProfile,
      timestamp: new Date().toISOString(),
    });

    return profile;
  },

  /**
   * Record a behavioral signal and recompute the drift score.
   * Called by event listeners across all engines.
   */
  async recordSignal(userId: string, signalType: BehavioralSignalType) {
    const prisma = getPrisma();

    await prisma.behavioralSignal.create({
      data: { userId, signalType, occurredAt: new Date() },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSignals = await prisma.behavioralSignal.findMany({
      where: { userId, occurredAt: { gte: thirtyDaysAgo } },
      select: { signalType: true, occurredAt: true },
    });

    const driftScore = computeDriftScore(recentSignals);

    await prisma.userProfile.update({
      where: { userId },
      data: { behavioralDriftScore: driftScore },
    });

    logger.info({ userId, signalType, driftScore }, 'behavioral signal recorded');

    if (Math.abs(driftScore) >= 25) {
      eventBus.emit(UserIntelligenceEvents.DRIFT_THRESHOLD_EXCEEDED, {
        userId,
        driftScore,
        direction: driftScore > 0 ? 'MORE_AGGRESSIVE' : 'MORE_CONSERVATIVE',
        timestamp: new Date().toISOString(),
      });
      logger.warn({ userId, driftScore }, 'drift threshold exceeded');
    }
  },
};
