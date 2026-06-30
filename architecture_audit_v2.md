# CrestFlow — Comprehensive Architecture Audit v2

**Reviewer Role:** Staff / Principal System Architect
**Audit Date:** 2026-06-30
**Review Depth:** Complete — all 13 project context files + Plans 00–11 + architecture_review.md
**Scope:** Pre-implementation architecture audit with full validation of prior findings

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Validation of Existing Findings](#2-validation-of-existing-findings)
3. [Newly Identified Gaps](#3-newly-identified-gaps)
4. [Missing Components](#4-missing-components)
5. [Missing Dependencies](#5-missing-dependencies)
6. [Security Risks](#6-security-risks)
7. [Scalability Risks](#7-scalability-risks)
8. [Operational Risks](#8-operational-risks)
9. [Data Architecture Risks](#9-data-architecture-risks)
10. [AI / Agent Architecture Risks](#10-ai--agent-architecture-risks)
11. [Blockchain and Smart Contract Risks](#11-blockchain-and-smart-contract-risks)
12. [Integration Risks](#12-integration-risks)
13. [Priority Matrix](#13-priority-matrix)
14. [Recommended Remediation Plan](#14-recommended-remediation-plan)
15. [Open Architectural Decisions Requiring Approval](#15-open-architectural-decisions-requiring-approval)

---

## 1. Executive Summary

CrestFlow's architecture is fundamentally sound: the Engine 1 canonical state layer, non-custodial Turnkey TEE signing, INSERT-only audit, Policy Engine mandatory gate, and event-driven inter-engine coordination are all correctly designed. The overall system is coherent and the domain boundaries are well-drawn.

**Status of prior review (architecture_review.md):**

- GAP-01 (Plan 00 missing): **Resolved** — Plan 00 written and approved.
- GAP-02 (Event Bus undefined): **Resolved** — BullMQ approved, queue names defined in Plan 00.
- GAP-03 (KYCStatus mismatch): **Resolved** — Plan 10 values confirmed canonical.
- GAP-04 (Gora Oracle contradiction): **Partially resolved** — documented in architecture_review.md but `instructions.md §8` and `mvp-context.md §14` remain contradictory in source files.
- GAP-05 through GAP-10: **Still open** — none formally resolved in any plan.
- Q01–Q17: **Most still open** — no explicit closure documented.

**10 new critical or high findings identified:**

1. AuditEntry schema missing from architecture.md — first migration may omit the table.
2. No PostgreSQL connection pooling plan — exhaustion under BullMQ + API concurrent load.
3. Engine 3 / Engine 4 protocol-selection handoff undefined — Engine 6 cannot determine which pool to target.
4. Behavioral drift score has no recomputation trigger — persona becomes static post-onboarding.
5. Daily execution volume limit has no Redis or DB persistence model.
6. x402 replay attack prevention not specified in Plan 11.
7. GoPlausible API, pricing, and SLA are undocumented — blocks Plans 10 and 11.
8. Haystack Router (@txnlab/deflex) availability on MainNet unconfirmed.
9. algosdk v3 breaking changes not validated against Plan 08 API calls.
10. Rate limiting not implemented in any plan despite being mandated by instructions.md §11.

---

## 2. Validation of Existing Findings

### GAP-01 — Missing Plan 00

**Status: RESOLVED.** Plan 00 committed at d74c62d.

---

### GAP-02 — Event Bus Technology Undefined

**Status: RESOLVED.** BullMQ 5.x selected. Six named queues defined in Plan 00.

**Remaining:** Each engine plan must explicitly register its BullMQ worker. No plan currently does this.

---

### GAP-03 — KYCStatus Enum Contradiction

**Status: RESOLVED.** Plan 10 values canonical. Plan 00 baseline schema uses them.

**Remaining:** Plan 01 still shows VERIFIED/REJECTED in its schema text — must be corrected before migration.

---

### GAP-04 — Gora Oracle Status Contradiction

**Status: PARTIALLY RESOLVED.** Decision recorded in architecture_review.md.

**Still present in source files:**
- `instructions.md §8`: "If Gora Oracle is unavailable: halt execution" — unchanged.
- `mvp-context.md §14`: Gora listed as "P1 — Active" — unchanged.

Any developer reading instructions.md will implement Gora as mandatory, blocking execution since Plan 02 stubs it.

---

### GAP-05 — Pact Adapter Scope Conflict

**Status: OPEN.** No explicit scope declaration added to Plan 08. LP_ADD/LP_REMOVE still lists "Tinyman V2 or Pact" as target.

---

### GAP-06 — No Smart Contract Architecture

**Status: PARTIALLY ADDRESSED.** Plan 00 creates packages/contracts/ with AlgoKit workspace.

Remaining: GoPlausible on-chain DID anchoring mechanism unspecified. ARC-4 calling conventions for Folks/Tinyman/Pact not documented.

---

### GAP-07 — No Monitoring Stack

**Status: PARTIALLY ADDRESSED.** Pino logging in Plan 00. OpenTelemetry, Prometheus, Sentry not specified in any plan. Trace propagation across BullMQ jobs not defined.

---

### GAP-08 — Turnkey Orphan Sub-Org Risk

**Status: OPEN.** Idempotency key mitigation NOT incorporated into Plan 01. Still marked "Acceptable for MVP."

If DB write fails after Turnkey succeeds, the wallet is permanently inaccessible without manual Turnkey support.

---

### GAP-09 — JWT Single Token, No Refresh Token

**Status: PARTIALLY RESOLVED.** tokenVersion field in Plan 00 Prisma schema closes the revocation gap.

Remaining: tokenVersion increment trigger not defined. No test in test.md for revocation. Plan 01 text not updated.

---

### GAP-10 — Event-Driven vs Synchronous Engine Calls

**Status: OPEN.** Plan 07 does not define the synchronous context assembly call sequence. Fallback for stale engine data not specified. New user with no strategy snapshot not handled.

---

## 3. Newly Identified Gaps

### NEW-01 — Audit Schema Missing from architecture.md

**Severity: Moderate**

architecture.md line ~849: "Schema to be added when execution pipeline is implemented."
Plan 09 defines the full AuditEntry schema. These are inconsistent.

The first Prisma migration follows architecture.md. If AuditEntry is not there, the table is omitted.

Action: Copy AuditEntry schema from Plan 09 into architecture.md before any migration runs.

---

### NEW-02 — No Connection Pooling Plan

**Severity: High**

Plan 00 Prisma singleton has default pool (min: 2, max: 10). Six BullMQ workers + HTTP handlers sharing one client will exhaust connections at ~20 concurrent users. architecture_review.md §8.1 mentions PgBouncer — no plan implements it.

Action: Set `?connection_limit=25` in DATABASE_URL. Document in Plan 00.

---

### NEW-03 — Engine 3 / Engine 4 Handoff Not Specified

**Severity: High**

Engine 3 produces action types (SWAP, LEND_DEPOSIT) without specific pool IDs. Engine 4 produces ranked opportunities per pool. Engine 6 must combine both to select where to deploy capital.

Neither Plan 05, Plan 06, nor Plan 08 specifies which component is responsible for protocol-pool selection.

Action: Define in Plan 08 POA Builder: consult latest Engine 4 YieldOpportunitySnapshot to resolve Engine 3 action types to specific pool IDs at execution time.

---

### NEW-04 — Behavioral Drift Score Recomputation Has No Trigger

**Severity: Moderate**

architecture.md: "behavioralDriftScore is recomputed on every new signal write from last 30 days."
Plan 07 defines BehavioralSignal writes but no recomputation trigger, BullMQ job, or persistence path.

Without this, drift score is set at onboarding and never updated — the persona is static.

Action: Add profile-update BullMQ queue. Trigger on every BehavioralSignal write.

---

### NEW-05 — Daily Execution Volume Limit Has No Persistence Model

**Severity: High**

Policy Engine enforces rolling 24h execution limits (CONSERVATIVE $5K, MODERATE $25K, AGGRESSIVE $100K). Plan 08 checks this but does not define where the rolling total is stored.

No Redis key structure defined. No DB index on ExecutionRecord for rolling window queries.

Action: Define Redis key `crestflow:exec-volume:{userId}` with INCRBY + EXPIRE 86400s. Policy Engine reads from Redis. Audit persists in ExecutionRecord.

---

### NEW-06 — Autopilot Table Without Functional Feature

**Severity: Low**

AutopilotConfig table + toggle endpoints exist in MVP plans. Autopilot execution is Phase 3.

Users can enable autopilot but it does nothing. No guard or user messaging exists in Plan 08.

Action: Add explicit guard in enable endpoint returning "Autopilot launches in Phase 3. Preference saved."

---

### NEW-07 — tasks.md Missing, design.md Empty

**Severity: Low**

project-context/tasks.md: does not exist.
project-context/design.md: 0 bytes.

Both listed as source documents. If tasks.md held design decisions they are undocumented.

---

### NEW-08 — No CORS Policy Defined

**Severity: Moderate**

Plan 00 registers @fastify/cors but does not configure it. No plan specifies allowed origins, methods, headers, or credentials. The x402 payment header is not listed in allowedHeaders.

---

### NEW-09 — CoinGecko ASA Registry Has No Fallback

**Severity: Moderate**

Plan 02 asset-registry.ts is a static ASA-to-CoinGecko mapping. Any unregistered ASA returns null price. The portfolio scan silently undervalues the portfolio with no user warning.

Action: Define supported ASA scope at MVP. Add fallback: if unmapped, flag as unmappedAssets in snapshot. Never silently omit.

---

### NEW-10 — No BullMQ Retry or Dead-Letter Queue Configuration

**Severity: High**

Plan 00 defines queues with no retry count, backoff strategy, or DLQ. BullMQ default on failure: mark failed, no retry. A rate-limited Nodely call fails once — portfolio scan stalls forever.

Action: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, `removeOnFail: false`. DLQ: crestflow:failed-jobs. Sentry alert on DLQ size > 0.

---

### NEW-11 — Copilot SSE Streaming Not Handled by x402 Middleware

**Severity: Moderate**

POST /copilot/query/stream is x402-gated (Plan 11 $0.10). SSE is a long-lived connection. Standard x402 pattern (verify → execute → respond) does not cleanly handle SSE reconnection or mid-stream payment failure.

Action: Specify in Plan 11: payment verified before stream opens. EventSource reconnection requires fresh payment header.

---

### NEW-12 — Portfolio Snapshot Storage is Unbounded

**Severity: Moderate**

INSERT-only snapshots with large JSONB payloads. At 30-min polling × 1,000 users × 365 days = ~17.5M rows/year. No retention or archival policy defined.

Action: Define retention policy — all snapshots for 90 days, weekly for 91–365 days, monthly beyond.

---

### NEW-13 — No API Versioning Strategy

**Severity: Low**

All routes at /api/v1/. No v2 introduction plan. Version compatibility for x402-paying MCP clients not considered. Low severity for MVP; critical before P2 external API launch.

---

### NEW-14 — No Prisma Migration Naming Convention

**Severity: Moderate**

Plan 00 uses --name init. No plan names subsequent migrations. Parallel development on Plans 03 and 04 will produce migration conflicts.

Action: Convention: `{plan_number}_{domain}_{change}` (e.g., `03_portfolio_add_snapshot_table`). Sequential migration enforced by PR gate.

---

### NEW-15 — GoPlausible API Not Documented

**Severity: High**

GoPlausible provides: DID creation (Plan 10), VC issuance (Plan 10), x402 payment facilitation (Plans 08, 11). No API docs, pricing, SDK, or SLA documented in any plan.

Risk: Single point of failure for both identity and monetization. Unknown cost per DID/VC affects unit economics.

Action: Obtain GoPlausible API docs + pricing before Plan 10 implementation begins.

---

### NEW-16 — Rate Limiting Not Implemented

**Severity: High**

instructions.md §11 mandates rate limiting. architecture_review.md §7.6 specifies exact limits. No plan implements it. Plan 00 does not include rate-limiter-flexible.

Action: Add rate-limiter-flexible (Redis-backed) to Plan 00. Apply as Fastify hook: 100 req/min per IP, 500 req/min per userId, 20 copilot queries/min per userId.

---

### NEW-17 — No Graceful Shutdown Specification

**Severity: Moderate**

No plan handles SIGTERM → drain → close DB → close Redis → exit. A BullMQ job mid-execution during shutdown could produce a signed-but-not-broadcast transaction.

Action: Plan 00 must specify: SIGTERM → worker.pause() → worker.close() → prisma.$disconnect() → redis.quit() → exit.

---

## 4. Missing Components

| Component | Missing From | Impact |
|---|---|---|
| AuditEntry schema in architecture.md | architecture.md | First migration omits the table |
| BullMQ retry/backoff/DLQ config | Plan 00 | Failed jobs stall without retry |
| Redis daily volume tracker | Plan 08 | Policy Engine limit unenforceable |
| Drift score recomputation trigger | Plan 07 | Persona static after onboarding |
| Connection pooling config | Plan 00 | PostgreSQL exhaustion under load |
| Graceful shutdown handler | Plan 00 | Mid-execution shutdown loses blockchain state |
| Rate limiting middleware | Plan 00 | No protection against abuse |
| CORS configuration | Plan 00 | Security or usability failure |
| Engine 3 → Engine 4 protocol selection logic | Plans 05, 06, 08 | Execution cannot select pool |
| ASA registry fallback | Plan 02 | Silently incomplete portfolio values |

---

## 5. Missing Dependencies

### Cross-Engine Dependencies Not Formally Declared

| Engine | Undocumented Dependency |
|---|---|
| Engine 6 POA Builder | Needs Engine 4 top opportunity per asset for pool selection |
| Audit Layer | Engine 6 must emit ExecutionBlocked event (not in domain events list) |
| Policy Engine | Needs rolling 24h volume from Redis (not defined) |
| Engine 5 drift scorer | Needs BullMQ trigger on BehavioralSignal write |
| x402 Middleware | Needs SSE-specific handling for Copilot streaming |

### External Service Dependencies Not Confirmed

| Dependency | Status | Risk |
|---|---|---|
| GoPlausible DID API | No SDK, no docs referenced anywhere | CRITICAL |
| GoPlausible x402 Facilitation | No facilitation SDK referenced | CRITICAL |
| @txnlab/deflex (Haystack Router) | Not verified on MainNet | HIGH |
| Folks Finance SDK | Version not pinned | Moderate |
| Tinyman SDK | Version not pinned | Moderate |
| Pact SDK | Version not pinned | Moderate |

---

## 6. Security Risks

### SEC-01 — x402 Replay Attack Prevention Unspecified (Critical)

Plan 11 defines x402 middleware with no double-spend prevention. Same payment proof replayed = unlimited free access.

Mitigation: Nonce-based prevention. Client generates UUID nonce per payment. Server checks Redis set `crestflow:x402:used-nonces` (TTL: 24h). Reject duplicates with 402.

---

### SEC-02 — Turnkey Address Derivation Not Verified (High)

Plan 01 stores Turnkey-returned algorandAddress without verifying it against the Ed25519 public key. A Turnkey misconfiguration could link the wrong address.

Mitigation: After wallet creation, `algosdk.encodeAddress(publicKey)` must equal the Turnkey-returned address. Throw on mismatch.

---

### SEC-03 — UPI ID Hashing Algorithm Unspecified (Moderate)

architecture.md says "stored hashed." Plan 10 does not specify the algorithm. Plain SHA-256 is rainbow-table-reversible for UPI IDs (limited format).

Mitigation: HMAC-SHA256 with server secret.

---

### SEC-04 — Veriff Webhook HMAC Key Rotation Unspecified (Moderate)

No plan defines zero-downtime key rotation for VERIFF_API_SECRET or alerting on HMAC verification failure.

---

### SEC-05 — Copilot Prompt Injection Risk (Moderate)

User input injected into system prompt without sanitization. No query length limit. "Ignore previous instructions" attack surface exists.

Mitigation: maxLength: 2000 on query. Detect and reject prompt injection patterns before LLM call.

---

### SEC-06 — No Explicit KYC Gate on Off-Ramp (High)

architecture.md states off-ramp requires kycStatus === APPROVED. Plan 11's endpoint catalogue does not include the off-ramp endpoint. No plan implements the KYC gate for off-ramp initiation.

Risk: User with kycStatus PENDING initiates fiat withdrawal without identity verification.

---

## 7. Scalability Risks

### SCALE-01 — Nodely Free Tier Blocks Multi-User Launch (Critical)

1 req/sec Algod, 1 req/sec Indexer. Two concurrent portfolio scans exceed limit immediately. No plan commits to Nodely paid ($99/month) before launch.

---

### SCALE-02 — CoinGecko Demo Limit (Moderate)

30 calls/min. Six concurrent scans with 5 unique assets each hits the limit. Redis cache is the primary defense but cold-start creates burst demand.

---

### SCALE-03 — Unbounded Snapshot Storage (High)

No retention policy. 1,000 users × 48 snapshots/day × 365 days = 17.5M rows/year with large JSONB payloads.

---

### SCALE-04 — BullMQ Queue Depth Not Monitored (Moderate)

Bull Board is included in Plan 00. No alert threshold defined. Backlog > 100 jobs = stale dashboards for extended periods.

---

### SCALE-05 — Copilot Context Assembly Has No Timeout (Moderate)

No Promise.race() or timeout on individual engine context fetches. Slow DB query blocks entire Copilot response.

Mitigation: 2-second timeout per engine fetch. Use cached last-known data on timeout. Flag contextStale: true.

---

## 8. Operational Risks

### OPS-01 — No Readiness Health Check (Moderate)

Only /health liveness endpoint. No readiness check (DB + Redis + BullMQ connected?). Required for Railway/Render zero-downtime deploy.

---

### OPS-02 — No Database Backup Strategy (High)

INSERT-only audit tables contain irreplaceable user financial history. No backup frequency, retention period, or PITR plan defined anywhere.

---

### OPS-03 — Veriff Free Check Exhaustion Unmonitored (Moderate)

500 free checks. No counter or alert. 501st user triggers KYC → silent billing failure.

---

### OPS-04 — No Secrets Rotation Procedure (Moderate)

TURNKEY_API_PRIVATE_KEY and JWT_SECRET have no rotation procedure. JWT_SECRET rotation invalidates all live sessions — no documented recovery path.

---

## 9. Data Architecture Risks

### DATA-01 — JSONB Analytics Limitation (Low)

Large JSONB portfolio payloads cannot be indexed for field-level queries. Acceptable for MVP. Must be revisited at P2 if cross-user aggregation queries are needed.

---

### DATA-02 — AssetCostBasis Has No Immutable History (Moderate)

asset_cost_basis is mutable (updated per transaction). If a realized PnL dispute arises, there is no record of the cost basis at the time of the taxable event.

Mitigation: Add asset_cost_basis_history (INSERT-only) triggered on every cost basis update.

---

### DATA-03 — No GDPR Account Deletion Strategy (Moderate)

User model has no deletedAt/isActive field. Hard-deleting a user with FK-linked audit and execution records will fail. GDPR right-to-erasure conflicts with INSERT-only audit immutability. No strategy defined.

---

### DATA-04 — UserGoalProfile and UserProfile.goalProfile are Redundant (Low)

Two models own goalProfile. They can desync. Engine 6 Policy Engine source of truth is ambiguous.

Mitigation: Eliminate UserGoalProfile. UserProfile.goalProfile is the single source of truth.

---

## 10. AI / Agent Architecture Risks

### AI-01 — LLM Context Window Size Not Validated (High)

Context estimate of ~3K tokens is not instrumented. A user with 15 assets, 5 protocol positions, and 10 conversation turns with detailed responses could exceed 8K tokens.

Mitigation: Log tokensUsed per request. Alert at > 8K. Define explicit token budget per context component (system 500, portfolio 800, risk 400, strategy 400, yield 400, history 800, query 200 = 3,500 total).

---

### AI-02 — No Copilot Response Number Validation (High)

instructions.md §9: "Copilot must never fabricate portfolio data." JSON mode validates structure, not values. LLM can hallucinate financial figures that differ from context data.

Mitigation: Cross-reference all numbers in LLM response against context data within 1% tolerance. Regenerate on mismatch.

---

### AI-03 — Gemini Fallback Has Different JSON Mode API (Moderate)

OpenAI JSON mode and Gemini structured output use different API patterns. Fallback without abstraction may produce malformed responses.

Mitigation: Unified LLM interface that normalizes JSON mode between providers.

---

### AI-04 — No MCP Tool Schema Annotations (Low for MVP, High for P2)

instructions.md §15: "MCP tools are first-class citizens." No plan defines any MCP schema. REST API designed without MCP consumers will be harder to adapt.

Mitigation: Annotate each engine route with `// MCP Tool: tool_name` for P2 schema generation.

---

## 11. Blockchain and Smart Contract Risks

### BC-01 — algosdk v3 Breaking Changes Not Validated (High)

algosdk 3.x has breaking changes from 2.x. makeApplicationCallTxnFromObject syntax changed. ABI patterns differ. Plan 08 API calls may reference v2 patterns.

---

### BC-02 — ARC-4 ABI Calling Conventions Not Documented (High)

Engine 6 must call Folks Finance, Tinyman V2, and Pact via ARC-4 ABI. No plan documents the exact method signatures. ABI mismatch → simulation failure → execution blocked.

---

### BC-03 — Atomic Group Size Not Validated (Moderate)

Max 16 txns per Algorand atomic group. Protocol calls may include inner transactions. No validator in POA Builder checks total count.

Mitigation: If step count > 12, split into sequential groups.

---

### BC-04 — No TestNet → MainNet Promotion Strategy (Moderate)

Folks Finance, Tinyman, and Pact have different contract IDs on TestNet vs MainNet. No plan verifies this mapping or defines the promotion process.

---

### BC-05 — Block Time Estimate Incorrect (Low)

Plan 08 uses 4,000ms per step. Actual Algorand block time is ~3,300ms. Minor UX inaccuracy.

---

## 12. Integration Risks

### INT-01 — UPI On/Off-Ramp Provider Not Finalized (Moderate)

Transak vs Ramp Network. Different APIs, webhook formats, and INR support characteristics. Plan 10 cannot begin until one is selected.

---

### INT-02 — Folks Finance SDK Version Not Pinned (High)

@folks-finance/algorand-sdk not version-pinned. V2 MainNet market support must be verified before Plan 02.

---

### INT-03 — Haystack Router Availability Unconfirmed (High)

@txnlab/deflex availability on npm and MainNet must be verified. SWAP action type in Engine 6 has no fallback if this library is unavailable or unmaintained.

---

### INT-04 — CoinGecko Not Mocked in Tests (Moderate)

CoinGecko requires API key even for demo tier. Tests should never make live HTTP calls. No test mock defined in any plan.

---

## 13. Priority Matrix

### Critical — Block Implementation

| ID | Finding |
|---|---|
| GAP-04 | Gora Oracle contradiction in source docs |
| GAP-08 | Turnkey orphan sub-org — no mitigation |
| NEW-01 | AuditEntry schema missing from architecture.md |
| NEW-05 | Daily execution volume limit — no persistence model |
| SEC-01 | x402 replay attack prevention unspecified |
| SEC-06 | No explicit KYC gate on off-ramp |
| NEW-15 | GoPlausible API undocumented |
| BC-01 | algosdk v3 breaking changes not validated |
| BC-02 | ARC-4 ABI calling conventions not documented |
| INT-03 | Haystack Router (@txnlab/deflex) availability unconfirmed |

### High — Resolve Before P0 Implementation

| ID | Finding |
|---|---|
| GAP-05 | Pact adapter scope conflict |
| GAP-10 | Copilot synchronous context assembly not designed |
| NEW-02 | No connection pooling |
| NEW-03 | Engine 3 / Engine 4 protocol selection gap |
| NEW-04 | Drift score no recomputation trigger |
| NEW-10 | BullMQ no retry/backoff/DLQ |
| NEW-11 | SSE not handled by x402 middleware |
| NEW-12 | Unbounded snapshot storage |
| NEW-16 | Rate limiting not implemented |
| NEW-17 | No graceful shutdown specification |
| SCALE-01 | Nodely free tier insufficient for launch |
| SEC-02 | Turnkey address not verified |
| OPS-02 | No database backup strategy |
| AI-01 | LLM context window size not validated |
| AI-02 | No Copilot response number validation |
| INT-02 | Folks Finance SDK version not pinned |

### Moderate — Resolve Before P1 Implementation

GAP-06, GAP-07, GAP-09, NEW-06, NEW-08, NEW-09, NEW-11, NEW-13, NEW-14, SEC-03, SEC-04, SEC-05, DATA-02, DATA-03, DATA-04, AI-03, BC-03, BC-04, OPS-01, OPS-03, INT-01, INT-04, SCALE-02, SCALE-05

### Low — Resolve Before Phase 2

NEW-13, DATA-01, BC-05, AI-04, OPS-04

---

## 14. Recommended Remediation Plan

### Phase 0: Pre-Implementation Document Updates (Week 0, no code)

1. Update instructions.md §8 — remove Gora halt-execution requirement; replace with CoinGecko as MVP price source.
2. Update mvp-context.md §14 — change Gora status from "P1 Active" to "P2 Stub only."
3. Add AuditEntry schema to architecture.md.
4. Add idempotency key strategy to Plan 01 (Turnkey orphan mitigation).
5. Add one-line Pact scope declaration to Plan 08.
6. Contact GoPlausible — obtain API docs, pricing, SLA before Plan 10 begins.
7. Verify @txnlab/deflex npm availability and MainNet support.
8. Verify algosdk v3 API patterns for all Plan 08 ABI calls.
9. Pin Folks Finance SDK version, verify V2 MainNet market list.
10. Eliminate UserGoalProfile — make UserProfile.goalProfile the single source of truth.
11. Update Plan 01 KYCStatus values from VERIFIED/REJECTED to APPROVED/DECLINED.

### Phase 0: Plan 00 Additions (before sprint start)

12. Add BullMQ retry config (attempts: 3, exponential backoff 5s, DLQ crestflow:failed-jobs).
13. Add rate-limiter-flexible (Redis-backed) as Fastify hook.
14. Add graceful shutdown handler (SIGTERM → pause → close → disconnect → exit).
15. Add CORS policy configuration.
16. Add connection_limit=25 to DATABASE_URL pattern.
17. Add readiness health check endpoint.
18. Add Prisma migration naming convention (plan_number_domain_change).

### Phase 1: Engine Implementation (Plans 01–06)

19. Add tokenVersion lifecycle documentation to Plan 01.
20. Add Turnkey address verification step to Plan 01.
21. Add ASA registry fallback behavior to Plan 02.
22. Add CoinGecko mock to test setup (no live HTTP in tests).
23. Add behavioral drift score BullMQ trigger to Plan 07.
24. Budget Nodely paid tier before Plan 03 integration tests hit live Indexer.
25. Add rolling 24h volume Redis key to Plan 08 Policy Engine section.

### Phase 2: Execution and Security (Plans 07–11)

26. Document Copilot synchronous context assembly call sequence in Plan 07.
27. Add token budget + monitoring to Plan 07.
28. Add number cross-reference validation to Plan 07.
29. Add x402 nonce-based replay prevention to Plan 11.
30. Add SSE-specific x402 middleware to Plan 11.
31. Add KYC gate to off-ramp endpoint in Plan 10.
32. Specify UPI ID HMAC-SHA256 hashing in Plan 10.
33. Add Engine 3 → Engine 4 → Engine 6 pool selection logic to Plan 08 POA Builder.
34. Add atomic group size validator to Plan 08 POA Builder.

---

## 15. Open Architectural Decisions Requiring Approval

| # | Decision | Impact | Urgency |
|---|---|---|---|
| AD-01 | Confirm Gora is P2. CoinGecko is MVP execution price source. Update source docs. | Blocks Plan 08 | CRITICAL |
| AD-02 | Confirm Pact execution is P2. Plan 08 LP_ADD/LP_REMOVE targets Tinyman V2 only. | Blocks Plan 08 scope | CRITICAL |
| AD-03 | GoPlausible API confirmed? Pricing, SDK, SLA. Fallback if unavailable? | Blocks Plans 10, 11 | CRITICAL |
| AD-04 | @txnlab/deflex confirmed production-ready on Algorand MainNet? Fallback SWAP path if not? | Blocks Plan 08 | CRITICAL |
| AD-05 | Eliminate UserGoalProfile. UserProfile.goalProfile is the single source of truth. | Blocks schema migration | HIGH |
| AD-06 | Daily execution volume: Redis rolling window confirmed as implementation. Key structure approved. | Blocks Plan 08 Policy Engine | HIGH |
| AD-07 | Snapshot retention policy: all 90 days, weekly to day 365, monthly beyond. Or alternative. | Affects DB cost at scale | HIGH |
| AD-08 | Copilot SSE streaming x402 model: pay per query before stream opens. Reconnection requires fresh payment header. | Blocks Plans 07 + 11 | HIGH |
| AD-09 | Confirm Transak as UPI on/off-ramp provider (vs Ramp Network). | Blocks Plan 10 | HIGH |
| AD-10 | Deployment platform: Railway vs Render vs self-hosted. Must decide before CI/CD finalized. | Blocks deploy.yml | HIGH |
| AD-11 | Analytics: PostHog vs alternative. Privacy policy for financial behavior events. | Blocks product validation | MEDIUM |
| AD-12 | Nodely paid tier ($99/month) budget confirmed before user-facing launch? | Blocks production | MEDIUM |
| AD-13 | GDPR right-to-erasure strategy. How is user deletion handled while preserving audit immutability? | Blocks production | MEDIUM |
| AD-14 | Copilot token budget per context component approved (system 500, portfolio 800, risk 400, strategy 400, yield 400, history 800, query 200). | Blocks Plan 07 | MEDIUM |
| AD-15 | Behavioral drift recomputation: inline synchronous on signal write, or async BullMQ job? | Blocks Plan 07 | MEDIUM |

---

*This document is a decision-review artifact. No source files were modified during this review. All findings and recommendations require explicit approval before implementation or documentation changes are made.*

*Sources reviewed: architecture.md, context.md, design.md (empty), flow.md, frontend-context.md, future-plans.md, instructions.md, mvp-context.md, prd.md, progress.md, srs.md, test.md (reviewed), tasks.md (missing), Plans 00–11, architecture_review.md.*
