/**
 * User Controller — Thin HTTP handlers for Engine 5 Part A.
 * No business logic — validate input, delegate to service, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '@crestflow/shared';
import type { GoalProfile } from '@crestflow/shared';
import { UserIntelligenceService } from './user-intelligence.service.js';
import { PERSONA_DESCRIPTIONS } from './questionnaire.scorer.js';
import type { QuestionnaireAnswers } from './questionnaire.scorer.js';

/** Extract userId from authenticated request. */
function getUserId(req: FastifyRequest): string {
  if (!req.userId) throw new UnauthorizedError('Authentication required');
  return req.userId;
}

const VALID_GOAL_PROFILES: GoalProfile[] = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'];

const VALID_Q1 = ['a', 'b', 'c', 'd'];
const VALID_Q2 = ['a', 'b', 'c'];
const VALID_Q3 = ['a', 'b', 'c', 'd'];
const VALID_Q4 = ['a', 'b', 'c', 'd'];
const VALID_Q5 = ['a', 'b', 'c', 'd'];
const VALID_Q6 = ['a', 'b', 'c', 'd'];
const VALID_Q7 = ['a', 'b', 'c'];

export const UserController = {
  async getProfile(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const profile = await UserIntelligenceService.getProfile(userId);

    return reply.send({
      success: true,
      data: {
        investorPersona: profile.investorPersona,
        goalProfile: profile.goalProfile,
        onboardingScore: profile.onboardingScore,
        onboardingCompleted: profile.onboardingCompleted,
        behavioralDriftScore: profile.behavioralDriftScore,
        profileVersion: profile.profileVersion,
        updatedAt: profile.updatedAt,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async updateProfile(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as Record<string, unknown>;
    const goalProfile = body['goalProfile'];

    if (
      typeof goalProfile !== 'string' ||
      !VALID_GOAL_PROFILES.includes(goalProfile as GoalProfile)
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_GOAL_PROFILE',
          message: 'goalProfile must be CONSERVATIVE, MODERATE, or AGGRESSIVE',
          requestId: req.id,
        },
      });
    }

    const profile = await UserIntelligenceService.updateGoalProfile(
      userId,
      goalProfile as GoalProfile,
    );

    return reply.send({
      success: true,
      data: {
        goalProfile: profile.goalProfile,
        investorPersona: profile.investorPersona,
        strategyRecomputeTriggered: true,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },

  async submitOnboarding(req: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(req);
    const body = req.body as Record<string, unknown>;

    const q1 = body['q1'];
    const q2 = body['q2'];
    const q3 = body['q3'];
    const q4 = body['q4'];
    const q5 = body['q5'];
    const q6 = body['q6'];
    const q7 = body['q7'];

    // Validate all 7 answers are present and valid
    if (
      typeof q1 !== 'string' ||
      !VALID_Q1.includes(q1) ||
      typeof q2 !== 'string' ||
      !VALID_Q2.includes(q2) ||
      typeof q3 !== 'string' ||
      !VALID_Q3.includes(q3) ||
      typeof q4 !== 'string' ||
      !VALID_Q4.includes(q4) ||
      typeof q5 !== 'string' ||
      !VALID_Q5.includes(q5) ||
      typeof q6 !== 'string' ||
      !VALID_Q6.includes(q6) ||
      typeof q7 !== 'string' ||
      !VALID_Q7.includes(q7)
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ONBOARDING_ANSWERS',
          message:
            'All 7 questions (q1-q7) must be answered with valid option letters (a/b/c/d as applicable)',
          requestId: req.id,
        },
      });
    }

    const answers: QuestionnaireAnswers = {
      q1: q1 as QuestionnaireAnswers['q1'],
      q2: q2 as QuestionnaireAnswers['q2'],
      q3: q3 as QuestionnaireAnswers['q3'],
      q4: q4 as QuestionnaireAnswers['q4'],
      q5: q5 as QuestionnaireAnswers['q5'],
      q6: q6 as QuestionnaireAnswers['q6'],
      q7: q7 as QuestionnaireAnswers['q7'],
    };

    const profile = await UserIntelligenceService.processOnboarding(userId, answers);
    const persona = profile.investorPersona as string;

    return reply.send({
      success: true,
      data: {
        normalizedScore: profile.onboardingScore,
        investorPersona: profile.investorPersona,
        goalProfile: profile.goalProfile,
        personaDescription: PERSONA_DESCRIPTIONS[persona] ?? '',
        strategyRecomputeTriggered: true,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  },
};
