# CrestFlow — Architecture, Technology & System Design Review

**Reviewer Role:** Staff / Principal System Architect  
**Review Date:** 2026-06-25  
**Source Documents:** Plans 01–11, `instructions.md`, `srs.md`, `prd.md`, `architecture.md`, `mvp-context.md`, `flow.md`, `context.md`, `future-plans.md`  
**Scope:** Pre-implementation review. No files modified. All findings are decision items.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Findings](#2-architecture-findings)
3. [Tech Stack Recommendations](#3-tech-stack-recommendations)
4. [Algorand Standards Review](#4-algorand-standards-review)
5. [API & Dependency Inventory](#5-api--dependency-inventory)
6. [Repository Structure Recommendation](#6-repository-structure-recommendation)
7. [Security Review](#7-security-review)
8. [Scalability Review](#8-scalability-review)
9. [Cost Review](#9-cost-review)
10. [Open Questions & Decisions Requiring Approval](#10-open-questions--decisions-requiring-approval)

---

## 1. Executive Summary

CrestFlow is a well-scoped, architecturally coherent system. The core design decisions — non-custodial via Turnkey TEE, Engine 1 as canonical state layer, Policy Engine as mandatory execution gate, INSERT-only audit, x402 per-call monetization — are sound and appropriate for this domain.

The plans are detailed and internally consistent. The primary concerns identified are:

**Critical (must resolve before implementation starts):**

1. **No Plan 00 (Monorepo + Tooling Setup) exists.** Plan 01 declares a dependency on it (`Depends on: Plan 00`). This is the first thing that must be built and there is no written plan for it.
2. **KYCStatus enum mismatch.** Plan 01 defines `PENDING | SUBMITTED | VERIFIED | REJECTED`. Plan 10 uses `PENDING | SUBMITTED | APPROVED | DECLINED | RESUBMISSION_REQUESTED | EXPIRED`. These are in the same database. They must be reconciled before schema migration.
3. **Turnkey orphan sub-org risk.** Plan 01 acknowledges that if DB write fails after Turnkey wallet creation, an orphaned sub-org remains with no reconciliation mechanism. Described as "acceptable for MVP" — this is a real data integrity risk that needs a defined mitigation (idempotency key or compensating transaction) before launch.
4. **Gora Oracle contradiction.** `instructions.md` §8 states "If Gora Oracle is unavailable: halt execution." `mvp-context.md` §14 lists Gora as "P1 — Active." Plan 02 defines Gora as a stub returning `null`. Plan 08 (execution) makes no reference to a live Gora integration. The execution pipeline as written proceeds without Gora. The contradiction between instructions and implementation must be officially resolved.
5. **No queue/event bus technology decided.** Plans reference events (`PortfolioScanTriggered`, `ExecutionConfirmed`, `StrategyPlanCreated`, etc.) as a core coordination mechanism. The implementation technology (in-process EventEmitter, BullMQ, or a proper message broker) is unspecified across all 11 plans. This is a significant architectural gap that affects execution reliability and engine isolation.

**Moderate (resolve before P0 implementation):**

6. No monitoring/observability stack defined.
7. No CI/CD stack defined.
8. No testing framework versions committed.
9. No smart contract architecture defined (Algorand Puya Python) despite on-chain identity, execution, and x402 flows.
10. Frontend framework confirmed as Vite/React SPA but no component library or state management library chosen.
11. Pact adapter included in Plan 02 and Plan 08 action types, but listed as "Deferred — MVP+" in MVP scope. Scope conflict.

**Low (resolve before P1 implementation):**

12. No vector database decision — Plan 07 correctly rules out RAG for MVP, but future MCP/agent tools may need semantic search.
13. No rate-limiting technology specified (per-user, per-endpoint).
14. Veriff 500-check free limit: no monitoring or alerting defined for this.
15. UPI on/off-ramp provider not finalized (Transak vs Ramp Network).

---

## 2. Architecture Findings

### 2.1 What is Sound

| Finding | Assessment |
|---|---|
| Engine 1 as canonical state layer | Correct. Prevents N-engines hitting the Indexer independently. |
| INSERT-only audit | Correct. DB-level enforcement (triggers + row-level security) is the right approach. |
| Policy Engine as last gate before execution | Correct. Non-bypassable by design. |
| Turnkey TEE for signing | Correct. Keys never touch CrestFlow servers. |
| In-context grounding over RAG (Plan 07) | Correct decision for MVP data volume. Context fits in ~3K tokens. |
| Rule-based persona scoring over ML clustering | Correct for MVP with no training data. P2 upgrade path is appropriate. |
| Redis graceful degradation (bypass, not crash) | Correct. Financial reads must not fail on cache layer failures. |
| Atomic group bundling for Algorand transactions | Correct. Algorand atomic groups up to 16 txns provide transaction integrity. |
| bigint for raw on-chain amounts, Decimal.js for computations | Correct. Prevents floating-point financial bugs. |
| Sliding 10-turn window for Copilot sessions | Correct. Prevents unbounded token growth with pinned context block. |

### 2.2 Architecture Gaps

#### GAP-01: Missing Plan 00 — Monorepo Setup

**Severity: Critical**

Plan 01 declares `Depends on: Plan 00 — Monorepo + Tooling Setup`. No such plan exists in the `plans/` directory. The monorepo structure (`apps/copilot-api`, `packages/shared`) is referenced throughout all plans but never formally specified. Before any implementation begins, Plan 00 must exist and cover:

- Monorepo tooling: Turborepo vs nx vs pnpm workspaces
- `apps/copilot-api` — Express/Node backend
- `packages/shared` — shared Prisma client, types, utilities
- `packages/adapters` or inline in `copilot-api` — protocol adapters
- Docker Compose base configuration (Postgres, Redis)
- ESLint + Prettier config
- TypeScript base tsconfig
- Environment variable management strategy

**Decision required: Approve monorepo structure and tooling before implementation starts.**

#### GAP-02: Event Bus / Queue Technology Undefined

**Severity: Critical**

Plans reference 18+ domain events (`UserOnboarded`, `PortfolioScanTriggered`, `StrategyPlanCreated`, `ExecutionConfirmed`, etc.) as the coordination mechanism between engines. The audit layer depends on these events. Engine 6 is triggered by events from Engines 3 and 4. Engine 1 is re-triggered after execution by Engine 6.

The plans do not specify whether events are:
- **In-process EventEmitter** — simplest, but loses events on process crash, no retry, no durability
- **BullMQ** (Redis-backed job queue) — durable, retry-capable, same Redis instance already in use
- **PostgreSQL LISTEN/NOTIFY** — DB-native, no extra infrastructure, limited throughput
- **External broker (RabbitMQ, NATS)** — most robust, most infrastructure overhead

For MVP with a monolithic deployment, **BullMQ on the existing Redis instance** is the recommended approach. It provides durability, retry, dead-letter queues, and monitoring via Bull Board — without adding a new infrastructure dependency.

**Decision required: Choose event bus technology before Plan 02/03 implementation.**

#### GAP-03: KYCStatus Enum Contradiction

**Severity: Critical**

Plan 01 schema defines:
```
enum KycStatus { PENDING | SUBMITTED | VERIFIED | REJECTED }
```

Plan 10 KYCApplication model uses:
```
status: KYCStatus (PENDING | SUBMITTED | APPROVED | DECLINED | RESUBMISSION_REQUESTED | EXPIRED)
```

`architecture.md` (canonical schema) uses the Plan 10 values: `APPROVED | DECLINED`. Plan 01's schema must be updated to match before any migration runs. There is one Prisma schema — one migration — the values must align before the first `prisma migrate deploy`.

**Decision required: Confirm Plan 10 KYCStatus values are canonical. Update Plan 01 schema pre-migration.**

#### GAP-04: Gora Oracle Status Contradiction

**Severity: Critical**

Three documents contradict each other on Gora:

| Document | Gora Status |
|---|---|
| `instructions.md` §8 | "If Gora Oracle is unavailable: halt execution" |
| `mvp-context.md` §14 | Gora Oracle: ✓ Active (P1) |
| Plan 02 | Stub — returns null; CoinGecko is pricing for MVP |
| Plan 08 | No live Gora integration in execution pipeline |
| `README.md` (updated) | Gora = P2 — stub only |

The README reflects the correct decision but `mvp-context.md` and `instructions.md` have not been updated. The practical consequence: if execution halts on Gora unavailability (per `instructions.md`), and Gora is a stub returning null (per Plan 02), then **execution can never work in MVP**.

**Decision required: Officially confirm CoinGecko as MVP execution price source. Document that Gora integration is P2. Update `instructions.md` §8 and `mvp-context.md` §16.**

#### GAP-05: Pact Adapter Scope Conflict

**Severity: Moderate**

Plan 02 implements a `pact.adapter.ts` in the Financial Knowledge Layer (position discovery). Plan 08 lists `LP_ADD` and `LP_REMOVE` with `"Tinyman V2 or Pact"` as supported protocols. `mvp-context.md` lists Pact as "MVP+ candidate — Deferred."

If Pact adapter is implemented in Plan 02 (for read-only position discovery) but not activated in execution (Plan 08), the scope needs to be explicitly declared: Pact is read-only in Plans 02/03 (discovery only), and execution via Pact is deferred to P2.

**Decision required: Clarify Pact adapter scope — read-only discovery in MVP, execution deferred.**

#### GAP-06: No Smart Contract Architecture

**Severity: Moderate**

CrestFlow relies on Algorand DeFi protocols (Folks Finance, Tinyman, Pact) which are Algorand smart contracts. The system also involves:
- GoPlausible DID and VC — anchored on Algorand
- x402 payment settlement on Algorand (via Goplusfable)
- Future: CREST Token (Phase 3)

No plan defines:
- Whether CrestFlow deploys any of its own smart contracts
- Which Algorand SDK version is used for transaction building
- Whether AlgoKit CLI is used for contract interaction
- The Algorand LocalNet/TestNet/MainNet environment strategy

The user has specified standardization on AlgoKit + Algorand Puya Python (Python smart contract standard). **Section 4 covers this in full.**

#### GAP-07: No Monitoring Stack

**Severity: Moderate**

`instructions.md` §19 specifies full observability: structured JSON logs, P50/P95/P99 latency metrics per endpoint, distributed traces across the full request path. No plan specifies the monitoring stack (logging library, metrics collector, tracing system, dashboards). This must be decided before implementation so observability is built in, not bolted on.

#### GAP-08: Turnkey Orphan Sub-Org Risk

**Severity: Critical**

Plan 01 §Business Logic acknowledges: "If DB write fails after Turnkey wallet creation, we have an orphan sub-org in Turnkey. Acceptable for MVP."

This is not acceptable for a financial system. If the DB write fails, the user's wallet exists in Turnkey but is unlinked from any CrestFlow user record. On retry, a new sub-org is created, the first one is permanently orphaned, and the wallet address is effectively unreachable.

**Mitigation required:** Use an idempotency key strategy — before creating the Turnkey sub-org, write a `wallet_provision_in_progress` record to the DB with a UUID. On Turnkey success, update the record to the sub-org ID. On DB failure, the provisioning record is the reconciliation handle. This must be specified in Plan 01 before implementation.

#### GAP-09: JWT Single Token — No Refresh Token

**Severity: Moderate**

Plan 01 specifies 7-day JWT with no refresh token. On expiry, the user re-authenticates via Google. For a financial platform, 7-day sessions are long and single-token architecture means:
- No mechanism to invalidate a specific session (e.g., on suspected compromise)
- Token revocation requires either a blocklist (adds DB lookup to every request) or short expiry

**Recommendation:** Keep 7-day access token for MVP, but add a stateless revocation flag via user version field (`tokenVersion: Int` in User model). JWT includes `tokenVersion`. On suspicious activity, increment `tokenVersion` — all existing tokens become invalid. Low overhead, no blocklist required.

#### GAP-10: Event-Driven Architecture vs. Synchronous Engine Calls

**Severity: Moderate**

The architecture documents describe event-driven inter-engine communication. However, the Copilot (Plan 07) must assemble multi-engine context (Portfolio + Risk + Strategy + Yield) synchronously in response to a natural language query. These two modes must coexist:

- **Asynchronous**: Engine 6 triggers Engine 1 rescan via event after execution
- **Synchronous**: Copilot assembles context from all engines in real-time

This dual-mode pattern is valid but must be explicitly designed. Engines must expose both event-based interfaces (for async updates) and direct service interfaces (for sync context assembly). The Copilot's "call sequence" for context assembly is not documented in Plan 07.

---

## 3. Tech Stack Recommendations

### 3.1 Frontend

| | |
|---|---|
| **Recommendation** | React 19 + Vite 6 |
| **Version** | React 19.0, Vite 6.x |
| **Rationale** | Plan 01 explicitly specifies Vite/React SPA. Google OAuth uses token-based (not redirect-based) flow specifically because of this. Confirmed. |
| **State Management** | Zustand 5.x — lightweight, TypeScript-native, no boilerplate |
| **Data Fetching** | TanStack Query 5.x — server state management, caching, polling |
| **Component Library** | shadcn/ui (built on Radix UI) — accessible, unstyled primitives, full control over design system |
| **Charts** | Recharts 2.x — React-native, well-documented, sufficient for portfolio charts |
| **Pros** | Fast HMR, minimal bundle size, full control over styling, no framework lock-in |
| **Cons** | No SSR (not needed — authenticated SPA), no file-based routing (use React Router v7) |
| **Alternatives** | Next.js 15 (overkill for auth-gated SPA), Remix (same) |
| **Approval Required** | Yes — confirm Zustand + TanStack Query as state management |

### 3.2 Backend Framework

| | |
|---|---|
| **Recommendation** | Node.js 22 LTS + Express 5.x |
| **Version** | Node 22 LTS, Express 5.0 |
| **Rationale** | Plan 01 file structure shows Express routing. Plans use `express` middleware pattern. Plans show `apps/copilot-api` — single backend service. |
| **Pros** | Mature ecosystem, minimal overhead, TypeScript support, fastest path to production |
| **Cons** | No built-in DI container, no opinionated structure (mitigated by domain-driven module structure already defined in plans) |
| **Alternatives** | Fastify 5 (faster, better TS support — viable drop-in), NestJS (too opinionated, conflicts with DDD approach in plans), Hono (edge-native, good option if edge deployment ever considered) |
| **Recommendation** | Consider **Fastify 5** over Express 5 — same patterns, 2–3x faster throughput, native TypeScript, better Zod integration. Requires no architectural change. |
| **Approval Required** | Yes — Express 5 vs Fastify 5 |

### 3.3 Database

| | |
|---|---|
| **Recommendation** | PostgreSQL 16 |
| **Version** | PostgreSQL 16.x |
| **Rationale** | Explicitly specified in Plan 01. All plans use Prisma with PostgreSQL datasource. |
| **Pros** | ACID compliance, row-level security (RLS) for INSERT-only audit enforcement, excellent Prisma support, mature |
| **Cons** | Requires connection pooling at scale (PgBouncer or Supabase pooler) |
| **Connection Pooling** | PgBouncer or use Supabase/Neon (managed Postgres) for pooling built-in |
| **Approval Required** | No — confirmed |

### 3.4 ORM

| | |
|---|---|
| **Recommendation** | Prisma 6.x |
| **Version** | Prisma 6.x |
| **Rationale** | Explicitly specified across all plans. Singleton client pattern in `packages/shared/src/db.ts`. |
| **Pros** | Type-safe client, excellent migrations, schema-first, strong Algorand address type support via `String` |
| **Cons** | Prisma Client can be slow for complex queries at scale — use raw SQL via `prisma.$queryRaw` for hot paths |
| **Important Note** | Prisma does not natively support `DECIMAL` type — monetary strings stored as `String` @db.Numeric(38,18) for precision. Confirm this pattern across all engine schemas. |
| **Approval Required** | No — confirmed |

### 3.5 Cache

| | |
|---|---|
| **Recommendation** | Redis 7.x via ioredis |
| **Version** | Redis 7.2, ioredis 5.x |
| **Rationale** | Plan 02 explicitly specifies `ioredis`. Used for: data cache (TTL-based), Copilot session state (sliding window), rate limiting (token bucket), BullMQ job queues. |
| **Key Namespaces** | `crestflow:knowledge:{key}`, `crestflow:session:{userId}`, `crestflow:ratelimit:{userId}`, `crestflow:queue:{queueName}` |
| **Pros** | Multi-purpose: cache + session + queue + rate-limiting in one service |
| **Cons** | Single Redis is a SPOF — configure with replica for production |
| **Approval Required** | No — confirmed |

### 3.6 Queue / Event System

| | |
|---|---|
| **Recommendation** | BullMQ 5.x on existing Redis instance |
| **Version** | BullMQ 5.x |
| **Rationale** | 18+ domain events are referenced across all plans with no implementation technology specified. BullMQ reuses the existing Redis instance (no new infra), provides durability, retry with exponential backoff, dead-letter queues, and Bull Board UI for monitoring. |
| **Queue Design** | `portfolio-scan-queue`, `risk-analysis-queue`, `strategy-queue`, `execution-queue`, `audit-queue` |
| **Pros** | Durable jobs survive process restarts, built-in retry logic, monitoring UI, no extra infra |
| **Cons** | Redis coupling — queue durability depends on Redis persistence (`appendonly yes` already specified in Plan 02) |
| **Alternatives** | Node EventEmitter (fragile — loses events on crash), PostgreSQL LISTEN/NOTIFY (simpler, no retry), NATS (overkill for MVP) |
| **Approval Required** | Yes — this is a critical unspecified gap. Approval needed. |

### 3.7 AI / Agent Framework

| | |
|---|---|
| **Recommendation** | Direct SDK calls — no agent framework |
| **Version** | openai 5.x, @google/generative-ai 0.x |
| **Rationale** | Plan 07 correctly identifies that RAG and agent frameworks are unnecessary for this use case. The Copilot is an intent classifier + context assembler + LLM caller. The "routing" is deterministic (intent → engine), not agent-style. LangChain/LlamaIndex would add abstraction with no benefit. |
| **Primary LLM** | GPT-4.1-mini (OpenAI) — confirmed in Plan 07 |
| **Fallback LLM** | Gemini 3.5 Flash — confirmed in Plan 07 |
| **Fallback Trigger** | OpenAI 429 (rate limit) or 5xx → automatic switch to Gemini |
| **Structured Output** | Use OpenAI JSON mode + Zod schema validation on response |
| **Pros** | Minimal dependencies, full control over prompt engineering, deterministic routing |
| **Cons** | No built-in tool use / function calling orchestration — must implement manually |
| **Approval Required** | No — confirmed |

### 3.8 Embeddings & Vector Database

| | |
|---|---|
| **Recommendation (MVP)** | Not required |
| **Rationale** | Plan 07 correctly eliminates RAG for MVP. Portfolio context fits in LLM context window. |
| **Recommendation (P2)** | pgvector extension on existing PostgreSQL for semantic search over audit history and strategy recommendations |
| **Alternative (P2)** | Pinecone or Qdrant if cross-user semantic search is needed |
| **Approval Required** | No — defer to P2 |

### 3.9 Authentication

| | |
|---|---|
| **Recommendation** | Google OAuth (token-based) + JWT HS256 |
| **Version** | google-auth-library 9.x, jsonwebtoken 9.x |
| **Rationale** | Plan 01 confirmed. Token-based (not redirect-based) because frontend is a Vite SPA. |
| **Token Strategy** | 7-day JWT with `tokenVersion` revocation field (see GAP-09 above) |
| **Approval Required** | Partial — tokenVersion revocation strategy needs approval |

### 3.10 KYC

| | |
|---|---|
| **Recommendation** | Veriff (primary) |
| **Version** | Veriff Web SDK (latest) + REST webhook |
| **Rationale** | Confirmed in Plan 10. 500 free checks available. Webhook HMAC-SHA256 signature verification. |
| **Document Support** | Aadhaar, PAN, Passport — India-first |
| **DID/VC** | GoPlausible (Algorand-native DID + VC) |
| **Approval Required** | No — confirmed |

### 3.11 Monitoring & Observability

| | |
|---|---|
| **Recommendation** | Pino (logging) + OpenTelemetry (tracing) + Prometheus (metrics) + Grafana (dashboards) |
| **Versions** | Pino 9.x, @opentelemetry/sdk-node 0.x, prom-client 15.x |
| **Rationale** | `instructions.md` §19 mandates structured JSON logging, P95 latency metrics per endpoint, distributed traces. This stack satisfies all three requirements with no vendor lock-in. |
| **Structured Logging** | Pino — fastest Node.js JSON logger, built-in log levels, child loggers per request |
| **Metrics** | prom-client — exposes `/metrics` for Prometheus scraping |
| **Tracing** | OpenTelemetry with OTLP exporter — vendor-agnostic, works with Jaeger, Grafana Tempo, Datadog |
| **Dashboards** | Grafana — portfolio scan duration, engine compute time, x402 payment success rate |
| **Alternatives** | Datadog (commercial, simpler setup, higher cost), Sentry (good for error tracking, add regardless) |
| **Add Sentry** | Yes — Sentry 8.x for error tracking and release health alongside Pino/OTel |
| **Approval Required** | Yes — monitoring stack not specified in any plan |

### 3.12 Analytics

| | |
|---|---|
| **Recommendation** | PostHog (self-hosted or cloud) |
| **Rationale** | Product analytics for hypothesis validation (H1–H5 in `mvp-context.md`). Track: copilot query frequency, recommendation acceptance rate, idle capital alert action rate, execution funnel. |
| **Pros** | Open source, feature flags, session recording, product analytics in one |
| **Cons** | Self-hosting adds infra; cloud has privacy implications for financial data |
| **Privacy Note** | Do NOT send portfolio values or addresses to analytics. Track behavioral events only. |
| **Approval Required** | Yes |

### 3.13 Testing

| | |
|---|---|
| **Recommendation** | Vitest (unit + integration) + Supertest (API) + Playwright (E2E) |
| **Versions** | Vitest 2.x, Supertest 7.x, Playwright 1.x |
| **Rationale** | `instructions.md` §20 mandates 80% coverage minimum, 95%+ for financial/risk/execution. Vitest is the modern replacement for Jest — faster, native ESM, Vite-aligned, same API. |
| **Financial Regression Tests** | Vitest with golden value fixtures — same inputs must always produce same outputs |
| **Contract Tests** | Use `zod` schemas as runtime contracts at engine boundaries |
| **Algorand Integration Tests** | AlgoKit LocalNet for all execution pipeline tests |
| **Approval Required** | No — confirm Vitest over Jest |

### 3.14 CI/CD

| | |
|---|---|
| **Recommendation** | GitHub Actions |
| **Rationale** | Repository is on GitHub (confirmed from git remote). Native integration. |
| **Pipeline** | `test → lint → type-check → build → migration-check → deploy` |
| **Deploy Target** | Railway or Render for MVP (simpler than AWS/GCP for initial launch). Migrate to AWS ECS or GCP Cloud Run at scale. |
| **Secrets Management** | GitHub Actions secrets for CI. Doppler or AWS Secrets Manager for production. |
| **Approval Required** | Yes — deployment infrastructure not specified |

### 3.15 Infrastructure

| | |
|---|---|
| **Recommendation (MVP)** | Containerized monolith on Railway or Render |
| **Stack** | Docker + Docker Compose (dev), Railway/Render (production) |
| **Services** | copilot-api (Node), PostgreSQL 16, Redis 7 |
| **Rationale** | MVP is a single `apps/copilot-api` service. No microservices split needed. Railway/Render handle SSL, env management, Postgres + Redis add-ons, zero-downtime deploys, no ops overhead. |
| **Scale Path** | When engines need independent scaling, extract to separate services with same Postgres + Redis. CI/CD pipeline needs no change — only deployment config changes. |
| **Approval Required** | Yes — deployment platform decision |

---

## 4. Algorand Standards Review

The user has specified standardization on AlgoKit (latest) and Algorand Puya Python for smart contracts.

### 4.1 Current Algorand Stack in Plans

| Component | Technology in Plans | Status |
|---|---|---|
| Transaction building | `algosdk` (TypeScript) | Specified in Plan 08 |
| Indexer queries | Algorand Indexer REST API via Nodely | Specified in Plan 02 |
| algod (node) | Nodely free endpoints | Specified in Plan 02 |
| Transaction simulation | `algod.simulateTransaction()` | Specified in Plan 08 |
| Transaction signing | Turnkey `ACTIVITY_TYPE_SIGN_TRANSACTION_V2` | Specified in Plan 08 |
| Smart contracts | Not specified (none planned for MVP) | Gap |
| GoPlausible DID | Algorand-anchored (exact mechanism unspecified) | Gap |

### 4.2 Smart Contract Architecture

CrestFlow does not deploy its own smart contracts for MVP — it *interacts* with existing contracts (Folks Finance, Tinyman, Pact). However, future features require CrestFlow-owned contracts:

| Feature | When | Contract Type |
|---|---|---|
| CREST Token | Phase 3 | ARC-20 fungible token (Puya Python) |
| x402 escrow (if Goplusfable uses on-chain escrow) | P1 | Escrow application (Puya Python) |
| Autonomous autopilot pre-authorization | Phase 3 | Smart signature / delegated signing (LSIG) |
| GoPlausible VC anchoring | P1 | Existing GoPlausible contracts — CrestFlow calls them via ABI |

**Recommendation: Define the contract boundary now even though MVP doesn't deploy contracts.**

### 4.3 AlgoKit Standards

| Standard | Recommendation |
|---|---|
| Contract language | Algorand Puya Python (confirmed by user) |
| Contract framework | AlgoKit CLI — project init, build, deploy, test |
| Contract testing | `algorand-python-testing` (official Puya test framework) |
| ABI compliance | ARC-4 ABI for all contract methods |
| Contract structure | One contract per concern — no monolithic contracts |
| Artifacts | Compile to ARC-32 application spec + TEAL for deployment |

### 4.4 Algorand SDK Strategy (TypeScript, Plan 08)

| Concern | Recommendation |
|---|---|
| SDK version | `algosdk` 3.x (latest stable — breaking changes from 2.x) |
| Transaction building | Use `algosdk.makeApplicationCallTxnFromObject` for ABI calls to Folks/Tinyman/Pact |
| Atomic groups | `algosdk.assignGroupID()` — confirmed in Plan 08 architecture |
| Simulation | `algod.simulateTransaction(simulateRequest)` with `allowUnnamedResources: true` for pre-validation |
| Encoding | MsgPack via algosdk — confirmed in Plan 08 |
| Block time assumption | ~3.3 seconds (Algorand is not exactly 4s as Plan 08 assumes — minor) |

**Note:** Plan 08 uses `steps.length * 4000` ms as estimated duration. Algorand block time is ~3.3s, not 4s. Minor correction but affects UX estimates.

### 4.5 Indexer Strategy

| Concern | Recommendation |
|---|---|
| Provider | Nodely (formerly AlgoNode) — free public endpoints confirmed in Plan 02 |
| Algod URL | `https://mainnet-api.4160.nodely.dev` |
| Indexer URL | `https://mainnet-idx.4160.nodely.dev` |
| Rate limits | Free tier: 1 req/sec Algod, 1 req/sec Indexer — inadequate for multi-user production |
| Upgrade path | Nodely paid plan ($99/month for 100 req/sec) or QuickNode Algorand ($49/month) |

**Risk:** Free Nodely endpoints at 1 req/sec will be a hard bottleneck once multiple users trigger portfolio scans simultaneously. Redis caching in Plan 02 mitigates this significantly (cache per address per TTL), but concurrent new users will hit rate limits. Paid Nodely must be budgeted before launch.

### 4.6 LocalNet / TestNet / MainNet Strategy

| Environment | Purpose | Configuration |
|---|---|---|
| **LocalNet** (AlgoKit) | Unit tests, engine tests, execution pipeline tests | `algokit localnet start` — deterministic, fast, free |
| **TestNet** | Integration tests with live Folks Finance/Tinyman TestNet deployments | Nodely TestNet endpoints — free |
| **MainNet** | Production and AI accuracy | Nodely paid endpoints |

**Recommendation:** All Plan 08 execution tests run against AlgoKit LocalNet. No mainnet testing in CI. TestNet integration tests run in a dedicated CI stage before production deploy.

**Critical Constraint for AI Engines:**
TestNet should **only** be used for testing the execution pipeline (Engine 6) and basic API integrations. The intelligence layer (Engine 1, Engine 2, Engine 4, and the Copilot) will **not** function accurately on TestNet because TestNet liquidity pools are shallow, APYs are meaningless/volatile, and pricing data (CoinGecko) does not map correctly to TestNet tokens. The final MVP **must** run on MainNet to provide accurate insights, risk scores, and yield opportunities.

### 4.7 Event Monitoring Strategy

CrestFlow needs to detect on-chain events (execution confirmations, LP position changes, protocol state changes) beyond what the portfolio scan discovers.

| Approach | Recommendation |
|---|---|
| Execution confirmation | Poll `algod.pendingTransactionInformation(txId)` — confirmed in Plan 08 (within 3 rounds) |
| Portfolio change detection | Periodic re-scan triggered by BullMQ scheduled job (e.g., every 30 minutes per active user) |
| Liquidation monitoring | Periodic Folks Finance API poll + risk threshold check — Engine 2 |
| Protocol state changes | DefiLlama TVL monitoring (P2.4 in future-plans.md) |
| On-chain event subscription | Not currently planned — Algorand Indexer polling is sufficient for MVP |

---

## 5. API & Dependency Inventory

### 5.1 External APIs and Services

| Service | Purpose | Free Tier | Paid Tier | Rate Limit | Fallback |
|---|---|---|---|---|---|
| **Nodely Algod** | Transaction broadcast, simulation | 1 req/sec | $99/mo (100 req/sec) | 1 req/sec free | None — required |
| **Nodely Indexer** | On-chain data (holdings, positions, txns) | 1 req/sec | Included in paid | 1 req/sec free | None — required |
| **CoinGecko** | Asset pricing, market data | Demo: 30 calls/min | Pro: $129/mo (500/min) | 30/min demo | Cache aggressively (60s TTL) |
| **Folks Finance API** | Lending/borrowing positions, APYs | Free (public) | N/A | Unknown — no published limit | Cache (5min TTL) |
| **Tinyman API** | LP positions, pool APYs, swap rates | Free (public) | N/A | Unknown | Cache (5min TTL) |
| **Pact API** | LP positions, pool analytics | Free (public) | N/A | Unknown | Cache (5min TTL) |
| **Turnkey** | TEE wallet creation, signing | Usage-based | $0.001/signing op | N/A | None — critical path |
| **Veriff** | KYC document + liveness + AML | 500 free checks | $3–5/check | N/A | Sumsub (P2 alternative) |
| **GoPlausible** | DID creation, VC issuance, x402 facilitator | TBD | TBD | TBD | None — critical path |
| **OpenAI** | GPT-4.1-mini (Copilot primary) | $0 / pay-as-you-go | ~$0.0004/1K tokens | Tier-based | Gemini Flash |
| **Google Gemini** | Gemini 3.5 Flash (Copilot fallback) | 15 req/min free | $0.075/1M tokens | 15 req/min free | None (it is the fallback) |
| **Transak / Ramp Network** | UPI on-ramp + off-ramp | N/A | 0.5–2% transaction fee | N/A | The other provider |

### 5.2 Required Environment Variables

```
# Database
DATABASE_URL                   # PostgreSQL connection string

# Redis
REDIS_URL                      # Redis connection string

# Auth
JWT_SECRET                     # 256-bit random secret for JWT signing
JWT_EXPIRY                     # e.g. "7d"
GOOGLE_CLIENT_ID               # Google OAuth client ID
GOOGLE_CLIENT_SECRET           # Google OAuth client secret

# Turnkey
TURNKEY_API_BASE_URL           # https://api.turnkey.com
TURNKEY_API_PUBLIC_KEY         # Parent org API public key
TURNKEY_API_PRIVATE_KEY        # Parent org API private key (NEVER client-exposed)
TURNKEY_ORGANIZATION_ID        # Parent org ID

# Algorand
ALGORAND_ALGOD_URL             # e.g. https://mainnet-api.4160.nodely.dev
ALGORAND_INDEXER_URL           # e.g. https://mainnet-idx.4160.nodely.dev
ALGORAND_ALGOD_TOKEN           # Empty string for Nodely free
ALGORAND_NETWORK               # 'mainnet' | 'testnet' | 'localnet'

# CoinGecko
COINGECKO_API_KEY              # Demo or Pro key

# OpenAI
OPENAI_API_KEY                 # sk-...

# Google AI (Gemini fallback)
GOOGLE_AI_API_KEY              # Gemini API key

# Veriff
VERIFF_API_KEY                 # Veriff API key
VERIFF_API_SECRET              # For webhook HMAC-SHA256 signature verification

# GoPlausible
GOPLAUSIBLE_API_KEY            # GoPlausible API key
GOPLAUSIBLE_API_URL            # GoPlausible base URL

# UPI On/Off Ramp
TRANSAK_API_KEY                # Transak API key (or RAMP_NETWORK_API_KEY)
TRANSAK_ENVIRONMENT            # 'STAGING' | 'PRODUCTION'

# x402 / Goplusfable
GOPLUSFABLE_FACILITATOR_URL    # Goplusfable endpoint
GOPLUSFABLE_API_KEY            # Goplusfable API key

# Application
NODE_ENV                       # 'development' | 'test' | 'production'
PORT                           # e.g. 3001
FRONTEND_URL                   # CORS allowed origin
API_VERSION                    # '1.0'

# Monitoring
SENTRY_DSN                     # Sentry DSN
OTLP_ENDPOINT                  # OpenTelemetry collector endpoint
```

### 5.3 Secrets Classification

| Secret | Exposure Risk | Storage |
|---|---|---|
| `TURNKEY_API_PRIVATE_KEY` | Catastrophic — allows wallet creation | Production secrets manager only |
| `JWT_SECRET` | Critical — allows forging any session | Secrets manager |
| `DATABASE_URL` | Critical — full DB access | Secrets manager |
| `OPENAI_API_KEY` | Moderate — billing risk | Secrets manager |
| `VERIFF_API_SECRET` | Moderate — webhook forgery risk | Secrets manager |
| All others | Standard | `.env` + secrets manager in production |

---

## 6. Repository Structure Recommendation

The current plans reference `apps/copilot-api` and `packages/shared` but no formal monorepo structure exists. The following is the recommended final structure.

```
CrestFlow-Platform/
├── .github/
│   └── workflows/
│       ├── ci.yml                     # test + lint + type-check on PR
│       └── deploy.yml                 # build + migrate + deploy on main
│
├── apps/
│   ├── copilot-api/                   # Main backend — Express/Fastify
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── identity/          # Plan 01 — auth, Turnkey, JWT
│   │   │   │   ├── knowledge/         # Plan 02 — data adapters, cache, price service
│   │   │   │   ├── portfolio/         # Plan 03 — Engine 1
│   │   │   │   ├── risk/              # Plan 04 — Engine 2
│   │   │   │   ├── strategy/          # Plan 05 — Engine 3
│   │   │   │   ├── yield/             # Plan 06 — Engine 4
│   │   │   │   ├── intelligence/      # Plan 07 — Engine 5 + Copilot
│   │   │   │   ├── execution/         # Plan 08 — Engine 6
│   │   │   │   │   ├── poa.builder.ts
│   │   │   │   │   ├── policy.engine.ts
│   │   │   │   │   ├── simulation.gate.ts
│   │   │   │   │   ├── signing.service.ts
│   │   │   │   │   └── execution.coordinator.ts
│   │   │   │   ├── audit/             # Plan 09 — audit layer
│   │   │   │   └── kyc/               # Plan 10 — KYC, DID, on/off-ramp
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts    # JWT verification
│   │   │   │   ├── x402.ts            # Plan 11 — payment gate
│   │   │   │   ├── rate-limit.ts      # per-user + per-endpoint
│   │   │   │   └── request-logger.ts  # Pino request logging
│   │   │   ├── queues/
│   │   │   │   ├── portfolio-scan.queue.ts
│   │   │   │   ├── risk-analysis.queue.ts
│   │   │   │   ├── execution.queue.ts
│   │   │   │   └── audit.queue.ts
│   │   │   ├── events/
│   │   │   │   └── domain.events.ts   # All 18+ domain event types
│   │   │   ├── lib/
│   │   │   │   ├── algorand.ts        # algosdk client singleton
│   │   │   │   ├── redis.ts           # ioredis singleton
│   │   │   │   └── openai.ts          # OpenAI + Gemini clients
│   │   │   ├── app.ts                 # Express/Fastify app factory
│   │   │   └── server.ts              # Entry point
│   │   ├── prisma/                    # Move schema here
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                           # Frontend — Vite + React
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── stores/                # Zustand stores
│       │   ├── queries/               # TanStack Query hooks
│       │   └── lib/
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── shared/                        # Shared types + utilities
│   │   ├── src/
│   │   │   ├── types/                 # Canonical types (AssetHolding, etc.)
│   │   │   ├── decimal.ts             # Decimal.js helpers
│   │   │   └── errors.ts              # Shared error codes
│   │   └── package.json
│   │
│   └── contracts/                     # Algorand smart contracts (Puya Python)
│       ├── src/
│       │   ├── crest_token/           # Phase 3 — ARC-20 token
│       │   └── escrow/                # P1 — if x402 needs on-chain escrow
│       ├── tests/
│       ├── algokit.toml
│       └── pyproject.toml
│
├── project-context/                   # All documentation (unchanged)
├── plans/                             # All 11 plans (unchanged)
├── docker-compose.yml                 # PostgreSQL + Redis + Bull Board
├── turbo.json                         # Turborepo config
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

**Key decisions this structure encodes:**
- Prisma schema lives in `apps/copilot-api/prisma/` (not `packages/shared`) — one service owns the DB
- Smart contracts in `packages/contracts/` as a separate workspace — built with AlgoKit
- Queues are first-class code in `src/queues/` — not an afterthought
- Frontend is a separate `apps/web/` workspace — clean separation

---

## 7. Security Review

### 7.1 Non-Custodial Architecture

**Status: Sound**

Turnkey TEE approach is correctly implemented. `TURNKEY_API_PRIVATE_KEY` is a server-side secret. Client never sees it. `walletId` (not private key) is stored in PostgreSQL. Signing happens via Turnkey API — CrestFlow never holds the key material.

**Gap:** Plan 01 does not verify the Turnkey-returned `algorandAddress` against the wallet's actual public key before storing it. Add an address derivation check: the address returned by Turnkey must match the expected Algorand address derived from the Ed25519 public key.

### 7.2 Execution Security

**Status: Mostly sound, one gap**

The 5-layer execution pipeline (POA → Policy → Simulation → Signing → Coordinator) is correctly ordered. Policy Engine before simulation is intentional (reject before spending compute on simulation).

**Gap:** There is no maximum transaction size cap at the algosdk encoding layer. The Policy Engine checks USD value, but a user with extreme slippage settings could encode a transaction that passes policy but fails simulation with an unexpected amount. The simulation gate catches this — but it's worth adding an explicit byte-size sanity check on encoded transactions before submission.

### 7.3 x402 Payment Security

**Status: Requires clarification**

Plan 11 defines the middleware pattern but does not specify:
- How the x402 payment header is verified (Goplusfable API call? On-chain verification?)
- What happens if Goplusfable is unreachable — does the endpoint return 402 (fail-closed) or allow through (fail-open)?
- Double-spend prevention: can the same payment proof be replayed across multiple requests?

**Requirement:** x402 middleware must fail-closed. If Goplusfable verification fails or is unreachable, the request is rejected with 402. Never fail-open on payment verification.

### 7.4 KYC Data Security

**Status: Correct**

Plan 10 correctly: stores only KYC status and metadata (not raw documents), verifies Veriff webhook HMAC-SHA256, hashes UPI IDs before storage. This aligns with `instructions.md` §17.

**Gap:** The audit entry for KYC events stores `kycStatus` as a snapshot string. Ensure this never includes the raw `providerDecision` string verbatim if it contains PII about the user's document rejection reason.

### 7.5 JWT Security

**Status: Adequate for MVP, one improvement**

7-day JWT with no refresh token is a known trade-off. The `tokenVersion` revocation mechanism recommended in GAP-09 adds session invalidation without a blocklist. Implement this before P1 (execution requires secure sessions).

### 7.6 Rate Limiting

**Status: Specified in instructions, not implemented in any plan**

`instructions.md` §11 mandates rate limiting on all endpoints. No plan specifies the rate limiting implementation. **Recommendation:** Use Redis token bucket via `ioredis` or `rate-limiter-flexible` library. Apply:
- Global: 100 req/min per IP
- Authenticated: 500 req/min per userId
- x402 endpoints: no additional rate limit (payment is the gate)
- Copilot: 20 queries/min per userId (LLM cost control)

### 7.7 Webhook Security

**Status: Correct in Plan 10, must apply universally**

Veriff webhook: HMAC-SHA256 signature verification — correct.

Transak/Ramp Network webhooks: same pattern must apply but is not specified in Plan 10's on/off-ramp section. Both providers supply a webhook signature — verify it before processing any payment completion.

---

## 8. Scalability Review

### 8.1 MVP Architecture — Appropriate Scope

The MVP is a correctly scoped monolith. All six engines in one `copilot-api` process is the right starting point. Premature microservices would add operational overhead with no benefit at MVP scale.

**Bottlenecks identified:**

| Bottleneck | Severity | Mitigation |
|---|---|---|
| Nodely free tier (1 req/sec) | High — blocks multi-user portfolio scans | Paid Nodely before launch |
| CoinGecko demo (30 calls/min) | Moderate — cache aggressively | 60s TTL cache in Plan 02 |
| OpenAI rate limits | Moderate — Gemini fallback covers | Implement fallback correctly |
| Single Redis instance | Moderate — SPOF at scale | Redis replica in production |
| Single PostgreSQL instance | Moderate — connection exhaustion | PgBouncer or Supabase pooler |
| BullMQ queue depth (not yet defined) | Unknown — no queue design exists | Define queue concurrency limits |

### 8.2 Portfolio Scan Concurrency

A portfolio scan for one user requires:
- 1 Indexer call (holdings)
- 1 Folks Finance API call (positions)
- 1 Tinyman API call (LP positions)
- N CoinGecko calls (pricing per unique asset)

For 100 concurrent users scanning simultaneously: 100 Indexer calls/sec (rate limit: 1/sec). The Redis cache must be the primary defense. Cache portfolio data per `algorandAddress` with 5-minute TTL. Only trigger live scan on explicit user refresh (x402-gated at $0.005 in Plan 11).

### 8.3 Scale-Out Path

When individual engines need independent scaling (after significant user growth):

1. Extract each engine's module into a separate `apps/engine-N/` service
2. Communication switches from direct service calls to queue messages (already designed)
3. Each engine scales horizontally behind a load balancer
4. Shared PostgreSQL + Redis remain as coordination points
5. No architectural changes needed — the domain boundaries in the current design enable this

**This is the correct design.** The current monolith can be split without rewriting business logic.

---

## 9. Cost Review

### 9.1 MVP Monthly Cost Estimate

| Service | Tier | Estimated Monthly Cost |
|---|---|---|
| Railway / Render (hosting) | Starter plan (2 services: API + DB) | $20–40/month |
| Nodely Algod + Indexer | **Must upgrade** to paid — $99/month | $99/month |
| CoinGecko | Demo (free) — upgrade to Pro if >30 calls/min needed | $0–129/month |
| OpenAI GPT-4.1-mini | ~$0.0004/1K tokens × estimated 10M tokens/month | ~$4/month |
| Google Gemini Flash | Fallback — minimal usage | ~$0–1/month |
| Veriff | 500 free checks → ~$3-5/check after | $0 for first 500 |
| GoPlausible | TBD — DID/VC costs unknown | Unknown |
| Transak / Ramp Network | 0.5–2% fee on transactions (not CrestFlow's cost) | $0 (pass-through) |
| Sentry | Free tier (5K errors/month) | $0 |
| **Total MVP (low)** | | **~$125/month** |
| **Total MVP (high, Veriff exhausted)** | | **~$400/month** |

### 9.2 Turnkey Costs

Turnkey pricing: sub-org creation is free. Signing operations are charged per signature (~$0.001/signature). Each execution action involves 1–3 signing calls. At 1,000 executions/month: ~$1–3/month. Negligible at MVP scale.

### 9.3 GoPlausible Cost — Unknown

GoPlausible DID creation and VC issuance costs are not documented in any plan and were not discoverable. **This must be confirmed before P1 implementation.** If GoPlausible charges per DID or per VC issuance, this is a per-user cost that could affect unit economics significantly.

**Action item: Contact GoPlausible for pricing before Plan 10 implementation.**

### 9.4 x402 Revenue Potential

At $0.01 per copilot query (Plan 11 pricing), 10,000 queries/month = $100 revenue. At $0.10 per execution, 1,000 executions/month = $100 revenue. x402 is designed to cover compute costs (OpenAI) and platform margin — not profit at MVP scale. This is the correct expectation.

---

## 10. Open Questions & Decisions Requiring Approval

| # | Question | Impact | Approval Required |
|---|---|---|---|
| **Q01** | **Plan 00 (Monorepo + Tooling) must be written.** What monorepo tool: Turborepo vs nx vs pnpm workspaces? What is the full apps/packages structure? | Blocks all implementation | Yes — critical |
| **Q02** | **Event bus technology.** Confirm BullMQ on Redis as the queue/event system. Or choose alternative. | Blocks engine communication design | Yes — critical |
| **Q03** | **KYCStatus enum values.** Plan 01 uses `VERIFIED/REJECTED`. Plan 10 uses `APPROVED/DECLINED/RESUBMISSION_REQUESTED/EXPIRED`. Which values are canonical? Prisma schema must align before first migration. | Blocks Plan 01 schema | Yes — critical |
| **Q04** | **Gora Oracle in MVP.** Officially confirm: Gora is a stub in MVP, CoinGecko is the execution price source. Update `instructions.md` §8 and `mvp-context.md` §14/§16. | Blocks Plan 08 implementation | Yes — critical |
| **Q05** | **Turnkey orphan sub-org mitigation.** Confirm idempotency key strategy before Plan 01 implementation. | Data integrity risk | Yes — critical |
| **Q06** | **Backend framework.** Express 5 (confirmed in plans) vs Fastify 5 (recommended — same patterns, faster). | Minor — pick one before Plan 01 | Yes |
| **Q07** | **UPI on/off-ramp provider.** Transak vs Ramp Network. Both support INR. Final choice affects API keys and integration work. | Blocks Plan 10 | Yes |
| **Q08** | **Pact adapter scope.** Confirm: Pact adapter in Plan 02 is read-only position discovery only. Execution via Pact is deferred to P2. This resolves the Plan 08 action type conflict. | Blocks Plan 02/08 | Yes |
| **Q09** | **Deployment infrastructure.** Railway vs Render vs AWS vs GCP for MVP. | Blocks CI/CD setup | Yes |
| **Q10** | **Monitoring stack.** Confirm: Pino + OpenTelemetry + Prometheus + Grafana + Sentry. Or alternative. | Must be set up before first production deploy | Yes |
| **Q11** | **GoPlausible pricing.** Contact GoPlausible to confirm DID/VC issuance costs before Plan 10 implementation. | Affects unit economics | Yes — before Plan 10 |
| **Q12** | **Nodely paid tier.** Confirm budget for Nodely paid ($99/month) before launch. Nodely free (1 req/sec) will not scale beyond a handful of concurrent users. | Blocks production readiness | Yes |
| **Q13** | **JWT tokenVersion revocation.** Add `tokenVersion: Int @default(1)` to User model. Increment on logout/suspicious activity. Include in JWT claims. | Security improvement | Yes — before P1 execution |
| **Q14** | **Analytics tool.** PostHog (recommended) or alternative. Behavioral events only — no financial data to analytics services. | Product validation | Yes |
| **Q15** | **x402 double-spend prevention.** How does Goplusfable prevent the same payment proof from being replayed? This must be confirmed in the Goplusfable integration spec before Plan 11 implementation. | Security — financial loss risk | Yes — before Plan 11 |
| **Q16** | **Algorand block time correction.** Plan 08 uses 4,000ms per group. Actual block time is ~3,300ms. Minor — correct before implementation or accept the conservative estimate. | Minor UX accuracy | No — accept or fix |
| **Q17** | **Copilot synchronous context assembly.** Plan 07 does not document the call sequence for multi-engine context assembly (which engine is called first, how failures are handled, what happens if one engine has no data). This must be specified before Plan 07 implementation. | Blocks Copilot correctness | Yes |

---

*This document is a decision-review artifact. No source files were modified. All recommendations and findings require explicit approval before implementation or documentation changes are made.*
