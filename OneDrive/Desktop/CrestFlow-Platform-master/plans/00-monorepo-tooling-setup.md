# Plan 00 — Monorepo + Tooling Setup

**Status:** Approved
**Priority:** P0 — Must exist before any other plan executes
**Feeds into:** All Plans (01–11) — every other plan depends on this foundation
**Architecture:** Hexagonal DDD Monolith inside a Turborepo Monorepo

---

## Overview

Plan 00 establishes the complete project scaffold from which Plans 01–11 are implemented. It covers:

1. Monorepo tooling decision and workspace layout
2. Full directory structure (apps, packages, contracts)
3. TypeScript configuration (base + per-package)
4. Code quality tooling (ESLint, Prettier)
5. Docker Compose (PostgreSQL + Redis + Bull Board)
6. Environment variable strategy
7. Database client singleton (Prisma)
8. Core shared utilities (Decimal, error types, logger bootstrap)
9. CI/CD skeleton (GitHub Actions)
10. AlgoKit workspace for smart contracts

This plan produces a working, runnable scaffold with zero business logic — but with every structural and tooling decision locked in so all downstream plans build on a stable foundation.

---

## Architecture Decisions

### Decision 1 — Monorepo Tool

**Options evaluated:**

| Tool | Pros | Cons | Verdict |
|---|---|---|---|
| **Turborepo** | Fast incremental builds via caching, zero-config for pnpm/npm workspaces, GitHub Actions integration, minimal setup, excellent for TypeScript monorepos | Orchestration only — not a package manager | **Selected** |
| **Nx** | Powerful code generation, distributed task execution, great for large teams | Heavy config overhead, steep learning curve, overkill for 2-app monorepo | Rejected |
| **pnpm workspaces alone** | Simplest possible, no extra tooling | No build caching, no pipeline definition, slow builds as project grows | Rejected |

**Decision: Turborepo + pnpm workspaces**

Turborepo sits on top of pnpm workspaces. pnpm manages packages and hoisting. Turborepo provides task caching (`turbo run build`, `turbo run test`). This is the industry standard for TypeScript monorepos of this size.

---

### Decision 2 — Package Manager

**Options evaluated:**

| Tool | Pros | Cons | Verdict |
|---|---|---|---|
| **pnpm** | Fastest installs, strict hoisting (no phantom deps), best workspace support, disk-efficient | Different syntax to npm (minor) | **Selected** |
| **npm** | Universal, no learning curve | Slow, no strict hoisting, workspace support is weaker | Rejected |
| **yarn berry** | Good workspace support, PnP mode | PnP causes issues with Prisma and some native modules | Rejected |

**Decision: pnpm**

---

### Decision 3 — Node.js Version

**Decision: Node.js 22 LTS (currently active LTS)**

Node 22 LTS provides:
- Native `fetch` API (no need for `node-fetch`)
- Native `AbortController`
- Performance improvements for crypto operations (relevant to algosdk)
- Supported until April 2027 — outlasts our entire development runway

Enforced via `.nvmrc` and `engines` field in root `package.json`.

---

### Decision 4 — Backend Framework

**Options evaluated:**

| Framework | Pros | Cons | Verdict |
|---|---|---|---|
| **Fastify 5** | 2–3x faster than Express (benchmarked), built-in schema validation via JSON Schema, TypeScript-first, native Zod plugin, better request lifecycle hooks | Different middleware pattern from Express (requires minor learning) | **Selected** |
| **Express 5** | Most familiar, plans already reference it | Slower, no native type safety, middleware pattern is older | Rejected |
| **Hono** | Extremely fast, edge-ready, excellent TypeScript support | Newer, smaller ecosystem, less Prisma/algosdk integration examples | Future consideration |

**Decision: Fastify 5**

All plans reference Express-style middleware patterns, which map directly to Fastify's hooks/plugins system. The performance difference is significant (2–3x throughput on benchmark), Fastify has native Zod schema validation (which we need for all API contracts), and its plugin system enforces encapsulation by default — a perfect fit for the Hexagonal DDD architecture. No business logic changes required vs. Express.

**Note:** Plans 01–11 show Express syntax in code examples. All code must be adapted to Fastify equivalents during implementation. The patterns are identical — `app.get()` becomes `fastify.get()`, middleware becomes hooks.

---

### Decision 5 — TypeScript Configuration Strategy

**Decision: Strict mode, composite projects, path aliases**

```
tsconfig.base.json           ← root — strict: true, target: ES2022, module: NodeNext
  ↳ apps/copilot-api/tsconfig.json     (extends base, includes src/)
  ↳ apps/web/tsconfig.json             (extends base, lib: DOM)
  ↳ packages/shared/tsconfig.json      (extends base, composite: true, declarationMap: true)
  ↳ packages/contracts/tsconfig.json   (Python only — no TS needed)
```

Strict mode catches the entire class of null-reference bugs and implicit `any` types that are dangerous in financial code. Non-negotiable.

---

### Decision 6 — Code Quality: ESLint + Prettier

| Tool | Config | Rationale |
|---|---|---|
| **ESLint 9** (flat config) | `@typescript-eslint/recommended-strict` + custom rules | Catches unsafe patterns; enforces no `any`, no floating point, no unused vars |
| **Prettier 3** | Opinionated defaults | Eliminates all formatting debates |
| **lint-staged** | Pre-commit hooks via Husky | Prevents committing unformatted or lint-failing code |
| **Husky** | Git hooks manager | Runs `lint-staged` on `pre-commit`, `type-check` on `pre-push` |

**Custom ESLint rules for financial correctness:**
- `no-restricted-syntax` — ban `parseFloat`, `parseInt` on monetary strings
- `no-restricted-globals` — ban `Number()` coercion on financial values
- These rules enforce `instructions.md §14` (Financial Computation Standards) at the linting level

---

### Decision 7 — Docker Compose (Local Development)

Three services in local development:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | Primary database |
| `redis` | `redis:7-alpine` | 6379 | Cache + BullMQ queues + Copilot sessions |
| `bullboard` | `@bull-board/api` via express | 3999 | BullMQ queue monitoring UI |

`appendonly yes` on Redis — queue jobs survive container restarts.

**No separate Docker image for the API in development** — the backend runs via `pnpm dev` with `tsx watch` for hot reload. Docker is for infra only in dev.

---

### Decision 8 — Environment Variable Strategy

**Decision: `.env` files in development + validation via `zod` at startup**

```
.env.example           ← committed — all variable names with placeholder values + docs
.env.local             ← gitignored — actual dev secrets
.env.test              ← gitignored — test environment overrides
```

**Startup validation:** At server boot, parse all env vars through a Zod schema. If any required variable is missing or malformed, crash immediately with a clear error. Never start the server in a partially-configured state.

This means zero runtime `process.env.X!` assertions in business logic — all env vars are accessed through a typed `config` object that is validated once at boot.

---

### Decision 9 — Prisma Client Strategy

**Decision: Single Prisma client instance in `packages/shared`, imported everywhere**

```typescript
// packages/shared/src/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

This pattern prevents connection exhaustion. The `globalThis` trick prevents multiple instances during hot-reload in development.

**Prisma schema location:** `apps/copilot-api/prisma/schema.prisma` — one service owns the DB.

---

### Decision 10 — Event Bus: BullMQ

**Decision: BullMQ 5.x on the existing Redis instance**

This resolves GAP-02 from the architecture review. BullMQ provides:
- Durable jobs that survive process restarts (backed by Redis `appendonly`)
- Automatic retry with exponential backoff
- Dead-letter queue for failed jobs after max retries
- Bull Board UI for monitoring queue depth, job status, and failures
- No new infrastructure — reuses the same Redis container

**Queue definitions established in Plan 00:**

| Queue | Name | Consumers |
|---|---|---|
| Portfolio scan | `crestflow:portfolio-scan` | Engine 1 |
| Risk analysis | `crestflow:risk-analysis` | Engine 2 |
| Strategy | `crestflow:strategy` | Engine 3 |
| Yield | `crestflow:yield` | Engine 4 |
| Execution | `crestflow:execution` | Engine 6 |
| Audit | `crestflow:audit` | Audit Layer |

Queue names are established here as constants in `packages/shared/src/queues.ts` so all plans import from one place.

---

### Decision 11 — Logging Bootstrap (Pino)

**Decision: Pino 9.x — established in Plan 00, used by all plans**

Pino is the fastest Node.js structured logger. Every module imports the logger from `packages/shared/src/logger.ts`. Child loggers are created per module with a `module` field.

```
{
  "level": "info",
  "time": 1719302400000,
  "module": "engine1",
  "userId": "hashed-id",
  "requestId": "uuid",
  "msg": "portfolio scan started"
}
```

**Never log:** private keys, seed phrases, raw KYC documents, full wallet addresses in production.

---

### Decision 12 — Testing Framework

**Decision: Vitest 2.x**

Vitest is the modern testing framework that aligns with our Vite-based frontend and provides native ESM support. Same API as Jest — zero migration cost if coming from Jest familiarity.

**Per-package test setup:**
- `apps/copilot-api` — Vitest + Supertest for API endpoint tests
- `packages/shared` — Vitest unit tests for utilities
- Financial regression tests — golden value fixtures in `__fixtures__/` directories

---

### Decision 13 — GitHub Actions CI Pipeline

**Decision: Single workflow with staged jobs**

```yaml
Jobs (run on every PR + push to main):
  lint        → eslint + prettier check
  type-check  → tsc --noEmit across all packages
  test        → vitest run across all packages
  build       → turbo run build (catches import errors)
  migrate-check → prisma migrate diff (ensures schema is in sync)
```

Deploy job runs only on merge to `main`:
```yaml
  deploy      → Docker build + push + Railway deploy
```

---

## Directory Structure (Canonical)

This is the complete, canonical project structure that all Plans 01–11 will build into.

```
CrestFlow-Platform/
│
├── .github/
│   └── workflows/
│       ├── ci.yml            ← lint + type-check + test + build on every PR
│       └── deploy.yml        ← build + migrate + deploy on merge to main
│
├── apps/
│   │
│   ├── copilot-api/                         ← Main backend (Fastify + Node 22)
│   │   ├── prisma/
│   │   │   ├── schema.prisma                ← SINGLE source of truth for DB schema
│   │   │   └── migrations/                  ← Auto-generated by Prisma
│   │   │
│   │   ├── src/
│   │   │   ├── modules/                     ← Domain modules (Hexagonal DDD)
│   │   │   │   │
│   │   │   │   ├── identity/                ← Plan 01 — Auth, Turnkey, JWT
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── turnkey.service.ts
│   │   │   │   │   └── google-auth.service.ts
│   │   │   │   │
│   │   │   │   ├── knowledge/               ← Plan 02 — Data adapters, cache
│   │   │   │   │   ├── adapters/
│   │   │   │   │   │   ├── algorand-indexer.adapter.ts
│   │   │   │   │   │   ├── folks-finance.adapter.ts
│   │   │   │   │   │   ├── tinyman.adapter.ts
│   │   │   │   │   │   ├── pact.adapter.ts
│   │   │   │   │   │   ├── coingecko.adapter.ts
│   │   │   │   │   │   └── gora-oracle.adapter.ts    ← stub (P2)
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── cache.service.ts
│   │   │   │   │   │   └── price.service.ts
│   │   │   │   │   ├── normalizer/
│   │   │   │   │   │   ├── asset.normalizer.ts
│   │   │   │   │   │   ├── protocol.normalizer.ts
│   │   │   │   │   │   └── price.normalizer.ts
│   │   │   │   │   ├── constants/
│   │   │   │   │   │   └── asset-registry.ts
│   │   │   │   │   └── knowledge.module.ts
│   │   │   │   │
│   │   │   │   ├── portfolio/               ← Plan 03 — Engine 1
│   │   │   │   │   ├── portfolio.controller.ts
│   │   │   │   │   ├── portfolio.routes.ts
│   │   │   │   │   ├── portfolio.service.ts
│   │   │   │   │   ├── health-score.calculator.ts
│   │   │   │   │   ├── lp-decomposer.ts
│   │   │   │   │   └── portfolio.module.ts
│   │   │   │   │
│   │   │   │   ├── risk/                    ← Plan 04 — Engine 2
│   │   │   │   │   ├── risk.controller.ts
│   │   │   │   │   ├── risk.routes.ts
│   │   │   │   │   ├── risk.service.ts
│   │   │   │   │   ├── cvar.calculator.ts
│   │   │   │   │   ├── liquidation.monitor.ts
│   │   │   │   │   └── risk.module.ts
│   │   │   │   │
│   │   │   │   ├── strategy/                ← Plan 05 — Engine 3
│   │   │   │   │   ├── strategy.controller.ts
│   │   │   │   │   ├── strategy.routes.ts
│   │   │   │   │   ├── strategy.service.ts
│   │   │   │   │   ├── hrp.optimizer.ts
│   │   │   │   │   └── strategy.module.ts
│   │   │   │   │
│   │   │   │   ├── yield/                   ← Plan 06 — Engine 4
│   │   │   │   │   ├── yield.controller.ts
│   │   │   │   │   ├── yield.routes.ts
│   │   │   │   │   ├── yield.service.ts
│   │   │   │   │   ├── topsis.ranker.ts
│   │   │   │   │   └── yield.module.ts
│   │   │   │   │
│   │   │   │   ├── intelligence/            ← Plan 07 — Engine 5 + Copilot
│   │   │   │   │   ├── copilot.controller.ts
│   │   │   │   │   ├── copilot.routes.ts
│   │   │   │   │   ├── copilot.service.ts
│   │   │   │   │   ├── intent.classifier.ts
│   │   │   │   │   ├── context.assembler.ts
│   │   │   │   │   ├── llm.client.ts
│   │   │   │   │   ├── persona.scorer.ts
│   │   │   │   │   ├── user.controller.ts
│   │   │   │   │   ├── user.routes.ts
│   │   │   │   │   ├── user.service.ts
│   │   │   │   │   └── intelligence.module.ts
│   │   │   │   │
│   │   │   │   ├── execution/               ← Plan 08 — Engine 6
│   │   │   │   │   ├── execution.controller.ts
│   │   │   │   │   ├── execution.routes.ts
│   │   │   │   │   ├── poa.builder.ts
│   │   │   │   │   ├── policy.engine.ts
│   │   │   │   │   ├── simulation.gate.ts
│   │   │   │   │   ├── signing.service.ts
│   │   │   │   │   ├── execution.coordinator.ts
│   │   │   │   │   └── execution.module.ts
│   │   │   │   │
│   │   │   │   ├── audit/                   ← Plan 09 — Audit Layer
│   │   │   │   │   ├── audit.controller.ts
│   │   │   │   │   ├── audit.routes.ts
│   │   │   │   │   ├── audit.service.ts
│   │   │   │   │   └── audit.module.ts
│   │   │   │   │
│   │   │   │   └── kyc/                     ← Plan 10 — KYC, DID, On/Off-Ramp
│   │   │   │       ├── kyc.controller.ts
│   │   │   │       ├── kyc.routes.ts
│   │   │   │       ├── kyc.service.ts
│   │   │   │       ├── veriff.client.ts
│   │   │   │       ├── goplausible.client.ts
│   │   │   │       ├── onramp.service.ts
│   │   │   │       └── kyc.module.ts
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts          ← JWT verification (Plan 01)
│   │   │   │   ├── x402.ts                  ← Payment gate (Plan 11)
│   │   │   │   ├── rate-limit.ts            ← Per-user + per-endpoint limits
│   │   │   │   ├── request-id.ts            ← Injects requestId into every request
│   │   │   │   └── error-handler.ts         ← Global error → standard response envelope
│   │   │   │
│   │   │   ├── queues/                      ← BullMQ queue workers
│   │   │   │   ├── portfolio-scan.worker.ts
│   │   │   │   ├── risk-analysis.worker.ts
│   │   │   │   ├── strategy.worker.ts
│   │   │   │   ├── yield.worker.ts
│   │   │   │   ├── execution.worker.ts
│   │   │   │   └── audit.worker.ts
│   │   │   │
│   │   │   ├── events/
│   │   │   │   └── domain.events.ts         ← All 18+ domain event type definitions
│   │   │   │
│   │   │   ├── lib/
│   │   │   │   ├── algorand.ts              ← algosdk Algodv2 + Indexer client singletons
│   │   │   │   ├── redis.ts                 ← ioredis singleton
│   │   │   │   ├── openai.ts                ← OpenAI + Gemini client singletons
│   │   │   │   └── bullmq.ts                ← Queue instances (import by name)
│   │   │   │
│   │   │   ├── config/
│   │   │   │   └── env.ts                   ← Zod-validated env config (crashes if invalid)
│   │   │   │
│   │   │   ├── app.ts                       ← Fastify app factory (register plugins + routes)
│   │   │   └── server.ts                    ← Entry point (import app, listen)
│   │   │
│   │   ├── test/
│   │   │   ├── __fixtures__/                ← Golden value fixtures for financial tests
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── setup.ts
│   │   │
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── web/                                 ← Frontend (Vite 6 + React 19)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── dashboard/
│       │   │   ├── auth/
│       │   │   └── onboarding/
│       │   ├── components/
│       │   │   ├── ui/                      ← shadcn/ui base components
│       │   │   ├── portfolio/
│       │   │   ├── risk/
│       │   │   ├── yield/
│       │   │   ├── copilot/
│       │   │   └── execution/
│       │   ├── stores/                      ← Zustand stores (auth, portfolio, UI state)
│       │   ├── queries/                     ← TanStack Query hooks (one per API endpoint)
│       │   ├── lib/
│       │   │   ├── api.ts                   ← Base fetch client (attaches JWT header)
│       │   │   └── google-auth.ts           ← GIS token-based OAuth helper
│       │   ├── types/                       ← Re-exports from packages/shared
│       │   ├── App.tsx
│       │   └── main.tsx
│       │
│       ├── public/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   │
│   ├── shared/                              ← Shared between copilot-api and web
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── knowledge.types.ts       ← AssetHolding, ProtocolPosition, PriceData
│   │   │   │   ├── portfolio.types.ts       ← PortfolioSnapshot, HealthScore
│   │   │   │   ├── risk.types.ts            ← RiskScore, RiskAlert
│   │   │   │   ├── yield.types.ts           ← YieldOpportunity, TopsisResult
│   │   │   │   ├── strategy.types.ts        ← StrategyPlan, RebalancingAction
│   │   │   │   ├── execution.types.ts       ← POAStep, PlanOfAction, ExecutionRecord
│   │   │   │   ├── user.types.ts            ← InvestorPersona, GoalProfile, UserProfile
│   │   │   │   └── api.types.ts             ← Standard response envelope, error codes
│   │   │   ├── db.ts                        ← Prisma singleton
│   │   │   ├── logger.ts                    ← Pino base logger factory
│   │   │   ├── queues.ts                    ← BullMQ queue name constants
│   │   │   ├── errors.ts                    ← Typed error classes
│   │   │   └── decimal.ts                   ← Decimal.js helpers + config (precision: 28)
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── contracts/                           ← Algorand smart contracts (Puya Python + AlgoKit)
│       ├── src/
│       │   ├── escrow/                      ← P1: x402 on-chain escrow (if needed)
│       │   │   └── escrow.py
│       │   └── crest_token/                 ← Phase 3: ARC-20 CREST token
│       │       └── crest_token.py
│       ├── tests/
│       │   ├── escrow_test.py
│       │   └── crest_token_test.py
│       ├── algokit.toml
│       ├── pyproject.toml
│       └── README.md
│
├── project-context/                         ← Documentation (unchanged)
├── plans/                                   ← All plans 00–11
│
├── docker-compose.yml                       ← PostgreSQL + Redis + Bull Board
├── turbo.json                               ← Turborepo pipeline definition
├── pnpm-workspace.yaml                      ← Workspace package paths
├── package.json                             ← Root (scripts: dev, build, test, lint)
├── tsconfig.base.json                       ← Shared TS config (strict, ES2022, NodeNext)
├── .eslintrc.json                           ← Root ESLint config (flat config)
├── .prettierrc                              ← Prettier config
├── .nvmrc                                   ← Node 22 LTS
├── .env.example                             ← All env var names + docs (committed)
├── .gitignore
└── README.md
```

---

## Files Produced by Plan 00 (Complete Deliverables)

Plan 00 creates the following files with real content (not stubs):

### Root Configuration

| File | Content |
|---|---|
| `turbo.json` | Build pipeline: `build → test → lint → type-check`. Cache inputs/outputs per package |
| `pnpm-workspace.yaml` | Lists `apps/*`, `packages/*` as workspace packages |
| `package.json` (root) | Scripts: `dev`, `build`, `test`, `lint`, `type-check`. `engines: { node: ">=22.0.0", pnpm: ">=9.0.0" }` |
| `tsconfig.base.json` | `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `exactOptionalPropertyTypes: true` |
| `.eslintrc.json` | `@typescript-eslint/recommended-strict`, custom `no-restricted-syntax` for floating-point money |
| `.prettierrc` | `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100` |
| `.nvmrc` | `22` |
| `.gitignore` | `node_modules`, `.env.local`, `.env.test`, `dist`, `.turbo`, `*.tsbuildinfo` |
| `.env.example` | All 30+ env variables with placeholder values and inline docs |
| `docker-compose.yml` | PostgreSQL 16, Redis 7 (appendonly), Bull Board |

### `packages/shared`

| File | Content |
|---|---|
| `src/db.ts` | Prisma singleton (globalThis pattern for hot-reload safety) |
| `src/logger.ts` | Pino factory: `createLogger(module: string)` → child logger with module field |
| `src/decimal.ts` | `Decimal.set({ precision: 28, rounding: ROUND_HALF_UP })`. Helpers: `toDecimalString`, `toBasisPoints`, `fromMicroUnits` |
| `src/errors.ts` | `AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `PaymentRequiredError` |
| `src/queues.ts` | `QUEUE_NAMES` constant: `PORTFOLIO_SCAN`, `RISK_ANALYSIS`, `STRATEGY`, `YIELD`, `EXECUTION`, `AUDIT` |
| `src/types/api.types.ts` | `ApiResponse<T>`, `ApiError`, `ApiMeta` — standard response envelope from `instructions.md` |
| `src/types/knowledge.types.ts` | `AssetHolding`, `ProtocolPosition`, `PriceData`, `TransactionRecord` |
| `src/types/execution.types.ts` | `POAStep`, `PlanOfAction`, `ActionType`, `PolicyDecision`, `PolicyResult` |
| `src/types/user.types.ts` | `InvestorPersona`, `GoalProfile`, `DriftSignal` |
| `src/index.ts` | Re-exports all public types and utilities |

### `apps/copilot-api`

| File | Content |
|---|---|
| `src/config/env.ts` | Zod schema for all env vars. Exported `config` object. Crashes on startup if invalid. |
| `src/app.ts` | Fastify app factory. Registers: `@fastify/cors`, `@fastify/helmet`, `pino` logger, `request-id` hook, `error-handler`. No routes yet. |
| `src/server.ts` | `app.listen({ port: config.PORT, host: '0.0.0.0' })` |
| `src/lib/redis.ts` | `ioredis` singleton: `new Redis(config.REDIS_URL)` |
| `src/lib/algorand.ts` | `algosdk.Algodv2` + `algosdk.Indexer` singletons using Nodely endpoints from config |
| `src/lib/bullmq.ts` | Creates one `Queue` instance per `QUEUE_NAMES` entry. Exports named queues. |
| `src/lib/openai.ts` | `new OpenAI({ apiKey: config.OPENAI_API_KEY })` + `new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY)` |
| `src/middleware/request-id.ts` | Fastify hook: injects `X-Request-ID` header (UUID) into every request and response |
| `src/middleware/error-handler.ts` | Global Fastify `setErrorHandler`. Maps `AppError` subclasses to HTTP codes. Returns standard error envelope. |
| `src/events/domain.events.ts` | TypeScript types for all 18+ domain events (`UserOnboarded`, `PortfolioScanTriggered`, etc.) |
| `prisma/schema.prisma` | Initial schema: `User` model only. KYCStatus uses canonical Plan 10 values. `tokenVersion` field for JWT revocation. |
| `Dockerfile` | Multi-stage: `builder` (compile TS) → `runner` (production image, Node 22 Alpine, non-root user) |
| `vitest.config.ts` | Coverage: 80% threshold (95% for files under `financial/`, `risk/`, `execution/`) |

### `apps/web`

| File | Content |
|---|---|
| Vite + React project scaffold | `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx` |
| `src/lib/api.ts` | Base `fetch` wrapper: attaches `Authorization: Bearer <token>` from Zustand auth store. Returns typed `ApiResponse<T>`. |

### `packages/contracts`

| File | Content |
|---|---|
| `algokit.toml` | AlgoKit project config: `type = "contract"`, `python_version = "3.12"` |
| `pyproject.toml` | `algorand-python`, `algorand-python-testing`, `pytest` dependencies |
| `src/escrow/escrow.py` | Stub — placeholder with comment noting P1 / x402 escrow purpose |
| `src/crest_token/crest_token.py` | Stub — placeholder with comment noting Phase 3 purpose |

### `.github/workflows`

| File | Content |
|---|---|
| `ci.yml` | `on: [pull_request, push to main]`. Jobs: `lint`, `type-check`, `test`, `build`, `migrate-check` |
| `deploy.yml` | `on: push to main`. Jobs: `docker-build`, `deploy` (Railway webhook). Runs after CI passes. |

---

## Database Schema (Plan 00 Baseline)

Plan 00 establishes the initial Prisma schema with the `User` model only. All other models are added by their respective plans (Plan 01 adds audit trail, Plan 03 adds `PortfolioSnapshot`, etc.).

**Critical fix applied here:** KYCStatus uses the canonical Plan 10 values (supersedes Plan 01's incorrect `VERIFIED/REJECTED`). This resolves GAP-03 from the architecture review.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String      @id @default(uuid()) @db.Uuid
  email             String      @unique
  name              String?
  googleId          String?     @unique

  // Turnkey — populated on wallet creation (Plan 01)
  turnkeySubOrgId   String?     @unique
  walletId          String?     @unique
  algorandAddress   String?     @unique

  // KYC — populated by Plan 10
  kycStatus         KYCStatus   @default(PENDING)
  didId             String?     @unique
  vcId              String?     @unique

  // JWT revocation — increment to invalidate all active sessions (GAP-09 fix)
  tokenVersion      Int         @default(1)

  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@map("users")
}

// Canonical KYCStatus values — Plan 10 values are the source of truth
enum KYCStatus {
  PENDING
  SUBMITTED
  APPROVED
  DECLINED
  RESUBMISSION_REQUESTED
  EXPIRED
}
```

**First migration:** Run once Plan 00 is complete:
```
pnpm --filter copilot-api prisma migrate dev --name init
```

---

## Key Architectural Constraints Enforced in Plan 00

These constraints are baked into the scaffold — they cannot be violated by later plans.

| Constraint | How Enforced |
|---|---|
| No floating-point money | ESLint rule bans `parseFloat`, `Number()`, `parseInt` on financial strings |
| No `any` in TypeScript | `@typescript-eslint/no-explicit-any` set to `error` |
| Standard response envelope | `ApiResponse<T>` type in `packages/shared` — all controllers use this |
| Pino structured logging | Logger factory enforced via `packages/shared/src/logger.ts` — no `console.log` allowed |
| Single Prisma client | `packages/shared/src/db.ts` singleton — no module creates its own `new PrismaClient()` |
| Single Redis client | `apps/copilot-api/src/lib/redis.ts` singleton — all modules import this |
| Env validation on startup | `src/config/env.ts` Zod schema — server will not start without valid config |
| No business logic in controllers | ESLint max-lines rule on controller files + architectural review gate |

---

## Definition of Done

Plan 00 is complete when:

- [ ] Repository is structured per the directory tree above
- [ ] `pnpm install` runs without errors from root
- [ ] `turbo run build` succeeds across all packages
- [ ] `turbo run lint` passes with zero errors
- [ ] `turbo run type-check` passes with zero errors
- [ ] `docker compose up` starts PostgreSQL + Redis + Bull Board successfully
- [ ] `prisma migrate dev` runs successfully and creates the `users` table
- [ ] `turbo run test` passes (env validation, logger, decimal helpers)
- [ ] `apps/copilot-api` starts (`pnpm dev`) and responds to `GET /health` with `{ status: 'ok' }`
- [ ] All 30+ env vars are documented in `.env.example`
- [ ] GitHub Actions CI pipeline runs on push and all jobs pass

---

## Addendum: Architecture Audit Remediations

The following additions address findings from `architecture_audit_v2.md` and `architecture_review.md`. All items below are **pre-implementation requirements** — resolve before sprint start.

---

### ADD-01 — BullMQ Retry, Backoff & Dead-Letter Queue Configuration

**Addresses:** NEW-10 (architecture_audit_v2.md)

All six BullMQ queues must use this default configuration:

```typescript
const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s → 10s → 20s
    },
    removeOnComplete: { age: 86400 }, // keep completed jobs for 24h
    removeOnFail: false, // retain failed jobs for inspection
  },
};
```

Dead-letter queue: Failed jobs after 3 attempts remain in the queue with status `failed`. Bull Board surfaces these. Alert (Sentry or Pino WARN) when any queue has > 0 failed jobs older than 1 hour.

Each engine plan must register its BullMQ worker explicitly:
- `portfolio-scan-queue` → Engine 1 worker
- `risk-analysis-queue` → Engine 2 worker
- `yield-discovery-queue` → Engine 4 worker
- `strategy-queue` → Engine 3 worker
- `execution-queue` → Engine 6 worker
- `audit-queue` → Audit Layer worker

---

### ADD-02 — PostgreSQL Connection Pooling

**Addresses:** NEW-02 (architecture_audit_v2.md)

Set `?connection_limit=25` in DATABASE_URL pattern. The Prisma singleton uses this limit.

```
DATABASE_URL=postgresql://user:pass@host:5432/crestflow?connection_limit=25
```

Six BullMQ workers + HTTP handlers sharing one Prisma client will exhaust the default pool (min: 2, max: 10) at ~20 concurrent users. The 25-connection limit supports MVP scale. For production: add PgBouncer.

---

### ADD-03 — Rate Limiting Middleware

**Addresses:** NEW-16 (architecture_audit_v2.md), instructions.md §11

Add `rate-limiter-flexible` (Redis-backed) to `pnpm add` dependencies.

Apply as Fastify hook in `apps/copilot-api/src/middleware/rate-limit.ts`:

| Scope | Limit | Window |
|---|---|---|
| Global (per IP) | 100 requests | 1 minute |
| Authenticated (per userId) | 500 requests | 1 minute |
| Copilot queries (per userId) | 20 queries | 1 minute |
| x402-paid endpoints | No additional rate limit | Payment is the gate |

Redis key pattern: `crestflow:ratelimit:{scope}:{identifier}`

---

### ADD-04 — Graceful Shutdown Handler

**Addresses:** NEW-17 (architecture_audit_v2.md)

`apps/copilot-api/src/server.ts` must implement:

```typescript
async function gracefulShutdown(signal: string) {
  logger.info({ event: 'shutdown_initiated', signal });
  
  // 1. Stop accepting new HTTP requests
  await app.close();
  
  // 2. Pause all BullMQ workers (finish current job, accept no new)
  await Promise.all(workers.map(w => w.pause()));
  await Promise.all(workers.map(w => w.close()));
  
  // 3. Disconnect Prisma
  await prisma.$disconnect();
  
  // 4. Disconnect Redis
  await redis.quit();
  
  logger.info({ event: 'shutdown_complete', signal });
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

Critical: A BullMQ job mid-execution during shutdown could produce a signed-but-not-broadcast transaction. `worker.pause()` ensures the current job completes before the worker stops.

---

### ADD-05 — CORS Policy Configuration

**Addresses:** NEW-08 (architecture_audit_v2.md)

```typescript
app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400,
});
```

`X-Payment` must be in allowedHeaders — x402 payment headers are sent cross-origin.

---

### ADD-06 — Prisma Migration Naming Convention

**Addresses:** NEW-14 (architecture_audit_v2.md)

Convention: `{plan_number}_{domain}_{change}`

Examples:
- `00_init_baseline_schema`
- `01_identity_add_user_table`
- `03_portfolio_add_snapshot_table`
- `04_risk_add_risk_snapshot`
- `05_strategy_add_strategy_snapshot`

Sequential migration enforced by PR gate: CI rejects PRs with conflicting migration timestamps.

---

### ADD-07 — Readiness Health Check

**Addresses:** OPS-01 (architecture_audit_v2.md)

Add `/health/ready` endpoint alongside existing `/health`:

```typescript
app.get('/health/ready', async (req, reply) => {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,           // PostgreSQL
    redis.ping(),                          // Redis
    // BullMQ: check queue connection
  ]);
  
  const allHealthy = checks.every(c => c.status === 'fulfilled');
  reply.status(allHealthy ? 200 : 503).send({
    status: allHealthy ? 'ready' : 'not_ready',
    checks: {
      postgres: checks[0].status === 'fulfilled',
      redis: checks[1].status === 'fulfilled',
    },
  });
});
```

Required for Railway/Render zero-downtime deploys.

---

### ADD-08 — Snapshot Retention Policy

**Addresses:** NEW-12 (architecture_audit_v2.md)

INSERT-only snapshot tables (`portfolio_snapshots`, `risk_snapshots`, `strategy_snapshots`, `yield_opportunity_snapshots`) grow unbounded. At 30-min polling × 1,000 users × 365 days = ~17.5M rows/year.

**Retention policy:**
- All snapshots: retained for 90 days (full resolution)
- Days 91–365: retain one snapshot per week (delete others via scheduled job)
- Beyond 365 days: retain one snapshot per month

Implemented as a BullMQ scheduled job running daily at 03:00 UTC:
- Queue: `maintenance-queue`
- Job: `snapshot-retention-cleanup`
- Must NOT delete the most recent snapshot for any user regardless of age

---

### ADD-09 — New Package Dependencies

Add to `apps/copilot-api/package.json`:

```bash
pnpm add rate-limiter-flexible   # Rate limiting (Redis-backed)
```

All other dependencies already specified in Plans 01–11.
