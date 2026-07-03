/**
 * Session Manager — Redis-backed conversation history for the copilot.
 * Maintains up to 10 turn pairs per user with a 30-minute sliding TTL.
 */

import { redis } from '../../lib/redis.js';
import type { CopilotIntent } from './intent.classifier.js';

const SESSION_PREFIX = 'crestflow:copilot:session:';
const MAX_TURN_PAIRS = 10;
const TTL_SECONDS = 1800; // 30 minutes

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  intent?: CopilotIntent;
  timestamp: string;
}

function sessionKey(userId: string): string {
  return `${SESSION_PREFIX}${userId}`;
}

export const CopilotSessionManager = {
  /**
   * Retrieve the conversation history for a user.
   */
  async getHistory(userId: string): Promise<ConversationTurn[]> {
    const raw = await redis.get(sessionKey(userId));
    if (!raw) return [];

    try {
      return JSON.parse(raw) as ConversationTurn[];
    } catch {
      return [];
    }
  },

  /**
   * Append a user+assistant turn pair, trim to MAX_TURN_PAIRS, and refresh TTL.
   */
  async addTurns(
    userId: string,
    userMsg: string,
    response: string,
    intent: CopilotIntent,
  ): Promise<void> {
    const history = await CopilotSessionManager.getHistory(userId);
    const now = new Date().toISOString();

    history.push(
      { role: 'user', content: userMsg, intent, timestamp: now },
      { role: 'assistant', content: response, timestamp: now },
    );

    // Trim to the most recent MAX_TURN_PAIRS (each pair = 2 entries)
    const maxEntries = MAX_TURN_PAIRS * 2;
    const trimmed = history.length > maxEntries ? history.slice(-maxEntries) : history;

    await redis.setex(sessionKey(userId), TTL_SECONDS, JSON.stringify(trimmed));
  },

  /**
   * Clear the entire session for a user.
   */
  async clearSession(userId: string): Promise<void> {
    await redis.del(sessionKey(userId));
  },

  /**
   * Get session metadata: current turn count and remaining TTL.
   */
  async getSessionInfo(userId: string): Promise<{ turnCount: number; ttl: number }> {
    const key = sessionKey(userId);
    const [raw, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);

    if (!raw) return { turnCount: 0, ttl: 0 };

    try {
      const history = JSON.parse(raw) as ConversationTurn[];
      // Each turn pair = 2 entries, so turn count = entries / 2
      return { turnCount: Math.floor(history.length / 2), ttl: Math.max(ttl, 0) };
    } catch {
      return { turnCount: 0, ttl: 0 };
    }
  },
};
