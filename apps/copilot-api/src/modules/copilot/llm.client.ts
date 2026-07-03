/**
 * LLM Client — Dual-provider completion with automatic fallback.
 * Primary: OpenAI gpt-4.1-mini
 * Fallback: Google Gemini via REST API (avoids @google/generative-ai dependency)
 */

import OpenAI from 'openai';
import { config } from '../../config/env.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('copilot:llm');

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.5-flash';

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  fallbackUsed: boolean;
}

interface CompletionParams {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  maxTokens?: number;
}

/**
 * Attempt OpenAI completion first; fall back to Gemini on 429 or 5xx.
 */
export async function completeLLM(params: CompletionParams): Promise<LLMResponse> {
  const { systemPrompt, userMessage, jsonMode = true, maxTokens = 1500 } = params;

  try {
    return await callOpenAI(systemPrompt, userMessage, jsonMode, maxTokens);
  } catch (err: unknown) {
    if (shouldFallback(err)) {
      logger.warn({ err }, 'OpenAI unavailable — falling back to Gemini');
      return await callGemini(systemPrompt, userMessage, maxTokens);
    }
    throw err;
  }
}

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  jsonMode: boolean,
  maxTokens: number,
): Promise<LLMResponse> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? '',
    model: response.model,
    tokensUsed: response.usage?.total_tokens ?? 0,
    fallbackUsed: false,
  };
}

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<LLMResponse> {
  const url = `${GEMINI_REST_BASE}/models/${GEMINI_MODEL}:generateContent?key=${config.GOOGLE_AI_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${String(response.status)}: ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      totalTokenCount?: number;
    };
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;

  logger.info({ model: GEMINI_MODEL, tokensUsed }, 'Gemini fallback completed');

  return {
    content,
    model: GEMINI_MODEL,
    tokensUsed,
    fallbackUsed: true,
  };
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && 'status' in err) {
    const status = (err as { status: number }).status;
    // 429 = rate limit, 5xx = server errors
    return status === 429 || status >= 500;
  }
  return false;
}
