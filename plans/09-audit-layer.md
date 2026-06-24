# Plan 09 — Audit Layer

**Status:** Approved
**Priority:** P0 (must exist before any production execution)
**Depends on:**
- Plan 01 (Auth — `userId`, JWT)
- Plan 03–06 (all engines — emit events that produce audit entries)
- Plan 07 (Engine 5 — copilot query log, profile changes)
- Plan 08 (Engine 6 — all execution events are the primary audit source)

**Feeds into:**
- Engine 6 Policy Engine (KYC compliance gate — reads `kycStatus` from audit-adjacent identity layer)
- Dashboard (audit log viewer)
- Regulatory reporting (export)

---

## Objective

Every financial action, system event, and user-initiated change in CrestFlow must produce a permanent, tamper-evident, append-only audit record. The Audit Layer is:

1. **Not an engine** — it is a cross-cutting concern wired into every other engine via event listeners
2. **INSERT-only** — once written, audit records are never updated or deleted (enforced at DB level)
3. **Compliance-ready** — structured to support regulatory export, KYC trace linkage, and on-chain txID proof
4. **Passively populated** — no engine calls the audit layer directly; the audit layer listens to events

---

## Audit Entry Categories (10)

| Category | Source | Trigger |
|---|---|---|
| `AUTH` | Engine 0 (Auth) | Login, logout, wallet creation, token refresh |
| `PORTFOLIO_SCAN` | Engine 1 | PortfolioSnapshotCreated event |
| `RISK_ANALYSIS` | Engine 2 | RiskAnalysisCompleted event |
| `RISK_ALERT` | Engine 2 | RiskAlertCreated / RiskAlertResolved events |
| `STRATEGY_UPDATE` | Engine 3 | StrategyPlanCreated event |
| `YIELD_SCAN` | Engine 4 | YieldOpportunitiesUpdated event |
| `PROFILE_CHANGE` | Engine 5 | OnboardingCompleted, GoalProfileChanged, DriftThresholdExceeded events |
| `COPILOT_QUERY` | Engine 5 | Every copilot query (intent, model, confidence, tokens) |
| `EXECUTION` | Engine 6 | ExecutionConfirmed, ExecutionFailed, ExecutionBlocked, AutopilotEnabled/Disabled |
| `SYSTEM` | Infrastructure | Service start, config change, policy engine rule update |

---

## Database Schema

```prisma
model AuditEntry {
  id              String          @id @default(uuid()) @db.Uuid
  userId          String?         @db.Uuid       // null for SYSTEM entries
  category        AuditCategory
  action          String          // e.g. 'portfolio_scanned', 'execution_confirmed', 'goal_profile_changed'
  status          AuditStatus     @default(SUCCESS)

  // Contextual references (all optional — set where relevant)
  sourceEngine    String?         // 'engine1' | 'engine2' | ... | 'engine6' | 'auth' | 'system'
  relatedEntityId String?         @db.Uuid       // e.g. executionId, snapshotId, strategyId
  relatedTxId     String?         // Algorand txID (execution entries only)

  // Financial summary (for execution entries)
  valueUsd        String?         // DECIMAL — financial value of the action
  assetSymbol     String?         // primary asset involved
  protocol        String?         // 'folks-finance' | 'tinyman' | 'pact' | 'haystack'

  // Metadata — structured, queryable
  metadata        Json            // full payload snapshot (engine-specific)
  ipAddress       String?
  userAgent       String?

  // KYC/compliance linkage
  kycStatus       String?         // snapshot of user's kycStatus at time of action
  algorandAddress String?         // snapshot of wallet address at time of action

  // INSERT-only — no updates, no deletes
  createdAt       DateTime        @default(now())

  user            User?           @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([category, createdAt(sort: Desc)])
  @@index([relatedTxId])          // direct lookup by Algorand txID
  @@index([relatedEntityId])
  @@map("audit_entries")
}

enum AuditCategory {
  AUTH
  PORTFOLIO_SCAN
  RISK_ANALYSIS
  RISK_ALERT
  STRATEGY_UPDATE
  YIELD_SCAN
  PROFILE_CHANGE
  COPILOT_QUERY
  EXECUTION
  SYSTEM
}

enum AuditStatus {
  SUCCESS
  FAILURE
  BLOCKED
  PENDING
}
```

**Immutability enforcement (SQL):**
```sql
-- Revoke UPDATE and DELETE at database level
REVOKE UPDATE, DELETE ON audit_entries FROM crestflow_app;

-- Optional: row-level security to prevent even superuser deletes in production
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_entries FOR INSERT WITH CHECK (true);
```

---

## Audit Service

**File:** `audit/audit.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface AuditEntryPayload {
  userId?:          string;
  category:         AuditCategory;
  action:           string;
  status?:          AuditStatus;
  sourceEngine?:    string;
  relatedEntityId?: string;
  relatedTxId?:     string;
  valueUsd?:        string;
  assetSymbol?:     string;
  protocol?:        string;
  metadata:         Record<string, unknown>;
  ipAddress?:       string;
  userAgent?:       string;
  kycStatus?:       string;
  algorandAddress?: string;
}

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Write an audit entry. INSERT-only — this method never updates or deletes.
   * Fails silently (logs error) to avoid blocking the calling engine.
   * Audit failures must NEVER propagate to the user.
   */
  async write(payload: AuditEntryPayload): Promise<void> {
    try {
      await this.prisma.auditEntry.create({ data: payload as any });
    } catch (err: any) {
      // Audit failure must never crash the calling service
      logger.error({
        module: 'audit',
        event: 'write_failed',
        category: payload.category,
        action: payload.action,
        error: err?.message,
      });
    }
  }

  /**
   * Bulk write — for events that produce multiple audit entries atomically.
   * Still INSERT-only.
   */
  async writeBatch(payloads: AuditEntryPayload[]): Promise<void> {
    try {
      await this.prisma.auditEntry.createMany({ data: payloads as any });
    } catch (err: any) {
      logger.error({ module: 'audit', event: 'bulk_write_failed', count: payloads.length, error: err?.message });
    }
  }
}
```

---

## Event Listeners (Passive Population)

**File:** `audit/audit.listeners.ts`

The audit layer subscribes to every engine's event emitter. No engine imports the audit service directly — loose coupling via event bus.

```typescript
import { EventEmitter } from 'events';
import { AuditService } from './audit.service';

export function registerAuditListeners(eventBus: EventEmitter, audit: AuditService): void {

  // ─── Engine 1: Portfolio ────────────────────────────────────────────
  eventBus.on('PortfolioSnapshotCreated', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'PORTFOLIO_SCAN',
      action: 'portfolio_scanned',
      status: 'SUCCESS',
      sourceEngine: 'engine1',
      relatedEntityId: payload.snapshotId,
      metadata: {
        totalValueUsd: payload.totalValueUsd,
        healthScore: payload.healthScore,
        assetCount: payload.assetCount,
        isPartial: payload.isPartial,
        triggeredBy: payload.triggeredBy, // 'cron' | 'manual' | 'execution_confirmed'
      },
      algorandAddress: payload.algorandAddress,
    });
  });

  // ─── Engine 2: Risk ─────────────────────────────────────────────────
  eventBus.on('RiskAnalysisCompleted', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'RISK_ANALYSIS',
      action: 'risk_analyzed',
      status: 'SUCCESS',
      sourceEngine: 'engine2',
      relatedEntityId: payload.riskSnapshotId,
      metadata: {
        riskScore: payload.riskScore,
        riskLevel: payload.riskLevel,
        cvar95Percent: payload.cvar95Percent,
        alertsRaised: payload.alertsRaised,
      },
    });
  });

  eventBus.on('RiskAlertCreated', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'RISK_ALERT',
      action: 'risk_alert_raised',
      status: 'SUCCESS',
      sourceEngine: 'engine2',
      relatedEntityId: payload.alertId,
      metadata: { severity: payload.severity, title: payload.title, threshold: payload.threshold },
    });
  });

  // ─── Engine 3: Strategy ─────────────────────────────────────────────
  eventBus.on('StrategyPlanCreated', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'STRATEGY_UPDATE',
      action: 'strategy_computed',
      status: 'SUCCESS',
      sourceEngine: 'engine3',
      relatedEntityId: payload.strategyId,
      metadata: {
        model: payload.model,
        goalProfile: payload.goalProfile,
        rebalanceRequired: payload.rebalanceRequired,
        defensiveMode: payload.defensiveMode,
        actionCount: payload.actionCount,
      },
    });
  });

  // ─── Engine 4: Yield ────────────────────────────────────────────────
  eventBus.on('YieldOpportunitiesUpdated', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'YIELD_SCAN',
      action: 'yield_scan_completed',
      status: 'SUCCESS',
      sourceEngine: 'engine4',
      metadata: {
        opportunityCount: payload.opportunityCount,
        idleSignalCount: payload.idleSignalCount,
        totalIdleCostUsdPerYear: payload.totalIdleCostUsdPerYear,
        topProtocol: payload.topProtocol,
        topNetApyPercent: payload.topNetApyPercent,
      },
    });
  });

  // ─── Engine 5: User Intelligence ────────────────────────────────────
  eventBus.on('OnboardingCompleted', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'PROFILE_CHANGE',
      action: 'onboarding_completed',
      status: 'SUCCESS',
      sourceEngine: 'engine5',
      metadata: {
        investorPersona: payload.investorPersona,
        goalProfile: payload.goalProfile,
        normalizedScore: payload.normalizedScore,
      },
    });
  });

  eventBus.on('GoalProfileChanged', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'PROFILE_CHANGE',
      action: 'goal_profile_changed',
      status: 'SUCCESS',
      sourceEngine: 'engine5',
      metadata: {
        fromProfile: payload.fromProfile,
        toProfile: payload.toProfile,
        changedBy: payload.changedBy, // 'user' | 'drift_prompt'
      },
    });
  });

  // ─── Engine 6: Execution ─────────────────────────────────────────────
  eventBus.on('ExecutionConfirmed', async (payload) => {
    await audit.writeBatch(
      payload.txIds.map((txId: string, i: number) => ({
        userId: payload.userId,
        category: 'EXECUTION' as const,
        action: 'transaction_confirmed',
        status: 'SUCCESS' as const,
        sourceEngine: 'engine6',
        relatedEntityId: payload.executionId,
        relatedTxId: txId,
        valueUsd: payload.totalValueUsd,
        metadata: {
          executionId: payload.executionId,
          goalProfile: payload.goalProfile,
          stepCount: payload.stepCount,
          groupIndex: i,
          txId,
        },
        algorandAddress: payload.algorandAddress,
        kycStatus: payload.kycStatus,
      }))
    );
  });

  eventBus.on('ExecutionFailed', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'EXECUTION',
      action: 'execution_failed',
      status: 'FAILURE',
      sourceEngine: 'engine6',
      relatedEntityId: payload.executionId,
      metadata: { reason: payload.reason, failedGroupIndex: payload.failedGroupIndex },
    });
  });

  eventBus.on('ExecutionBlocked', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'EXECUTION',
      action: 'execution_blocked',
      status: 'BLOCKED',
      sourceEngine: 'engine6',
      relatedEntityId: payload.executionId,
      metadata: { reason: payload.reason, policyRule: payload.policyRule },
    });
  });

  eventBus.on('AutopilotEnabled', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'EXECUTION',
      action: 'autopilot_enabled',
      status: 'SUCCESS',
      sourceEngine: 'engine6',
      metadata: { goalProfile: payload.goalProfile, maxSingleTxnUsd: payload.maxSingleTxnUsd },
    });
  });

  eventBus.on('AutopilotDisabled', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'EXECUTION',
      action: 'autopilot_disabled',
      status: 'SUCCESS',
      sourceEngine: 'engine6',
      metadata: {},
    });
  });

  // ─── Auth ────────────────────────────────────────────────────────────
  eventBus.on('UserLoggedIn', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'AUTH',
      action: 'user_logged_in',
      status: 'SUCCESS',
      sourceEngine: 'auth',
      metadata: { provider: 'google' },
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      algorandAddress: payload.algorandAddress,
    });
  });

  eventBus.on('WalletCreated', async (payload) => {
    await audit.write({
      userId: payload.userId,
      category: 'AUTH',
      action: 'wallet_created',
      status: 'SUCCESS',
      sourceEngine: 'auth',
      metadata: { turnkeySubOrgId: payload.turnkeySubOrgId },
      algorandAddress: payload.algorandAddress,
    });
  });
}
```

---

## API Endpoints (4)

### GET /api/v1/audit/log

Returns the user's audit log with pagination and filtering.

**Query params:** `?category=EXECUTION&status=SUCCESS&limit=50&cursor=uuid&from=ISO8601&to=ISO8601`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "uuid",
        "category": "EXECUTION",
        "action": "transaction_confirmed",
        "status": "SUCCESS",
        "relatedTxId": "ABCDEF123...",
        "valueUsd": "623.40",
        "protocol": "folks-finance",
        "metadata": { "executionId": "uuid", "stepCount": 3 },
        "createdAt": "2026-06-24T10:45:00Z",
        "explorerUrl": "https://allo.info/tx/ABCDEF123..."
      }
    ],
    "nextCursor": "uuid",
    "total": 142
  }
}
```

### GET /api/v1/audit/log/:id

Single audit entry by ID.

### GET /api/v1/audit/execution/:executionId

All audit entries for a specific execution (all steps/txIDs).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "entries": [
      { "groupIndex": 0, "txId": "ABCDEF...", "status": "SUCCESS", "createdAt": "..." },
      { "groupIndex": 1, "txId": "GHIJKL...", "status": "SUCCESS", "createdAt": "..." }
    ]
  }
}
```

### GET /api/v1/audit/export

Export full audit log as JSONL (compliance/regulatory export). Returns streaming response.

**Query params:** `?from=ISO8601&to=ISO8601&category=all`

---

## Module File Structure

```
apps/copilot-api/src/modules/audit/
|-- audit.service.ts        <- write() + writeBatch() — INSERT-only
|-- audit.listeners.ts      <- event bus subscriptions for all 10 categories
|-- audit.controller.ts     <- HTTP handlers for 4 endpoints
+-- audit.routes.ts
```

---

## Testing Requirements

**`audit.service.test.ts`**
- `write()` → AuditEntry inserted with all fields
- `write()` failure → logs error, does NOT throw (never blocks caller)
- `writeBatch()` → all entries inserted in single query
- Verify UPDATE blocked at DB level (attempt fails with permission error)
- Verify DELETE blocked at DB level

**`audit.listeners.test.ts`**
- Each event → correct `category` + `action` + `metadata` written
- `ExecutionConfirmed` with 2 txIds → 2 audit entries created (writeBatch)
- Events with missing optional fields → entry written without error
- Event bus failure → isolated (does not affect calling engine)

---

## Logging

- `INFO` — audit entry written (category, action, userId)
- `ERROR` — audit write failed (never propagates to caller)
