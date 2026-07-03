/**
 * Questionnaire Scorer — Maps onboarding answers to weighted scores.
 * Rule-based scoring: deterministic, transparent, zero training data.
 *
 * Total raw score range: -5 to 215.
 * Normalized to 0-100 for persona classification.
 */

/** Answer option letters per question. */
type Q1Answer = 'a' | 'b' | 'c' | 'd';
type Q2Answer = 'a' | 'b' | 'c';
type Q3Answer = 'a' | 'b' | 'c' | 'd';
type Q4Answer = 'a' | 'b' | 'c' | 'd';
type Q5Answer = 'a' | 'b' | 'c' | 'd';
type Q6Answer = 'a' | 'b' | 'c' | 'd';
type Q7Answer = 'a' | 'b' | 'c';

export interface QuestionnaireAnswers {
  q1: Q1Answer;
  q2: Q2Answer;
  q3: Q3Answer;
  q4: Q4Answer;
  q5: Q5Answer;
  q6: Q6Answer;
  q7: Q7Answer;
}

/** Score lookup per question and answer option. */
const SCORE_MAP: Record<string, Record<string, number>> = {
  q1: { a: 10, b: 30, c: 50, d: 70 },
  q2: { a: -10, b: 10, c: 30 },
  q3: { a: -20, b: 0, c: 20, d: 40 },
  q4: { a: 0, b: 10, c: 20, d: 30 },
  q5: { a: 10, b: 20, c: 35, d: 50 },
  q6: { a: 5, b: 15, c: 30, d: 50 },
  q7: { a: 0, b: 15, c: 25 },
};

/** Maximum possible raw score (all highest-scoring answers). */
const MAX_RAW_SCORE = 215;

/**
 * Sum individual question scores from the answers map.
 */
export function computeRawScore(answers: QuestionnaireAnswers): number {
  const keys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
  let total = 0;
  for (const key of keys) {
    const answer = answers[key];
    const questionScores = SCORE_MAP[key];
    if (questionScores) {
      total += questionScores[answer] ?? 0;
    }
  }
  return total;
}

/**
 * Normalize raw score to 0-100 range.
 * Clamps negative raw scores to 0 and scores above MAX_RAW_SCORE to 100.
 */
export function normalizeScore(rawScore: number): number {
  if (rawScore <= 0) return 0;
  if (rawScore >= MAX_RAW_SCORE) return 100;
  return Math.round((rawScore / MAX_RAW_SCORE) * 100);
}

/** One-sentence description per investor persona. */
export const PERSONA_DESCRIPTIONS: Record<string, string> = {
  CONSERVATIVE:
    'Capital preservation is your priority — you prefer lending-only strategies with stablecoin focus and minimal volatility exposure.',
  BALANCED:
    'You seek steady, modest growth through a balanced mix of stable lending and conservative LP positions.',
  GROWTH:
    'You are a growth-oriented investor comfortable with moderate DeFi risk, balancing lending and select LP opportunities.',
  AGGRESSIVE:
    'You pursue high-risk, high-return strategies across all opportunity types and tolerate significant portfolio volatility.',
  YIELD_SEEKER:
    'Maximum yield is your goal — you actively seek aggressive LP and lending positions and accept elevated risk.',
};
