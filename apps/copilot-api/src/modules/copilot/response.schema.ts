/**
 * Response Schema — Zod validation for copilot LLM responses.
 * Parses raw LLM output into a typed, validated CopilotResponse.
 */

import { z } from 'zod';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('copilot:response');

const DataPointSchema = z.object({
  label: z.string(),
  value: z.string(),
  source: z.string(),
});

export const CopilotResponseSchema = z.object({
  answer: z.string().min(1).max(2000),
  dataPoints: z.array(DataPointSchema).default([]),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  disclaimer: z.string(),
  followUpQuestions: z.array(z.string()).min(1).max(3),
});

export type CopilotResponse = z.infer<typeof CopilotResponseSchema>;

const FALLBACK_RESPONSE: CopilotResponse = {
  answer:
    'I was unable to process your request properly. Please try rephrasing your question or try again shortly.',
  dataPoints: [],
  confidence: 'LOW',
  disclaimer:
    'This response was generated as a fallback due to a processing error. It is not financial advice.',
  followUpQuestions: ['Can you rephrase your question?'],
};

/**
 * Parse raw LLM JSON output into a validated CopilotResponse.
 * Returns a safe fallback if parsing or validation fails.
 */
export function parseCopilotResponse(raw: string): CopilotResponse {
  try {
    const parsed: unknown = JSON.parse(raw);
    return CopilotResponseSchema.parse(parsed);
  } catch (err: unknown) {
    logger.warn(
      { err, rawLength: raw.length },
      'failed to parse copilot response — using fallback',
    );
    return FALLBACK_RESPONSE;
  }
}
