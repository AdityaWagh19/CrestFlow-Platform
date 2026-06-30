# Plan 07 — Engine 5: User Intelligence

**Status:** Approved
**Priority:** P0
**Depends on:**
- Plan 01 (Auth + Turnkey — `User` table, JWT, userId available)
- Plan 03 (Engine 1 — portfolio snapshot context)
- Plan 04 (Engine 2 — risk score context)
- Plan 05 (Engine 3 — strategy context, goalProfile enum)
- Plan 06 (Engine 4 — yield context)

**Feeds into:**
- Engine 3 (consumes `goalProfile` + `investorPersona` for TOPSIS weights and allocation constraints)
- Engine 4 (consumes `goalProfile` for opportunity filtering and TOPSIS weights)
- Engine 6 (consumes `riskTolerance` for execution guardrails)

---

## Objective

Engine 5 is the personalization and reasoning layer of CrestFlow. It does two distinct things:

### Part A — User Intelligence
Builds and maintains a persistent **investor persona** and **dynamic risk profile** for each user. This profile is assembled from:
- **Stated preferences** — onboarding questionnaire answers (explicit goals, risk appetite, DeFi experience)
- **Revealed preferences** — behavioral signals observed across Engines 1–4 (did the user act on a HIGH urgency rebalance? Did they dismiss idle capital suggestions?)

The output (`goalProfile`, `investorPersona`) is consumed directly by Engines 3 and 4 to personalize every recommendation.

### Part B — AI Copilot
A natural language interface that lets users ask questions about their portfolio in plain English. The Copilot:
- Classifies the user's intent and routes to the correct engine for data
- Assembles a structured context block from all 4 engines
- Calls the LLM with grounded context (no RAG, no vector DB — data fits in-context)
- Returns a typed, structured response with confidence level and mandatory disclaimer
- Maintains multi-turn session state (last 10 turns, Redis-backed)
- Streams tokens as they arrive (SSE)

---

## Architecture Decisions

### LLM Stack
- **Primary:** `gpt-4.1-mini` (OpenAI) — fast, cheap, native JSON mode, strong instruction following
- **Fallback:** `gemini-3.5-flash` (Google) — triggered on OpenAI 429/5xx; transparent to user
- **Packages:** `openai` (primary), `@google/generative-ai` (fallback)

### Why in-context grounding (not RAG)
RAG (vector DB + embeddings + chunking) solves the problem of "how do I give an LLM access to a large corpus of documents?" CrestFlow's data is not a large corpus — it is a small, structured JSON snapshot assembled fresh from the database on every request. The entire context (user profile + portfolio + risk + strategy + yield) fits in ~2,000–3,000 tokens — well within `gpt-4.1-mini`'s 128K context window. RAG adds infrastructure complexity (Pinecone/Weaviate, embedding pipeline, chunking strategy) with zero benefit at this scale.

### Why rule-based persona scoring (not ML clustering)
ML clustering (K-Means, HDBSCAN) requires a meaningful training dataset. At launch, CrestFlow has no existing user base to cluster. A rule-based weighted scoring system applied to questionnaire answers produces the exact same 5-persona output with full transparency, zero training data, and deterministic behaviour. ML clustering is a natural P2 upgrade once >500 users have sufficient history.

### Why sliding window session (not full conversation history)
Storing and injecting the full conversation history grows context linearly with session length. A 10-turn sliding window captures all relevant follow-up context without token bloat. Critical facts (user name, goalProfile, current portfolio value) are pinned at the start of every prompt via the context block — never lost regardless of window truncation.

---

## Part A: User Intelligence

### Onboarding Questionnaire (7 questions, 1–2 min)

Asked once on first login after portfolio scan completes. Answers stored in `UserProfile`. Can be re-answered at any time.

```
Q1. What is your primary investment goal?
    a) Preserve my capital (low risk)           → score: 10
    b) Steady growth with moderate risk         → score: 30
    c) Maximize yield, comfortable with risk    → score: 50
    d) Aggressive growth, high risk tolerance   → score: 70

Q2. How long do you plan to stay invested?
    a) Less than 6 months (short-term)          → score: -10
    b) 6 months to 2 years (medium-term)        → score: 10
    c) 2+ years (long-term)                     → score: 30

Q3. How do you react to a sudden 20% drop in your portfolio value?
    a) Sell everything immediately              → score: -20
    b) Worry, but hold and wait                 → score: 0
    c) Hold confidently — it will recover       → score: 20
    d) Buy more — good opportunity              → score: 40

Q4. How familiar are you with DeFi protocols?
    a) Complete beginner — never used DeFi      → score: 0
    b) Some experience — used 1–2 protocols     → score: 10
    c) Experienced — regularly use DeFi        → score: 20
    d) Expert — understand risk models          → score: 30

Q5. What is your annual yield target?
    a) 3–5% (close to risk-free rate)           → score: 10
    b) 5–10% (moderate risk, moderate return)   → score: 20
    c) 10–20% (higher risk, higher return)      → score: 35
    d) 20%+ (maximum yield, maximum risk)       → score: 50

Q6. What portion of your portfolio are you comfortable holding in volatile assets?
    a) Less than 20%                            → score: 5
    b) 20–40%                                   → score: 15
    c) 40–65%                                   → score: 30
    d) 65%+                                     → score: 50

Q7. How do you feel about lending positions (supplying assets to earn interest)?
    a) Uncomfortable — prefer to hold           → score: 0
    b) Fine with established protocols          → score: 15
    c) Actively want to maximize lending yield  → score: 25
```

**Total score range:** 0–215 (raw). Normalized to 0–100.

---

### Persona Classification (Rule-Based Weighted Scoring)

```typescript
// Score thresholds (normalized 0–100)
function classifyPersona(normalizedScore: number): InvestorPersona {
  if (normalizedScore < 20)  return 'CONSERVATIVE';    // Capital preservation
  if (normalizedScore < 40)  return 'BALANCED';        // Steady growth
  if (normalizedScore < 60)  return 'GROWTH';          // Growth-oriented
  if (normalizedScore < 80)  return 'AGGRESSIVE';      // High-risk, high-return
  return 'YIELD_SEEKER';                               // Maximum yield focus
}

// Map persona to Engine 3/4 goalProfile
function personaToGoalProfile(persona: InvestorPersona): GoalProfile {
  return {
    CONSERVATIVE: 'CONSERVATIVE',
    BALANCED:     'CONSERVATIVE', // slightly conservative side of MODERATE
    GROWTH:       'MODERATE',
    AGGRESSIVE:   'AGGRESSIVE',
    YIELD_SEEKER: 'AGGRESSIVE',
  }[persona];
}
```

**5 Investor Personas:**

| Persona | Score | Risk Cap | Volatile % | Description |
|---|---|---|---|---|
| CONSERVATIVE | 0–19 | 35 | ≤25% | Capital preservation. Lending-only. Stablecoins preferred |
| BALANCED | 20–39 | 45 | ≤40% | Modest growth. Stable LP + lending mix |
| GROWTH | 40–59 | 60 | ≤55% | Growth-oriented. Full lending + select LP |
| AGGRESSIVE | 60–79 | 75 | ≤75% | High-risk. All opportunity types |
| YIELD_SEEKER | 80–100 | 85 | ≤85% | Maximum yield. Aggressive LP + lending |

---

### Dynamic Risk Profile — Behavioral Signal Accumulation

Engine 5 listens to events emitted by other engines and accumulates behavioral signals to detect **profile drift** — when the user's revealed preferences diverge from their stated preferences.

**Signal sources:**

| Event | Signal | Direction |
|---|---|---|
| User accepts CRITICAL urgency rebalance immediately | `ACTED_ON_REBALANCE` | More decisive than stated |
| User dismisses CRITICAL alert and holds | `IGNORED_CRITICAL_ALERT` | More risk-tolerant than stated |
| User dismissed 3+ idle capital suggestions | `IGNORES_YIELD_SUGGESTIONS` | Less yield-seeking than stated |
| User manually refreshes strategy 5+ times/week | `HIGH_ENGAGEMENT` | More active than stated |
| User changed goalProfile to more aggressive | `GOAL_ESCALATION` | More aggressive |
| User changed goalProfile to more conservative | `GOAL_DE_ESCALATION` | More conservative |
| Portfolio risk score stayed HIGH 7+ consecutive days, no action | `RISK_INACTION` | Higher real risk tolerance than stated |

**Signal accumulation — weighted drift score:**

```typescript
// Behavioral drift score: positive = more aggressive than stated, negative = more conservative
function computeDriftScore(signals: BehavioralSignal[]): number {
  const weights: Record<string, number> = {
    ACTED_ON_REBALANCE:       +5,
    IGNORED_CRITICAL_ALERT:   +10,
    IGNORES_YIELD_SUGGESTIONS:-8,
    HIGH_ENGAGEMENT:           +3,
    GOAL_ESCALATION:           +15,
    GOAL_DE_ESCALATION:        -15,
    RISK_INACTION:             +8,
  };

  const recent = signals.filter(s =>
    Date.now() - s.occurredAt.getTime() < 30 * 24 * 60 * 60 * 1000 // last 30 days
  );

  return recent.reduce((sum, s) => sum + (weights[s.signalType] ?? 0), 0);
}
```

**Drift action thresholds:**
- `driftScore >= +25` → Surface profile update prompt: "Based on your activity, you seem more comfortable with risk than your BALANCED profile. Would you like to update to GROWTH?"
- `driftScore <= -25` → Surface profile update prompt: "You've been more cautious than your AGGRESSIVE profile suggests. Would you like to switch to GROWTH?"
- No automatic changes — user must confirm all profile updates

---

## Part B: AI Copilot

### Context Assembly (grounding without RAG)

Before every LLM call, Engine 5 assembles a `CopilotContext` object from the latest DB snapshots. This is the ground truth injected into every prompt.

**File:** `copilot/context.assembler.ts`

```typescript
import { PrismaClient } from '@prisma/client';

export interface CopilotContext {
  user: {
    name: string;
    algorandAddress: string;
    investorPersona: string;
    goalProfile: string;
    driftScore: number;
  };
  portfolio: {
    totalValueUsd: string;
    changePercent24h: string;
    healthScore: number;
    topPositions: Array<{ symbol: string; valueUsd: string; protocol: string }>;
    isPartial: boolean;
    snapshotAt: string;
  } | null;
  risk: {
    riskScore: number;
    riskLevel: string;
    cvar95Percent: string | null;
    sortinoRatio: string | null;
    activeAlerts: Array<{ severity: string; title: string }>;
    insufficientHistory: boolean;
  } | null;
  strategy: {
    model: string;
    goalProfile: string;
    defensiveMode: boolean;
    rebalanceRequired: boolean;
    topActions: Array<{ assetSymbol: string; direction: string; urgency: string; deltaPercent: string }>;
    computedAt: string;
  } | null;
  yield: {
    topOpportunity: { protocol: string; assetSymbol: string; netApyPercent: string } | null;
    totalIdleCostUsdPerYear: string;
    baselineApyPercent: string;
    idleSignalCount: number;
  } | null;
  assembledAt: string;
}

/**
 * Assembles all engine snapshot data into a single grounding context object.
 * Fetches latest snapshot per domain — all queries run in parallel.
 * Returns null fields for any domain where no snapshot exists yet.
 */
export async function assembleCopilotContext(
  userId: string,
  prisma: PrismaClient,
): Promise<CopilotContext> {
  const [userProfile, portfolioSnap, riskSnap, strategySnap, yieldSnaps, idleSignals] =
    await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.portfolioSnapshot.findFirst({
        where: { userId },
        orderBy: { snapshotAt: 'desc' },
        select: { totalValueUsd: true, changePercent: true, healthScore: true, isPartial: true, snapshotAt: true, assetHoldings: true },
      }),
      prisma.riskSnapshot.findFirst({
        where: { userId },
        orderBy: { analyzedAt: 'desc' },
        select: { riskScore: true, riskLevel: true, cvar95Percent: true, sortinoRatio: true, insufficientHistory: true },
      }),
      prisma.strategySnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { model: true, goalProfile: true, defensiveMode: true, rebalanceRequired: true, rebalancingActions: true, createdAt: true },
      }),
      prisma.yieldOpportunitySnapshot.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { topsisRank: 'asc' }],
        take: 3,
        distinct: ['protocol', 'assetSymbol'],
        select: { protocol: true, assetSymbol: true, netApyPercent: true },
      }),
      prisma.idleCapitalSignal.aggregate({
        where: { userId, resolved: false },
        _sum: { opportunityCostUsdPerYear: true },  // Note: Prisma can't aggregate DECIMAL string — handled in service
        _count: true,
      }),
      prisma.riskAlert.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: [{ severity: 'asc' }],
        take: 3,
        select: { severity: true, title: true },
      }),
    ]);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, algorandAddress: true } });

  return {
    user: {
      name: user?.name ?? 'User',
      algorandAddress: user?.algorandAddress ?? '',
      investorPersona: userProfile?.investorPersona ?? 'BALANCED',
      goalProfile: userProfile?.goalProfile ?? 'MODERATE',
      driftScore: userProfile?.behavioralDriftScore ?? 0,
    },
    portfolio: portfolioSnap ? {
      totalValueUsd: portfolioSnap.totalValueUsd,
      changePercent24h: portfolioSnap.changePercent ?? '0',
      healthScore: portfolioSnap.healthScore,
      topPositions: (portfolioSnap.assetHoldings as any[]).slice(0, 3).map(h => ({
        symbol: h.symbol, valueUsd: h.valueUsd, protocol: h.protocol ?? 'wallet',
      })),
      isPartial: portfolioSnap.isPartial,
      snapshotAt: portfolioSnap.snapshotAt.toISOString(),
    } : null,
    risk: riskSnap ? {
      riskScore: riskSnap.riskScore,
      riskLevel: riskSnap.riskLevel,
      cvar95Percent: riskSnap.cvar95Percent,
      sortinoRatio: riskSnap.sortinoRatio,
      activeAlerts: [], // populated from separate riskAlert query
      insufficientHistory: riskSnap.insufficientHistory,
    } : null,
    strategy: strategySnap ? {
      model: strategySnap.model,
      goalProfile: strategySnap.goalProfile,
      defensiveMode: strategySnap.defensiveMode,
      rebalanceRequired: strategySnap.rebalanceRequired,
      topActions: ((strategySnap.rebalancingActions as any[]) ?? []).slice(0, 3).map(a => ({
        assetSymbol: a.assetSymbol,
        direction: a.direction,
        urgency: a.urgency,
        deltaPercent: a.deltaPercent,
      })),
      computedAt: strategySnap.createdAt.toISOString(),
    } : null,
    yield: {
      topOpportunity: yieldSnaps[0] ? {
        protocol: yieldSnaps[0].protocol,
        assetSymbol: yieldSnaps[0].assetSymbol,
        netApyPercent: yieldSnaps[0].netApyPercent,
      } : null,
      totalIdleCostUsdPerYear: '0', // computed from idle signals in service
      baselineApyPercent: '0',      // from latest USDC Folks lending snapshot
      idleSignalCount: idleSignals._count,
    },
    assembledAt: new Date().toISOString(),
  };
}
```

---

### Intent Classifier

**File:** `copilot/intent.classifier.ts`

```typescript
export type CopilotIntent =
  | 'PORTFOLIO_QUERY'
  | 'RISK_QUERY'
  | 'STRATEGY_QUERY'
  | 'YIELD_QUERY'
  | 'GOAL_CHANGE'
  | 'GENERAL';

/**
 * Lightweight keyword-first intent classifier.
 * Falls back to LLM one-shot classification for ambiguous queries.
 * Deterministic keywords handle 80%+ of queries without an LLM call.
 */
export function classifyIntent(query: string): CopilotIntent {
  const q = query.toLowerCase();

  // PORTFOLIO_QUERY — most specific, check first
  if (/portfolio|total value|worth|holdings|positions|performance|pnl|return|balance|assets/.test(q)) {
    return 'PORTFOLIO_QUERY';
  }

  // RISK_QUERY
  if (/risk|liquidat|cvar|sortino|drawdown|safe|danger|health factor|volatil/.test(q)) {
    return 'RISK_QUERY';
  }

  // STRATEGY_QUERY
  if (/strateg|rebalanc|allocat|target|model|hrp|optimizer|diversif/.test(q)) {
    return 'STRATEGY_QUERY';
  }

  // YIELD_QUERY
  if (/yield|apy|apr|earn|opportunit|idle|lending|lp|liquidity pool|interest|farm/.test(q)) {
    return 'YIELD_QUERY';
  }

  // GOAL_CHANGE
  if (/goal|profile|conservative|moderate|aggressive|change my|update my|switch to|risk tolerance/.test(q)) {
    return 'GOAL_CHANGE';
  }

  return 'GENERAL';
}

/**
 * For ambiguous queries that don't match keywords, use a cheap LLM call
 * with few-shot examples to classify intent.
 */
export async function classifyIntentWithLLM(
  query: string,
  llmClient: LLMClient,
): Promise<CopilotIntent> {
  const prompt = `Classify this user query into exactly one of these intents:
PORTFOLIO_QUERY, RISK_QUERY, STRATEGY_QUERY, YIELD_QUERY, GOAL_CHANGE, GENERAL

Examples:
"What's my portfolio doing?" → PORTFOLIO_QUERY
"Am I close to getting liquidated?" → RISK_QUERY
"Should I rebalance now?" → STRATEGY_QUERY
"What's the best APY for ALGO?" → YIELD_QUERY
"I want to be more aggressive" → GOAL_CHANGE
"How does DeFi work?" → GENERAL

Query: "${query}"
Respond with only the intent label, nothing else.`;

  const response = await llmClient.complete({ prompt, maxTokens: 10 });
  const text = response.trim().toUpperCase();

  const valid: CopilotIntent[] = ['PORTFOLIO_QUERY', 'RISK_QUERY', 'STRATEGY_QUERY', 'YIELD_QUERY', 'GOAL_CHANGE', 'GENERAL'];
  return valid.includes(text as CopilotIntent) ? (text as CopilotIntent) : 'GENERAL';
}
```

---

### LLM Client (Primary: GPT-4.1-mini, Fallback: Gemini-3.5-flash)

**File:** `copilot/llm.client.ts`

```typescript
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  fallbackUsed: boolean;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PRIMARY_MODEL = 'gpt-4.1-mini';
const FALLBACK_MODEL = 'gemini-3.5-flash';

/**
 * LLM client with automatic fallback.
 * Primary: gpt-4.1-mini (OpenAI)
 * Fallback: gemini-3.5-flash (Google) — triggered on 429 / 5xx / timeout
 */
export async function completeLLM(params: {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<LLMResponse> {
  try {
    return await callOpenAI(params);
  } catch (err: any) {
    const isRetryable = err?.status === 429 || err?.status >= 500 || err?.code === 'ECONNRESET';
    if (!isRetryable) throw err;

    logger.warn({ module: 'copilot', event: 'llm_fallback', reason: err?.message }, 'OpenAI unavailable — switching to Gemini 3.5 Flash');
    return await callGemini({ ...params, fallbackUsed: true });
  }
}

async function callOpenAI(params: {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<LLMResponse> {
  const completion = await openai.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user',   content: params.userMessage },
    ],
    response_format: params.jsonMode ? { type: 'json_object' } : { type: 'text' },
    max_tokens: params.maxTokens ?? 1024,
    temperature: 0.2, // low temperature for consistent, factual financial responses
  });

  return {
    content: completion.choices[0].message.content ?? '',
    model: PRIMARY_MODEL,
    tokensUsed: completion.usage?.total_tokens ?? 0,
    fallbackUsed: false,
  };
}

async function callGemini(params: {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  maxTokens?: number;
  fallbackUsed?: boolean;
}): Promise<LLMResponse> {
  const model = gemini.getGenerativeModel({
    model: FALLBACK_MODEL,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 1024,
      temperature: 0.2,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const result = await model.generateContent(
    `${params.systemPrompt}\n\n${params.userMessage}`
  );

  return {
    content: result.response.text(),
    model: FALLBACK_MODEL,
    tokensUsed: result.response.usageMetadata?.totalTokenCount ?? 0,
    fallbackUsed: true,
  };
}

/**
 * Streaming variant — yields token chunks for SSE response.
 * Fallback does not stream (Gemini streaming handled separately if needed).
 */
export async function* streamLLM(params: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): AsyncGenerator<LLMStreamChunk> {
  try {
    const stream = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user',   content: params.userMessage },
      ],
      stream: true,
      max_tokens: params.maxTokens ?? 1024,
      temperature: 0.2,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      const done = chunk.choices[0]?.finish_reason === 'stop';
      if (delta) yield { delta, done: false };
      if (done) { yield { delta: '', done: true }; return; }
    }
  } catch (err: any) {
    const isRetryable = err?.status === 429 || err?.status >= 500;
    if (!isRetryable) throw err;

    // Fallback: non-streaming Gemini, yield as single chunk
    logger.warn({ module: 'copilot', event: 'stream_fallback' }, 'Stream fallback to Gemini');
    const result = await callGemini(params);
    yield { delta: result.content, done: false };
    yield { delta: '', done: true };
  }
}
```

---

### System Prompt Builder

**File:** `copilot/prompt.builder.ts`

```typescript
import { CopilotContext } from './context.assembler';
import { CopilotIntent } from './intent.classifier';

/**
 * Builds the system prompt for the copilot LLM.
 *
 * Design principles:
 * 1. Persona + role defined first
 * 2. Hard guardrails (NEVER list) — non-negotiable
 * 3. Structured output schema enforced
 * 4. Context data injected in delimited block
 * 5. Intent-specific instructions appended last
 */
export function buildSystemPrompt(
  context: CopilotContext,
  intent: CopilotIntent,
): string {
  const contextBlock = JSON.stringify(context, null, 2);

  const base = `
You are CrestFlow Copilot — a precise, data-grounded DeFi portfolio assistant.
Your user is ${context.user.name}, an Algorand-native DeFi investor with a ${context.user.investorPersona} investor persona and ${context.user.goalProfile} goal profile.

## NEVER DO (HARD GUARDRAILS)
- NEVER recommend specific buy or sell actions as definitive advice
- NEVER make yield guarantees or promise specific returns
- NEVER invent numbers, percentages, or protocol names not present in the context
- NEVER omit the financial disclaimer from your response
- NEVER answer questions about assets or protocols outside Algorand DeFi unless asked generally
- NEVER expose raw UUIDs, database IDs, or internal field names in your answer

## ALWAYS DO
- Ground every factual claim in the context block below
- If data is missing or null in context, say "I don't have that data yet — try refreshing your portfolio"
- Include a confidence level: HIGH (data direct from context), MEDIUM (derived inference), LOW (general reasoning)
- End every response with the standard disclaimer
- Suggest 1–3 relevant follow-up questions the user might want to ask

## OUTPUT FORMAT (JSON — strict)
Respond ONLY with a valid JSON object matching this schema:
{
  "answer": "string — plain English, 2–5 sentences, no markdown",
  "dataPoints": [{ "label": "string", "value": "string", "source": "string" }],
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "disclaimer": "string — always include",
  "followUpQuestions": ["string", "string", "string"]
}

## STANDARD DISCLAIMER
"CrestFlow provides data-driven insights for informational purposes only. This is not financial advice. DeFi investments carry significant risks including smart contract vulnerabilities, impermanent loss, and market volatility. Always conduct your own research before making financial decisions."

## CURRENT CONTEXT (ground truth — use this, do not invent)
<context>
${contextBlock}
</context>

${getIntentInstructions(intent)}
`.trim();

  return base;
}

function getIntentInstructions(intent: CopilotIntent): string {
  const instructions: Record<CopilotIntent, string> = {
    PORTFOLIO_QUERY: `
## TASK: Portfolio Query
Answer questions about the user's portfolio. Use portfolio.totalValueUsd, portfolio.healthScore, and portfolio.topPositions from context.
Express monetary values in USD with 2 decimal places. Express percentages with 2 decimal places.
If portfolio is null, tell the user to refresh their portfolio first.`,

    RISK_QUERY: `
## TASK: Risk Query
Answer questions about portfolio risk. Use risk.riskScore, risk.riskLevel, risk.cvar95Percent, risk.activeAlerts from context.
Explain CVaR in plain English: "In the worst 5% of days, your portfolio loses X% on average."
If insufficientHistory is true, explain that more data is needed and give the plain-English version.`,

    STRATEGY_QUERY: `
## TASK: Strategy Query
Answer questions about allocation strategy and rebalancing. Use strategy.model, strategy.rebalanceRequired, strategy.topActions from context.
Explain the model in plain English (HRP_CVAR = "hierarchical clustering with tail-risk minimization").
Do not explain the mathematics — only the intuition.`,

    YIELD_QUERY: `
## TASK: Yield Query
Answer questions about yield opportunities, APY, and idle capital. Use yield.topOpportunity, yield.idleSignalCount, yield.totalIdleCostUsdPerYear from context.
Always mention that APY for LP positions is shown after impermanent loss adjustment.
If the user asks about "best yield" — reference the top opportunity from context, not a general answer.`,

    GOAL_CHANGE: `
## TASK: Goal Profile Change Request
The user wants to update their investment goal profile. Do NOT change their profile — only explain what each profile means and ask them to confirm via the settings panel.
Describe CONSERVATIVE, MODERATE, and AGGRESSIVE profiles in 1 sentence each.
Remind them that changing the profile will trigger a strategy recompute.`,

    GENERAL: `
## TASK: General Question
Answer the user's general question using context where relevant.
If the question is not related to CrestFlow or DeFi, politely say: "I'm specialized in your CrestFlow portfolio — I may not be the best resource for that. Here's what I can help with: [list 3 things]."`,
  };

  return instructions[intent];
}
```

---

### Copilot Response Schema (Zod)

**File:** `copilot/response.schema.ts`

```typescript
import { z } from 'zod';

export const DataPointSchema = z.object({
  label:  z.string(),
  value:  z.string(),
  source: z.string(), // e.g. "portfolio_snapshot", "risk_snapshot"
});

export const CopilotResponseSchema = z.object({
  answer:            z.string().min(1).max(2000),
  dataPoints:        z.array(DataPointSchema).max(10),
  confidence:        z.enum(['HIGH', 'MEDIUM', 'LOW']),
  disclaimer:        z.string().min(1),
  followUpQuestions: z.array(z.string()).min(1).max(3),
});

export type CopilotResponse = z.infer<typeof CopilotResponseSchema>;

/**
 * Parses and validates LLM JSON output.
 * Falls back to a safe error response if JSON is malformed.
 */
export function parseCopilotResponse(raw: string): CopilotResponse {
  try {
    const parsed = JSON.parse(raw);
    return CopilotResponseSchema.parse(parsed);
  } catch {
    return {
      answer: "I encountered an issue processing your question. Please try again.",
      dataPoints: [],
      confidence: 'LOW',
      disclaimer: "CrestFlow provides data-driven insights for informational purposes only. This is not financial advice.",
      followUpQuestions: [
        "What is my current portfolio value?",
        "What is my risk score?",
        "Are there better yield opportunities for me?",
      ],
    };
  }
}
```

---

### Session State (Redis-backed)

**File:** `copilot/session.manager.ts`

```typescript
import { Redis } from 'ioredis';
import { CopilotResponse } from './response.schema';

const SESSION_TTL = 30 * 60; // 30 minutes
const MAX_TURNS = 10;        // sliding window

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  timestamp: string;
}

export class CopilotSessionManager {
  constructor(private redis: Redis) {}

  private key(userId: string): string {
    return `crestflow:copilot:session:${userId}`;
  }

  async getHistory(userId: string): Promise<ConversationTurn[]> {
    const raw = await this.redis.get(this.key(userId));
    if (!raw) return [];
    return JSON.parse(raw);
  }

  async addTurns(userId: string, userMsg: string, assistantResponse: CopilotResponse, intent: string): Promise<ConversationTurn[]> {
    const history = await this.getHistory(userId);

    history.push(
      { role: 'user',      content: userMsg,                   intent, timestamp: new Date().toISOString() },
      { role: 'assistant', content: assistantResponse.answer,  intent, timestamp: new Date().toISOString() },
    );

    // Sliding window: keep only last MAX_TURNS pairs (MAX_TURNS * 2 entries)
    const trimmed = history.slice(-MAX_TURNS * 2);

    await this.redis.setex(this.key(userId), SESSION_TTL, JSON.stringify(trimmed));
    return trimmed;
  }

  async clearSession(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
```

---

### Copilot Service (Orchestrator)

**File:** `copilot/copilot.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { assembleCopilotContext } from './context.assembler';
import { classifyIntent, classifyIntentWithLLM } from './intent.classifier';
import { buildSystemPrompt } from './prompt.builder';
import { completeLLM, streamLLM } from './llm.client';
import { parseCopilotResponse, CopilotResponse } from './response.schema';
import { CopilotSessionManager } from './session.manager';
import { logger } from '../utils/logger';

export class CopilotService {
  constructor(
    private prisma: PrismaClient,
    private sessions: CopilotSessionManager,
  ) {}

  /**
   * Non-streaming query — returns complete response.
   */
  async query(userId: string, userMessage: string): Promise<CopilotResponse> {
    const start = Date.now();

    // Step 1: Classify intent (keyword-first, LLM fallback)
    let intent = classifyIntent(userMessage);

    // Step 2: Assemble context
    const context = await assembleCopilotContext(userId, this.prisma);

    // Step 3: Build system prompt
    const systemPrompt = buildSystemPrompt(context, intent);

    // Step 4: Append conversation history to user message
    const history = await this.sessions.getHistory(userId);
    const historyBlock = history.length > 0
      ? `Previous conversation:\n${history.map(t => `${t.role}: ${t.content}`).join('\n')}\n\n`
      : '';
    const fullUserMessage = `${historyBlock}User: ${userMessage}`;

    // Step 5: Call LLM
    const llmResult = await completeLLM({
      systemPrompt,
      userMessage: fullUserMessage,
      jsonMode: true,
      maxTokens: 1024,
    });

    // Step 6: Parse + validate response
    const response = parseCopilotResponse(llmResult.content);

    // Step 7: Persist to session
    await this.sessions.addTurns(userId, userMessage, response, intent);

    const durationMs = Date.now() - start;
    logger.info({
      module: 'copilot',
      event: 'query_complete',
      userId,
      intent,
      confidence: response.confidence,
      model: llmResult.model,
      fallbackUsed: llmResult.fallbackUsed,
      tokensUsed: llmResult.tokensUsed,
      durationMs,
    });

    return response;
  }

  /**
   * Streaming query — yields SSE chunks.
   * Used by the streaming endpoint (text/event-stream).
   */
  async *queryStream(userId: string, userMessage: string): AsyncGenerator<string> {
    const intent = classifyIntent(userMessage);
    const context = await assembleCopilotContext(userId, this.prisma);
    const systemPrompt = buildSystemPrompt(context, intent);
    const history = await this.sessions.getHistory(userId);
    const historyBlock = history.length > 0
      ? `Previous conversation:\n${history.map(t => `${t.role}: ${t.content}`).join('\n')}\n\n`
      : '';
    const fullUserMessage = `${historyBlock}User: ${userMessage}`;

    let fullContent = '';

    for await (const chunk of streamLLM({ systemPrompt, userMessage: fullUserMessage })) {
      fullContent += chunk.delta;
      if (chunk.delta) yield `data: ${JSON.stringify({ delta: chunk.delta })}\n\n`;
      if (chunk.done) {
        // Parse and save complete response
        const response = parseCopilotResponse(fullContent);
        await this.sessions.addTurns(userId, userMessage, response, intent);
        yield `data: ${JSON.stringify({ done: true, metadata: { confidence: response.confidence, intent, followUpQuestions: response.followUpQuestions } })}\n\n`;
      }
    }
  }
}
```

---

### User Intelligence Service

**File:** `user/user-intelligence.service.ts`

```typescript
import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';
import { classifyPersona, personaToGoalProfile, computeDriftScore } from './persona.classifier';
import { logger } from '../utils/logger';

export class UserIntelligenceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Process onboarding questionnaire answers.
   * Computes raw score → normalized score → persona → goalProfile.
   * Creates or updates UserProfile.
   */
  async processOnboarding(userId: string, answers: QuestionnaireAnswers): Promise<UserProfile> {
    const rawScore = computeRawScore(answers);
    const maxScore = 215; // max possible total
    const normalizedScore = Math.round((rawScore / maxScore) * 100);
    const persona = classifyPersona(normalizedScore);
    const goalProfile = personaToGoalProfile(persona);

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        investorPersona: persona,
        goalProfile,
        onboardingScore: normalizedScore,
        onboardingAnswers: answers as any,
        behavioralDriftScore: 0,
        profileVersion: 1,
      },
      update: {
        investorPersona: persona,
        goalProfile,
        onboardingScore: normalizedScore,
        onboardingAnswers: answers as any,
        profileVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    logger.info({ module: 'user-intelligence', event: 'onboarding_complete', userId, persona, goalProfile, normalizedScore });
    return profile;
  }

  /**
   * Record a behavioral signal and update drift score.
   * Called by event listeners across all other engines.
   */
  async recordSignal(userId: string, signalType: BehavioralSignalType): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Write signal
      await tx.behavioralSignal.create({
        data: { userId, signalType, occurredAt: new Date() },
      });

      // Recompute drift from last 30 days of signals
      const recentSignals = await tx.behavioralSignal.findMany({
        where: {
          userId,
          occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      const driftScore = computeDriftScore(recentSignals);

      await tx.userProfile.update({
        where: { userId },
        data: { behavioralDriftScore: driftScore },
      });
    });
  }

  /**
   * Update goal profile directly (user explicitly chose a new profile).
   * Emits UserGoalProfileChanged event → triggers Engine 3 recompute.
   */
  async updateGoalProfile(userId: string, goalProfile: GoalProfile): Promise<void> {
    const personaFromGoal = {
      CONSERVATIVE: 'CONSERVATIVE' as const,
      MODERATE: 'GROWTH' as const,
      AGGRESSIVE: 'AGGRESSIVE' as const,
    }[goalProfile];

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        goalProfile,
        investorPersona: personaFromGoal,
        behavioralDriftScore: 0, // reset drift after explicit profile change
        profileVersion: { increment: 1 },
      },
    });

    logger.info({ module: 'user-intelligence', event: 'goal_profile_updated', userId, goalProfile });
    // Event emission handled in controller → Engine 3 listens and recomputes
  }
}
```

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions)

```prisma
model UserProfile {
  id                    String          @id @default(uuid()) @db.Uuid
  userId                String          @db.Uuid @unique
  investorPersona       InvestorPersona @default(BALANCED)
  goalProfile           GoalProfile     @default(MODERATE)
  onboardingScore       Int?            // 0-100 normalized score
  onboardingAnswers     Json?           // raw questionnaire answers
  behavioralDriftScore  Int             @default(0)  // positive = more aggressive, negative = more conservative
  onboardingCompleted   Boolean         @default(false)
  profileVersion        Int             @default(1)  // increments on each update
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  user                  User            @relation(fields: [userId], references: [id])

  @@map("user_profiles")
}

model BehavioralSignal {
  id          String                @id @default(uuid()) @db.Uuid
  userId      String                @db.Uuid
  signalType  BehavioralSignalType
  occurredAt  DateTime
  metadata    Json?                 // optional context (e.g. which alert was dismissed)
  createdAt   DateTime              @default(now())

  user        User                  @relation(fields: [userId], references: [id])

  @@index([userId, occurredAt(sort: Desc)])
  @@map("behavioral_signals")
}

model CopilotQueryLog {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @db.Uuid
  query           String
  intent          String
  responseAnswer  String
  confidence      String
  model           String    // 'gpt-4.1-mini' | 'gemini-3.5-flash'
  fallbackUsed    Boolean   @default(false)
  tokensUsed      Int?
  durationMs      Int?
  sessionTurn     Int       // turn number in this session
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("copilot_query_logs")
}

enum InvestorPersona {
  CONSERVATIVE
  BALANCED
  GROWTH
  AGGRESSIVE
  YIELD_SEEKER
}

enum BehavioralSignalType {
  ACTED_ON_REBALANCE
  IGNORED_CRITICAL_ALERT
  IGNORES_YIELD_SUGGESTIONS
  HIGH_ENGAGEMENT
  GOAL_ESCALATION
  GOAL_DE_ESCALATION
  RISK_INACTION
}
```

---

## Module File Structure

```
apps/copilot-api/src/modules/
|
|-- user/
|   |-- user.controller.ts
|   |-- user.routes.ts
|   |-- user-intelligence.service.ts    <- onboarding, persona, drift, goal updates
|   |-- persona.classifier.ts           <- classifyPersona, personaToGoalProfile, computeDriftScore
|   +-- questionnaire.scorer.ts         <- computeRawScore from answers
|
+-- copilot/
    |-- copilot.controller.ts
    |-- copilot.routes.ts
    |-- copilot.service.ts              <- orchestrator
    |-- context.assembler.ts            <- parallel engine context fetch
    |-- intent.classifier.ts            <- keyword + LLM intent classification
    |-- prompt.builder.ts               <- system prompt + intent instructions
    |-- llm.client.ts                   <- gpt-4.1-mini primary, gemini-3.5-flash fallback
    |-- response.schema.ts              <- Zod schema, parseCopilotResponse
    +-- session.manager.ts              <- Redis-backed 10-turn sliding window
```

---

## API Endpoints (7)

---

### POST /api/v1/copilot/query

Submit a natural language query. Returns full structured response.

**Request:**
```json
{ "query": "What is my current portfolio risk?" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "answer": "Your portfolio has a risk score of 72 out of 100, which puts you in the HIGH risk category. Your biggest risk factor is high concentration in ALGO (67%), and you have one active critical alert about a position approaching liquidation. Your CVaR indicates that in the worst 5% of market days, your portfolio would lose approximately 12.4% on average.",
    "dataPoints": [
      { "label": "Risk Score", "value": "72 / 100", "source": "risk_snapshot" },
      { "label": "Risk Level", "value": "HIGH",      "source": "risk_snapshot" },
      { "label": "CVaR (95%)", "value": "-12.4%",    "source": "risk_snapshot" }
    ],
    "confidence": "HIGH",
    "disclaimer": "CrestFlow provides data-driven insights for informational purposes only...",
    "followUpQuestions": [
      "Which positions are at risk of liquidation?",
      "How can I reduce my risk score?",
      "What does my strategy recommend for rebalancing?"
    ],
    "intent": "RISK_QUERY",
    "model": "gpt-4.1-mini",
    "fallbackUsed": false
  }
}
```

---

### POST /api/v1/copilot/query/stream

Same as above but returns `text/event-stream` for real-time token streaming.

**SSE Event Format:**
```
data: {"delta": "Your portfolio "}
data: {"delta": "has a risk score "}
data: {"delta": "of 72 out of 100..."}
data: {"done": true, "metadata": {"confidence": "HIGH", "intent": "RISK_QUERY", "followUpQuestions": [...]}}
```

---

### GET /api/v1/copilot/history

Returns last N conversation turns for the current session.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "turns": [
      { "role": "user",      "content": "What is my portfolio risk?", "intent": "RISK_QUERY", "timestamp": "..." },
      { "role": "assistant", "content": "Your risk score is 72...",    "intent": "RISK_QUERY", "timestamp": "..." }
    ],
    "sessionTurnCount": 2,
    "sessionExpiresIn": 1742
  }
}
```

---

### POST /api/v1/copilot/reset

Clears the current conversation session.

**Response (200):** `{ "success": true, "data": { "cleared": true } }`

---

### GET /api/v1/user/profile

Returns the user's full investor profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "investorPersona": "GROWTH",
    "goalProfile": "MODERATE",
    "onboardingScore": 54,
    "onboardingCompleted": true,
    "behavioralDriftScore": 12,
    "driftAlert": null,
    "profileVersion": 2,
    "updatedAt": "2026-06-24T10:00:00Z"
  }
}
```

---

### PUT /api/v1/user/profile

Update the user's goal profile or preferences.

**Request:**
```json
{ "goalProfile": "AGGRESSIVE" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "goalProfile": "AGGRESSIVE",
    "investorPersona": "AGGRESSIVE",
    "strategyRecomputeTriggered": true
  }
}
```

---

### POST /api/v1/user/onboarding

Submit onboarding questionnaire answers.

**Request:**
```json
{
  "q1": "c",
  "q2": "c",
  "q3": "c",
  "q4": "b",
  "q5": "b",
  "q6": "b",
  "q7": "b"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "normalizedScore": 54,
    "investorPersona": "GROWTH",
    "goalProfile": "MODERATE",
    "personaDescription": "You're a growth-oriented investor comfortable with moderate DeFi risk. We'll balance lending and LP opportunities while keeping your risk score below 60.",
    "strategyRecomputeTriggered": true
  }
}
```

---

## Events

```typescript
export const UserIntelligenceEvents = {
  ONBOARDING_COMPLETED:      'OnboardingCompleted',
  GOAL_PROFILE_CHANGED:      'GoalProfileChanged',
  DRIFT_THRESHOLD_EXCEEDED:  'DriftThresholdExceeded',
} as const;

// GoalProfileChanged → consumed by Engine 3 (triggers strategy recompute)
// GoalProfileChanged → consumed by Engine 4 (triggers opportunity re-ranking)
```

---

## New Packages

| Package | Purpose |
|---|---|
| `openai` | GPT-4.1-mini API client (primary LLM) |
| `@google/generative-ai` | Gemini 3.5 Flash API client (fallback LLM) |
| `zod` | Structured output schema validation (likely already in project) |

---

## Graceful Degradation

| Condition | Behavior |
|---|---|
| Both OpenAI and Gemini unavailable | Return static safe response: "The copilot is temporarily unavailable. Please try again in a few minutes." No 500 error |
| Portfolio snapshot not yet available | Context field is null — system prompt instructs LLM to say "Refresh your portfolio first" |
| Onboarding not completed | Default to BALANCED persona + MODERATE goal profile until questionnaire is answered |
| Session expired (>30 min) | New session starts automatically — no error |
| LLM returns invalid JSON | `parseCopilotResponse` catches and returns safe fallback response |
| Intent classification fails | Default to `GENERAL` intent — never throw |

---

## Logging Requirements

`module: "copilot"` or `module: "user-intelligence"`, JSON structured.

- `INFO` — query complete (userId, intent, confidence, model, fallbackUsed, tokensUsed, durationMs)
- `INFO` — onboarding complete (userId, persona, goalProfile, normalizedScore)
- `INFO` — goal profile updated (userId, oldProfile, newProfile)
- `INFO` — behavioral signal recorded (userId, signalType, newDriftScore)
- `WARN` — LLM fallback triggered (reason, fromModel, toModel)
- `WARN` — drift threshold exceeded (userId, driftScore, currentPersona)
- `ERROR` — LLM both providers failed (userId, error)
- `ERROR` — context assembly failed (userId, failedDomain)

---

## Testing Requirements

Coverage: 95%+ on all pure functions. Integration tests for copilot pipeline and user intelligence service.

### Unit Tests

**`persona.classifier.test.ts`**
- Score 0–19 → CONSERVATIVE
- Score 20–39 → BALANCED
- Score 40–59 → GROWTH
- Score 60–79 → AGGRESSIVE
- Score 80–100 → YIELD_SEEKER
- Boundary values (0, 19, 20, 39, 40, ...) classified correctly
- `personaToGoalProfile`: all 5 personas map to correct GoalProfile
- `computeDriftScore`: empty signals → 0; mixed signals → correct weighted sum; signals > 30 days ago → ignored

**`questionnaire.scorer.test.ts`**
- All 'a' answers → minimum possible score
- All 'd'/'c' answers → maximum possible score
- Normalized score always in [0, 100]
- Known answer combinations → expected normalized scores

**`intent.classifier.test.ts`**
- "What's my portfolio worth?" → PORTFOLIO_QUERY
- "Am I close to liquidation?" → RISK_QUERY
- "Should I rebalance?" → STRATEGY_QUERY
- "Best APY for ALGO?" → YIELD_QUERY
- "I want to be more aggressive" → GOAL_CHANGE
- "How does Algorand work?" → GENERAL
- Case-insensitive matching
- Unknown query → GENERAL (never throws)

**`response.schema.test.ts`**
- Valid LLM JSON → parsed correctly
- Missing required field → returns safe fallback
- Malformed JSON → returns safe fallback, never throws
- Answer > 2000 chars → Zod validation fails, fallback returned

**`session.manager.test.ts`**
- Adding > 10 turn pairs → oldest trimmed (sliding window)
- Session TTL: Redis key expires after 30 min
- `clearSession`: Redis key deleted
- `getHistory`: returns [] for new session

**`context.assembler.test.ts`**
- No portfolio snapshot → `portfolio: null` (not error)
- All engines have data → context fully populated
- `assembledAt` is valid ISO8601
- Parallel fetch: all 6 queries run concurrently (Promise.all)

### Integration Tests

**`copilot.service.integration.test.ts`** (real Postgres + Redis, mocked LLM)
- Full pipeline: query → classify → assemble → prompt → LLM → parse → session → response
- LLM returns invalid JSON → safe fallback response returned (no 500)
- OpenAI mock returns 429 → Gemini fallback called, `fallbackUsed: true`
- Multi-turn: second query includes first turn in history block
- `clearSession` → next query starts with empty history

**`user-intelligence.service.integration.test.ts`**
- Onboarding with min-score answers → CONSERVATIVE + CONSERVATIVE goal
- Onboarding twice → profileVersion increments
- `recordSignal(GOAL_ESCALATION)` → driftScore increases by +15
- Signals older than 30 days → excluded from drift calculation
- `updateGoalProfile` → goalProfile updated, driftScore reset to 0

---

## Frontend Context Additions

### Screens Required

1. **Onboarding Questionnaire Flow** — 7-step stepper card, animated transitions, progress bar. Only shown on first login after portfolio scan.
2. **Persona Badge** — in sidebar/header: "GROWTH Investor" colored badge with tooltip describing the persona
3. **Copilot Panel** — slide-in drawer or bottom sheet. Input at bottom, conversation above, SSE streaming tokens appear in real-time
4. **Profile Page** — shows: persona, goal profile, drift score (visualized as a "leaning" indicator), behavioral signals timeline
5. **Goal Profile Selector** — also surfaced in Engine 3 strategy panel (already documented there)
6. **Drift Alert Prompt** — toast/modal when drift threshold exceeded: "Your behavior suggests you might be more [aggressive/conservative] than your current profile. Want to update?"

### UX Rules
- Copilot typing indicator during streaming (animated dots)
- `confidence: LOW` responses shown with grey italic disclaimer instead of normal text
- Follow-up question chips shown below each assistant response — tap to send
- Onboarding questionnaire cannot be dismissed on first login until at least Q1–Q4 answered
- Persona badge tooltip describes persona in 1 sentence and current goal profile constraints
- Session timer not shown to user — session refreshes silently on each message

---

## Addendum: Architecture Audit Remediations

### Behavioral Drift Score Recomputation Trigger

**Addresses:** NEW-04 (architecture_audit_v2.md)

The `behavioralDriftScore` is described as "recomputed on every new signal write from last 30 days" but no recomputation trigger, BullMQ job, or persistence path is defined. Without this, the drift score is set at onboarding and never updates — the persona becomes static.

**Implementation:**

Every `BehavioralSignal` write triggers a BullMQ job on the `profile-update-queue`:

```typescript
// After writing a BehavioralSignal:
await profileUpdateQueue.add('recompute-drift', {
  userId: signal.userId,
  signalType: signal.type,
  timestamp: new Date().toISOString(),
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  // Deduplicate: only one recompute per user per 5 minutes
  jobId: `drift-recompute-${signal.userId}`,
  removeOnComplete: true,
});
```

The `profile-update-queue` worker:
1. Loads all BehavioralSignals for the user from the last 30 days
2. Recomputes `behavioralDriftScore` using the weighted signal scoring from Plan 07
3. If drift exceeds threshold (>0.3), updates `investorPersona` via the persona classifier
4. Writes updated `UserProfile` record
5. Emits `InvestorProfileUpdated` event

**Deduplication:** The `jobId` pattern ensures only one drift recompute runs per user per 5-minute window. Multiple rapid signals (e.g., user accepts 3 recommendations in a row) result in a single recompute.

**BullMQ queue registration:**
- Queue name: `profile-update-queue`
- Worker: registered in Engine 5 module initialization
- Concurrency: 5 (profile updates are CPU-light)

### Copilot Synchronous Context Assembly

**Addresses:** GAP-10 (architecture_review.md)

The Copilot must assemble multi-engine context synchronously for natural language queries. This requires direct service calls (not events). The call sequence:

```typescript
async function assembleContext(userId: string): Promise<CopilotContext> {
  const timeout = 2000; // 2-second timeout per engine fetch
  
  const [portfolio, risk, strategy, yield, profile] = await Promise.allSettled([
    withTimeout(portfolioService.getLatestSnapshot(userId), timeout),
    withTimeout(riskService.getLatestSnapshot(userId), timeout),
    withTimeout(strategyService.getLatestSnapshot(userId), timeout),
    withTimeout(yieldService.getLatestOpportunities(userId), timeout),
    withTimeout(userProfileService.getProfile(userId), timeout),
  ]);

  return {
    portfolio: portfolio.status === 'fulfilled' ? portfolio.value : null,
    risk: risk.status === 'fulfilled' ? risk.value : null,
    strategy: strategy.status === 'fulfilled' ? strategy.value : null,
    yield: yield.status === 'fulfilled' ? yield.value : null,
    profile: profile.status === 'fulfilled' ? profile.value : null,
    contextStale: [portfolio, risk, strategy, yield, profile].some(r => r.status === 'rejected'),
  };
}
```

**Failure handling:**
- Each engine fetch has a 2-second timeout (addresses SCALE-05)
- If a fetch fails or times out, the context field is `null` — the Copilot proceeds with available data
- If `contextStale: true`, the Copilot response includes a disclaimer: "Some data may be stale — a refresh is in progress"
- A new user with no snapshots: all fields are `null` — the Copilot responds with onboarding guidance

**Token budget per context component (addresses AI-01):**

| Component | Max Tokens | Source |
|---|---|---|
| System prompt | 500 | Static |
| Portfolio snapshot | 800 | Engine 1 |
| Risk snapshot | 400 | Engine 2 |
| Strategy snapshot | 400 | Engine 3 |
| Yield opportunities (top 5) | 400 | Engine 4 |
| Conversation history (10 turns) | 800 | Session |
| User query | 200 | Input |
| **Total budget** | **3,500** | — |

Log `tokensUsed` per request. Alert (Sentry WARN) at > 8K tokens.

### Copilot Response Number Validation

**Addresses:** AI-02 (architecture_audit_v2.md)

The Copilot must cross-reference all financial figures in LLM responses against the context data:

```typescript
function validateResponseNumbers(response: CopilotResponse, context: CopilotContext): boolean {
  // Extract all numbers from the response
  const responseNumbers = extractFinancialFigures(response.text);
  
  // Cross-reference against context data within 1% tolerance
  for (const figure of responseNumbers) {
    const contextMatch = findMatchInContext(figure, context);
    if (!contextMatch || Math.abs(figure.value - contextMatch.value) / contextMatch.value > 0.01) {
      logger.warn({ module: 'copilot', event: 'number_mismatch', figure, contextMatch });
      return false; // Regenerate response
    }
  }
  return true;
}
```

If validation fails, regenerate the response (max 1 retry). If the retry also fails, return a fallback response that presents raw engine data without LLM interpretation.
