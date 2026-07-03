/**
 * Copilot Service — Orchestrates the full AI copilot query pipeline.
 * classify intent -> assemble context -> build prompt -> call LLM -> parse -> persist
 */

import { createLogger, getPrisma } from '@crestflow/shared';
import { classifyIntent } from './intent.classifier.js';
import { assembleCopilotContext } from './context.assembler.js';
import { buildSystemPrompt } from './prompt.builder.js';
import { completeLLM } from './llm.client.js';
import { parseCopilotResponse } from './response.schema.js';
import type { CopilotResponse } from './response.schema.js';
import type { CopilotIntent } from './intent.classifier.js';
import { CopilotSessionManager } from './session.manager.js';
import type { ConversationTurn } from './session.manager.js';

const logger = createLogger('copilot:service');

interface CopilotQueryResult extends CopilotResponse {
  intent: CopilotIntent;
  model: string;
  fallbackUsed: boolean;
}

export const CopilotService = {
  /**
   * Full copilot pipeline: classify, assemble, prompt, call LLM, parse, persist.
   */
  async query(userId: string, userMessage: string): Promise<CopilotQueryResult> {
    const startTime = Date.now();

    // Step 1: Classify intent
    const intent = classifyIntent(userMessage);
    logger.info({ userId, intent }, 'intent classified');

    // Step 2: Assemble cross-engine context
    const context = await assembleCopilotContext(userId);

    // Step 3: Build system prompt
    const systemPrompt = buildSystemPrompt(context, intent);

    // Step 4: Append conversation history for continuity
    const history = await CopilotSessionManager.getHistory(userId);
    const conversationBlock = formatHistory(history);
    const fullUserMessage = conversationBlock
      ? `${conversationBlock}\n\nCurrent question: ${userMessage}`
      : userMessage;

    // Step 5: Call LLM (with fallback)
    const llmResponse = await completeLLM({
      systemPrompt,
      userMessage: fullUserMessage,
      jsonMode: true,
      maxTokens: 1500,
    });

    // Step 6: Parse and validate response
    const parsed = parseCopilotResponse(llmResponse.content);

    // Step 7: Save to session history
    await CopilotSessionManager.addTurns(userId, userMessage, parsed.answer, intent);

    // Step 8: Log to CopilotQueryLog (fire-and-forget)
    const sessionInfo = await CopilotSessionManager.getSessionInfo(userId);
    const durationMs = Date.now() - startTime;

    logQueryToDb(
      userId,
      userMessage,
      intent,
      parsed,
      llmResponse.model,
      llmResponse.fallbackUsed,
      llmResponse.tokensUsed,
      durationMs,
      sessionInfo.turnCount,
    ).catch((err: unknown) => {
      logger.error({ err, userId }, 'failed to persist copilot query log');
    });

    logger.info(
      {
        userId,
        intent,
        model: llmResponse.model,
        fallbackUsed: llmResponse.fallbackUsed,
        confidence: parsed.confidence,
        durationMs,
      },
      'copilot query complete',
    );

    return {
      ...parsed,
      intent,
      model: llmResponse.model,
      fallbackUsed: llmResponse.fallbackUsed,
    };
  },

  /**
   * Get conversation history and session info for the user.
   */
  async getHistory(
    userId: string,
  ): Promise<{ turns: ConversationTurn[]; turnCount: number; ttl: number }> {
    const [turns, sessionInfo] = await Promise.all([
      CopilotSessionManager.getHistory(userId),
      CopilotSessionManager.getSessionInfo(userId),
    ]);

    return {
      turns,
      turnCount: sessionInfo.turnCount,
      ttl: sessionInfo.ttl,
    };
  },

  /**
   * Reset the user's copilot session.
   */
  async resetSession(userId: string): Promise<void> {
    await CopilotSessionManager.clearSession(userId);
    logger.info({ userId }, 'copilot session reset');
  },
};

/**
 * Format conversation history into a text block for the LLM.
 */
function formatHistory(turns: ConversationTurn[]): string {
  if (turns.length === 0) return '';

  const lines = turns.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`);

  return `## Previous Conversation\n${lines.join('\n')}`;
}

/**
 * Persist the query to the CopilotQueryLog table.
 */
async function logQueryToDb(
  userId: string,
  query: string,
  intent: CopilotIntent,
  response: CopilotResponse,
  model: string,
  fallbackUsed: boolean,
  tokensUsed: number,
  durationMs: number,
  sessionTurn: number,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.copilotQueryLog.create({
    data: {
      userId,
      query,
      intent,
      responseAnswer: response.answer,
      confidence: response.confidence,
      model,
      fallbackUsed,
      tokensUsed,
      durationMs,
      sessionTurn,
    },
  });
}
