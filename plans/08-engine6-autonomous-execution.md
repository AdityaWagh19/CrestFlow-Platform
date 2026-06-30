# Plan 08 — Engine 6: Autonomous Execution Engine

**Status:** Approved
**Priority:** P0
**Depends on:**
- Plan 01 (Auth + Turnkey — sub-org wallet, Turnkey signing API)
- Plan 02 (Financial Knowledge Layer — protocol adapters already initialized)
- Plan 03 (Engine 1 — portfolio snapshot, ASA holdings, opt-in state)
- Plan 04 (Engine 2 — risk score gate)
- Plan 05 (Engine 3 — `StrategyPlanCreated` event → primary trigger)
- Plan 06 (Engine 4 — `YieldOpportunitiesUpdated` event → secondary trigger)
- Plan 07 (Engine 5 — `goalProfile`, `investorPersona`, transaction limits per profile)

**Feeds into:**
- Engine 1 (emits `ExecutionConfirmed` → triggers fresh portfolio scan)
- Engine 5 (behavioral signal: `ACTED_ON_REBALANCE`)

---

## Objective

Engine 6 is the autonomous execution layer. It takes approved strategy/yield actions and executes them on-chain against Algorand DeFi protocols. It is the only engine that writes to the blockchain.

Engine 6 does three things:

1. **Plan** — Convert an abstract action ("rebalance: sell 15% ALGO, buy USDC, deposit to Folks") into a concrete, ordered Plan of Action (POA) with exact step types, amounts, protocol targets, and dependency ordering
2. **Validate** — Run every planned action through the Policy Engine (hard limits, slippage caps, risk gate, protocol allowlist, goal profile gate) and through `algod.simulateTransaction()` (chain-state validation)
3. **Execute** — Sign via Turnkey, broadcast atomically to Algorand, confirm within 3 rounds, write audit record

**Key properties:**
- **No private keys on CrestFlow servers** — all signing via Turnkey TEE
- **No MEV risk** — Algorand has no mempool (instant finality, ~3.3s)
- **Fail-closed** — any policy check or simulation failure blocks execution entirely
- **INSERT-only audit trail** — every action, every txID, every failure written permanently

---

## Scope: Supported Action Types (7)

| Action | Protocol | Description |
|---|---|---|
| `SWAP` | Haystack Router | Token A → Token B. Best price across Tinyman + Pact atomically |
| `LEND_DEPOSIT` | Folks Finance | Deposit asset to lending pool → receive fTokens |
| `LEND_WITHDRAW` | Folks Finance | Burn fTokens → withdraw asset |
| `LP_ADD` | Tinyman V2 or Pact | Add liquidity → receive LP tokens |
| `LP_REMOVE` | Tinyman V2 or Pact | Burn LP tokens → receive both assets back |
| `OPT_IN` | Algorand protocol | Opt account into ASA (auto-prepended when required) |
| `NO_OP` | — | Drift below rebalance threshold — no action |

### Pact Scope Clarification

**Addresses:** GAP-05 (architecture_review.md)

Pact adapter scope for MVP:
- **Plan 02 (Financial Knowledge Layer):** Pact adapter is **read-only** — position discovery and APY data collection only
- **Plan 08 (Engine 6 Execution):** Pact execution (LP_ADD, LP_REMOVE via Pact) is **deferred to P2**
- The `LP_ADD` and `LP_REMOVE` action types in the table above target **Tinyman V2 only** at MVP
- Pact builder (`builders/pact.builder.ts`) is included as a P2 stub — it throws `Error('Pact execution is deferred to P2')` if called

This resolves the scope conflict between Plan 02 (which implements Pact read) and Plan 08 (which lists Pact as an execution target).

---

## Architecture: 5 Layers

```
[Trigger]
  StrategyPlanCreated event  (Engine 3)
  YieldOpportunitiesUpdated event  (Engine 4)
  POST /api/v1/execute/submit  (manual user trigger)
         │
         ▼
[Layer 1: Orchestrator / POA Builder]
  Convert abstract action → ordered step graph
  Resolve dependencies (OPT_IN before transfer, SWAP before LEND_DEPOSIT)
  Bundle steps into Algorand atomic groups (max 16 txns per group)
         │
         ▼
[Layer 2: Policy Engine]
  Hard transaction limit check (max USD per txn)
  Daily volume limit check (rolling 24h window)
  Protocol allowlist check (Folks/Tinyman/Pact/Haystack only)
  Risk score gate (Engine 2 score vs goal profile cap)
  Slippage cap check (CONSERVATIVE: 0.5%, MODERATE: 1%, AGGRESSIVE: 2%)
  Goal profile action gate (CONSERVATIVE: no LP)
  High-value approval gate (> $2,000 → pause + notify)
         │
         ▼
[Layer 3: Simulation Gate]
  algod.simulateTransaction() on each planned txn group
  Catch: reverts, slippage failures, opt-in failures, insufficient balance
  If ANY simulation fails → block execution, surface error
         │
         ▼
[Layer 4: Signing (Turnkey)]
  Encode transactions as MsgPack
  Submit to Turnkey ACTIVITY_TYPE_SIGN_TRANSACTION_V2 (sub-org API)
  Verify returned signature against expected public key
         │
         ▼
[Layer 5: Execution Coordinator]
  Broadcast signed txns to Algorand via algod.sendRawTransaction()
  Poll pendingTransactionInformation() — confirm within 3 rounds (~10s)
  Write ExecutionRecord (INSERT-only)
  Emit ExecutionConfirmed event → Engine 1 portfolio rescan
  Record behavioral signal → Engine 5 (ACTED_ON_REBALANCE)
```

---

## Layer 1: Orchestrator / POA Builder

### Action Types and Dependencies

```
Dependencies (must execute in order):
  OPT_IN       → must precede any transfer into an un-opted account
  SWAP         → must precede LEND_DEPOSIT if source token ≠ target token
  LEND_DEPOSIT → must follow SWAP if token conversion needed
  LP_REMOVE    → must precede SWAP if LP tokens need to be liquidated first
  LEND_WITHDRAW → must precede SWAP if fTokens need to be redeemed first
```

### Step graph example (rebalance: overweight ALGO, underweight USDC):

```
Input: "Sell 15% ALGO, buy USDC, deposit to Folks Finance USDC lending"

Step graph:
  [1] OPT_IN (USDC)         → if account not opted into USDC ASA
  [2] SWAP (ALGO → USDC)    → via Haystack router (15% of ALGO balance)
  [3] LEND_DEPOSIT (USDC)   → Folks Finance USDC pool

Dependencies: 1 → 2 → 3 (strictly sequential)
Bundling: steps 1+2 may be atomic (if Haystack handles the OPT_IN internally)
          step 3 is a separate atomic group (different protocol)
```

### POA Builder

**File:** `execution/poa.builder.ts`

```typescript
import Decimal from 'decimal.js';

export type ActionType = 'SWAP' | 'LEND_DEPOSIT' | 'LEND_WITHDRAW' | 'LP_ADD' | 'LP_REMOVE' | 'OPT_IN' | 'NO_OP';

export interface POAStep {
  stepIndex:       number;
  actionType:      ActionType;
  protocol:        'folks-finance' | 'tinyman' | 'pact' | 'haystack' | 'algorand';
  fromAssetId:     number;              // 0 = ALGO
  toAssetId:       number | null;       // null for single-asset operations
  fromAmountMicro: string;             // DECIMAL in microunits
  toAmountMinMicro: string | null;     // minimum received (slippage-adjusted)
  estimatedValueUsd: string;           // DECIMAL
  dependsOn:       number[];           // stepIndex[] of required predecessors
  atomicGroupIndex: number;            // which atomic group this step belongs to
  metadata:        Record<string, unknown>; // protocol-specific params (pool ID, market ID, etc.)
}

export interface PlanOfAction {
  executionId:     string;
  userId:          string;
  sourceEventType: 'StrategyPlanCreated' | 'YieldOpportunitiesUpdated' | 'MANUAL';
  sourceEventId:   string;
  goalProfile:     string;
  steps:           POAStep[];
  totalValueUsd:   string;             // DECIMAL — sum of all step values
  estimatedFeesAlgo: string;           // DECIMAL — total tx fees
  estimatedDurationMs: number;         // expected wall-clock time
  createdAt:       string;
}

/**
 * Builds a Plan of Action from an abstract rebalancing action set.
 * Resolves dependencies, checks ASA opt-in state, assigns atomic group indices.
 */
export async function buildPOA(params: {
  userId: string;
  actions: RebalancingAction[];        // from Engine 3 StrategySnapshot.rebalancingActions
  currentHoldings: AssetHolding[];     // from latest PortfolioSnapshot
  goalProfile: string;
  sourceEventType: PlanOfAction['sourceEventType'];
  sourceEventId: string;
  algodClient: algosdk.Algodv2;
}): Promise<PlanOfAction> {
  const steps: POAStep[] = [];
  let stepIndex = 0;
  let groupIndex = 0;

  for (const action of params.actions) {
    if (action.urgency === 'NONE') continue;

    // Check opt-in requirement for target asset
    const needsOptIn = !(await isOptedIn(params.currentHoldings, action.targetAssetId));
    if (needsOptIn) {
      steps.push({
        stepIndex: stepIndex++,
        actionType: 'OPT_IN',
        protocol: 'algorand',
        fromAssetId: action.targetAssetId,
        toAssetId: null,
        fromAmountMicro: '0',
        toAmountMinMicro: null,
        estimatedValueUsd: '0',
        dependsOn: [],
        atomicGroupIndex: groupIndex++,
        metadata: { assetId: action.targetAssetId },
      });
    }

    // Build the main action step(s)
    const actionSteps = await buildActionSteps(action, steps, stepIndex, groupIndex, params.goalProfile);
    steps.push(...actionSteps.steps);
    stepIndex = actionSteps.nextStepIndex;
    groupIndex = actionSteps.nextGroupIndex;
  }

  const totalValueUsd = steps
    .reduce((sum, s) => sum.plus(new Decimal(s.estimatedValueUsd)), new Decimal(0))
    .toFixed(8);

  const estimatedFeesAlgo = new Decimal(steps.length)
    .mul('0.001') // 0.001 ALGO per txn
    .toFixed(6);

  return {
    executionId: crypto.randomUUID(),
    userId: params.userId,
    sourceEventType: params.sourceEventType,
    sourceEventId: params.sourceEventId,
    goalProfile: params.goalProfile,
    steps,
    totalValueUsd,
    estimatedFeesAlgo,
    estimatedDurationMs: steps.length * 4000, // ~4s per group (Algorand block time)
    createdAt: new Date().toISOString(),
  };
}

function isOptedIn(holdings: AssetHolding[], assetId: number): boolean {
  if (assetId === 0) return true; // ALGO always available
  return holdings.some(h => h.assetId === assetId);
}
```

---

## Layer 2: Policy Engine

**File:** `execution/policy.engine.ts`

```typescript
import Decimal from 'decimal.js';
import { PlanOfAction, POAStep } from './poa.builder';

// Allowed protocols — reject any txn targeting unknown contracts
const PROTOCOL_ALLOWLIST = new Set([
  'folks-finance',
  'tinyman',
  'pact',
  'haystack',
  'algorand',
]);

// Per-transaction USD limits by goal profile
const MAX_SINGLE_TXN_USD: Record<string, number> = {
  CONSERVATIVE: 1_000,
  MODERATE:     5_000,
  AGGRESSIVE:  20_000,
};

// Daily volume limits by goal profile (rolling 24h)
const MAX_DAILY_USD: Record<string, number> = {
  CONSERVATIVE:  5_000,
  MODERATE:     25_000,
  AGGRESSIVE:  100_000,
};

// Max slippage by goal profile
const MAX_SLIPPAGE_PCT: Record<string, number> = {
  CONSERVATIVE: 0.5,
  MODERATE:     1.0,
  AGGRESSIVE:   2.0,
};

// High-value pause threshold — require user approval above this
const HIGH_VALUE_THRESHOLD_USD = 2_000;

// Goal profile action gates
const BLOCKED_ACTIONS: Record<string, ActionType[]> = {
  CONSERVATIVE: ['LP_ADD'], // no LP positions for conservative
  MODERATE:     [],
  AGGRESSIVE:   [],
};

export type PolicyDecision = 'APPROVED' | 'REQUIRES_APPROVAL' | 'BLOCKED';

export interface PolicyResult {
  decision:    PolicyDecision;
  reason:      string | null;
  blockedStep: number | null; // stepIndex that caused the block
}

/**
 * Evaluates a full POA against all policy rules.
 * Returns BLOCKED immediately on first hard violation.
 * Returns REQUIRES_APPROVAL if any step exceeds the high-value threshold.
 * Returns APPROVED if all checks pass.
 */
export async function evaluatePOA(params: {
  poa:            PlanOfAction;
  goalProfile:    string;
  riskScore:      number;       // from Engine 2
  riskScoreCap:   number;       // from user's persona profile
  volumeUsed24h:  string;       // DECIMAL — USD already executed today
}): Promise<PolicyResult> {
  const { poa, goalProfile, riskScore, riskScoreCap, volumeUsed24h } = params;
  const profile = goalProfile as keyof typeof MAX_SINGLE_TXN_USD;

  // 1. Risk score gate
  if (riskScore > riskScoreCap) {
    return {
      decision: 'BLOCKED',
      reason: `Current risk score (${riskScore}) exceeds profile cap (${riskScoreCap}). Execution blocked to prevent further risk increase.`,
      blockedStep: null,
    };
  }

  // 2. Daily volume check
  const totalPOAValueUsd = new Decimal(poa.totalValueUsd);
  const usedToday = new Decimal(volumeUsed24h);
  const dailyLimit = MAX_DAILY_USD[profile] ?? 5_000;

  if (usedToday.plus(totalPOAValueUsd).gt(dailyLimit)) {
    return {
      decision: 'BLOCKED',
      reason: `Daily execution limit ($${dailyLimit.toLocaleString()}) would be exceeded. Used today: $${usedToday.toFixed(2)}. POA total: $${totalPOAValueUsd.toFixed(2)}.`,
      blockedStep: null,
    };
  }

  // 3. Per-step checks
  let requiresApproval = false;
  const singleTxnLimit = MAX_SINGLE_TXN_USD[profile] ?? 5_000;
  const maxSlippage = MAX_SLIPPAGE_PCT[profile] ?? 1.0;
  const blockedActions = BLOCKED_ACTIONS[profile] ?? [];

  for (const step of poa.steps) {
    // Protocol allowlist
    if (!PROTOCOL_ALLOWLIST.has(step.protocol)) {
      return {
        decision: 'BLOCKED',
        reason: `Step ${step.stepIndex} targets non-allowlisted protocol: ${step.protocol}.`,
        blockedStep: step.stepIndex,
      };
    }

    // Goal profile action gate
    if (blockedActions.includes(step.actionType)) {
      return {
        decision: 'BLOCKED',
        reason: `Action type ${step.actionType} is not permitted for ${goalProfile} profile.`,
        blockedStep: step.stepIndex,
      };
    }

    // Single transaction limit
    const stepValueUsd = new Decimal(step.estimatedValueUsd);
    if (stepValueUsd.gt(singleTxnLimit)) {
      return {
        decision: 'BLOCKED',
        reason: `Step ${step.stepIndex} value ($${stepValueUsd.toFixed(2)}) exceeds single-transaction limit ($${singleTxnLimit.toLocaleString()}).`,
        blockedStep: step.stepIndex,
      };
    }

    // High-value approval threshold
    if (stepValueUsd.gt(HIGH_VALUE_THRESHOLD_USD)) {
      requiresApproval = true;
    }

    // Slippage cap (for SWAP, LP_ADD, LP_REMOVE)
    if (['SWAP', 'LP_ADD', 'LP_REMOVE'].includes(step.actionType)) {
      const slippage = computeEstimatedSlippage(step);
      if (slippage > maxSlippage) {
        return {
          decision: 'BLOCKED',
          reason: `Step ${step.stepIndex} estimated slippage (${slippage.toFixed(2)}%) exceeds profile maximum (${maxSlippage}%).`,
          blockedStep: step.stepIndex,
        };
      }
    }
  }

  return {
    decision: requiresApproval ? 'REQUIRES_APPROVAL' : 'APPROVED',
    reason: requiresApproval ? `One or more steps exceed $${HIGH_VALUE_THRESHOLD_USD.toLocaleString()} — user approval required.` : null,
    blockedStep: null,
  };
}

function computeEstimatedSlippage(step: POAStep): number {
  if (!step.toAmountMinMicro || !step.metadata.expectedOutputMicro) return 0;
  const expected = new Decimal(step.metadata.expectedOutputMicro as string);
  const minimum = new Decimal(step.toAmountMinMicro);
  if (expected.isZero()) return 0;
  return expected.minus(minimum).div(expected).mul(100).toNumber();
}
```

### Rolling 24h Volume — Redis Persistence

**Addresses:** NEW-05 (architecture_audit_v2.md)

The Policy Engine enforces rolling 24h execution limits but needs a persistence model for the running total.

**Redis key structure:**
```
Key:    crestflow:exec-volume:{userId}
Value:  cumulative USD value (string, DECIMAL format)
TTL:    86400 seconds (24 hours, auto-expires)
```

**Operations:**
- On execution confirmed: `INCRBYFLOAT crestflow:exec-volume:{userId} {valueUsd}` + `EXPIRE crestflow:exec-volume:{userId} 86400`
- On policy check: `GET crestflow:exec-volume:{userId}` (returns null if no executions in 24h → treat as "0")

This replaces the DB query in `getVolumeUsed24h()` for hot-path performance. The ExecutionRecord table remains the audit source of truth.

---

## Layer 3: Simulation Gate

**File:** `execution/simulation.gate.ts`

```typescript
import algosdk from 'algosdk';
import { logger } from '../utils/logger';

export interface SimulationResult {
  passed:        boolean;
  failedGroupIndex: number | null;
  failureReason: string | null;
  simulatedAt:   string;
}

/**
 * Simulate all transaction groups in the POA before signing.
 * Uses algod.simulateTransaction() — evaluates against current chain state.
 *
 * Catches:
 * - Transaction reverts (slippage too high, pool state changed)
 * - Opt-in failures (account not opted into asset)
 * - Insufficient balance
 * - ABI method argument errors
 * - Fee calculation errors
 *
 * If ANY group fails simulation → return failed result immediately.
 */
export async function simulatePOA(
  txnGroups: algosdk.Transaction[][],
  algodClient: algosdk.Algodv2,
): Promise<SimulationResult> {
  for (let i = 0; i < txnGroups.length; i++) {
    const group = txnGroups[i];

    try {
      // Build simulation request — allowEmptySignatures: true (pre-signing simulation)
      const simulateRequest = new algosdk.modelsv2.SimulateRequest({
        txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({
          txns: group.map(txn => algosdk.encodeUnsignedSimulateTransaction(txn)),
        })],
        allowEmptySignatures: true,
        allowUnnamedResources: true,
      });

      const result = await algodClient.simulateTransactions(simulateRequest).do();
      const groupResult = result.txnGroups[0];

      if (groupResult.failureMessage) {
        logger.warn({
          module: 'execution',
          event: 'simulation_failed',
          groupIndex: i,
          reason: groupResult.failureMessage,
        });

        return {
          passed: false,
          failedGroupIndex: i,
          failureReason: groupResult.failureMessage,
          simulatedAt: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      logger.error({ module: 'execution', event: 'simulation_error', groupIndex: i, error: err?.message });
      return {
        passed: false,
        failedGroupIndex: i,
        failureReason: `Simulation error: ${err?.message}`,
        simulatedAt: new Date().toISOString(),
      };
    }
  }

  return {
    passed: true,
    failedGroupIndex: null,
    failureReason: null,
    simulatedAt: new Date().toISOString(),
  };
}
```

---

## Layer 4: Transaction Builders (per protocol)

### Haystack (Swap)

**File:** `execution/builders/haystack.builder.ts`

```typescript
import algosdk from 'algosdk';
import { POAStep } from '../poa.builder';

/**
 * Haystack Router — smart order routing across Tinyman + Pact.
 * Returns the atomic transaction group for a swap.
 *
 * Uses @txnlab/deflex (Haystack SDK):
 * 1. Request swap plan from Haystack Order-Routing API
 * 2. SDK returns pre-built atomic txn group
 * 3. We set slippage tolerance per goal profile before building
 */
export async function buildSwapTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
  slippagePct: number,
): Promise<algosdk.Transaction[]> {
  // Dynamic import to avoid bundling issues
  const { Deflex } = await import('@txnlab/deflex');

  const client = new Deflex.MainnetClient(algodClient);

  const quote = await client.getSwapQuote({
    fromAssetId: step.fromAssetId,
    toAssetId: step.toAssetId!,
    amount: BigInt(step.fromAmountMicro),
    type: 'fixed-input',
    slippage: slippagePct / 100,
  });

  const txnGroup = await client.prepareSwapTransactions({
    quote,
    sender,
    suggestedParams: await algodClient.getTransactionParams().do(),
  });

  return txnGroup;
}
```

---

### Folks Finance (Lend Deposit / Withdraw)

**File:** `execution/builders/folks.builder.ts`

```typescript
import algosdk from 'algosdk';
import { FolksCore, FolksLoan, Network } from '@folks-finance/algorand-js-sdk';
import { POAStep } from '../poa.builder';

/**
 * Folks Finance deposit — supply asset to lending pool, receive fTokens.
 * Uses FolksLoan module from @folks-finance/algorand-js-sdk.
 */
export async function buildLendDepositTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const folksCore = new FolksCore({
    algodClient,
    network: Network.MAINNET,
    signer: null, // we provide our own signer (Turnkey)
  });

  const marketId = step.metadata.marketId as string;
  const amount = BigInt(step.fromAmountMicro);

  const txnGroup = await FolksLoan.prepareDepositToPool({
    folksCore,
    marketId,
    amount,
    sender,
    suggestedParams: await algodClient.getTransactionParams().do(),
  });

  return txnGroup;
}

/**
 * Folks Finance withdraw — burn fTokens, receive underlying asset.
 */
export async function buildLendWithdrawTxns(
  step: POAStep,
  sender: string,
  algodClient: algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const folksCore = new FolksCore({
    algodClient,
    network: Network.MAINNET,
    signer: null,
  });

  const marketId = step.metadata.marketId as string;
  const fTokenAmount = BigInt(step.fromAmountMicro);

  const txnGroup = await FolksLoan.prepareWithdrawFromPool({
    folksCore,
    marketId,
    fTokenAmount,
    sender,
    suggestedParams: await algodClient.getTransactionParams().do(),
  });

  return txnGroup;
}
```

---

### Tinyman V2 (LP Add / Remove)

**File:** `execution/builders/tinyman.builder.ts`

```typescript
import algosdk from 'algosdk';
import {
  TinymanMainnetClient,
  AddLiquidity,
  RemoveLiquidity,
  getPoolInfo,
} from '@tinymanorg/tinyman-js-sdk';
import { POAStep } from '../poa.builder';

export async function buildLpAddTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const client = new TinymanMainnetClient(algodClient, { network: 'mainnet' });
  const pool = await client.fetch_pool(step.fromAssetId, step.toAssetId!);

  const liquidityAddition = AddLiquidity.v2.flexible.prepare({
    pool,
    initiatorAddr: sender,
    asset1In: { id: step.fromAssetId, amount: BigInt(step.fromAmountMicro) },
    asset2In: { id: step.toAssetId!, amount: BigInt(step.metadata.toAmountMicro as string) },
    slippage: parseFloat(step.metadata.slippagePct as string) / 100,
  });

  return liquidityAddition.transactions;
}

export async function buildLpRemoveTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const client = new TinymanMainnetClient(algodClient, { network: 'mainnet' });
  const pool = await client.fetch_pool(step.fromAssetId, step.toAssetId!);

  const removal = RemoveLiquidity.v2.prepare({
    pool,
    initiatorAddr: sender,
    lpTokenAmount: BigInt(step.fromAmountMicro),
    slippage: parseFloat(step.metadata.slippagePct as string) / 100,
  });

  return removal.transactions;
}
```

---

### Pact (LP Add / Remove, fallback swap)

**File:** `execution/builders/pact.builder.ts`

```typescript
import algosdk from 'algosdk';
import pactsdk from '@pactfi/pactsdk';
import { POAStep } from '../poa.builder';

export async function buildPactLpAddTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const pact = new pactsdk.PactClient(algodClient, { network: 'mainnet' });
  const pool = await pact.fetchPoolById(step.metadata.poolId as number);

  const addition = pool.prepareAddLiquidity({
    primaryAssetAmount: parseInt(step.fromAmountMicro),
    secondaryAssetAmount: parseInt(step.metadata.toAmountMicro as string),
  });

  const txGroup = await addition.prepareTxGroup(sender);
  return txGroup.transactions;
}

export async function buildPactLpRemoveTxns(
  step: POAStep,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction[]> {
  const pact = new pactsdk.PactClient(algodClient, { network: 'mainnet' });
  const pool = await pact.fetchPoolById(step.metadata.poolId as number);

  const removal = pool.prepareRemoveLiquidity({
    amount: parseInt(step.fromAmountMicro),
  });

  const txGroup = await removal.prepareTxGroup(sender);
  return txGroup.transactions;
}
```

---

### ASA Opt-In Builder

**File:** `execution/builders/opt-in.builder.ts`

```typescript
import algosdk from 'algosdk';

/**
 * Build an ASA opt-in transaction.
 * An opt-in is a 0-unit asset transfer from account to itself.
 * Required before any ASA can be received by the account.
 * Costs 0.1 ALGO minimum balance (locked, not spent).
 */
export async function buildOptInTxn(
  assetId: number,
  sender: string,
  algodClient: algosdk.Algodv2,
): Promise<algosdk.Transaction> {
  const params = await algodClient.getTransactionParams().do();

  return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: sender,
    to: sender,       // self-transfer
    amount: 0,        // 0 units = opt-in
    assetIndex: assetId,
    suggestedParams: {
      ...params,
      fee: 1000,       // 0.001 ALGO minimum fee
      flatFee: true,
    },
  });
}

/**
 * Check if an account is opted into a given ASA.
 * Returns true for ALGO (assetId=0) unconditionally.
 */
export async function isAccountOptedIn(
  address: string,
  assetId: number,
  algodClient: algosdk.Algodv2,
): Promise<boolean> {
  if (assetId === 0) return true;
  try {
    const info = await algodClient.accountInformation(address).do();
    return (info.assets ?? []).some((a: { 'asset-id': number }) => a['asset-id'] === assetId);
  } catch {
    return false;
  }
}
```

---

## Layer 5: Signing (Turnkey) + Execution Coordinator

### Turnkey Signer

**File:** `execution/turnkey.signer.ts`

```typescript
import algosdk from 'algosdk';
import { TurnkeyClient } from '@turnkey/http';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';
import { logger } from '../utils/logger';

const turnkeyClient = new TurnkeyClient(
  { baseUrl: 'https://api.turnkey.com' },
  new ApiKeyStamper({
    apiPublicKey:  process.env.TURNKEY_API_PUBLIC_KEY!,
    apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
  }),
);

/**
 * Sign an array of transaction groups via Turnkey TEE.
 * Each group is an Algorand atomic group.
 * Returns signed groups ready for broadcast.
 *
 * Signing flow:
 * 1. Assign group IDs (atomic groups require all txns in group share groupId)
 * 2. Encode each txn as MsgPack (base64)
 * 3. Submit to Turnkey SIGN_TRANSACTION_V2 per group
 * 4. Verify returned signature against expected public key
 * 5. Attach signature to each transaction
 */
export async function signTxnGroups(
  txnGroups: algosdk.Transaction[][],
  subOrganizationId: string,
  turnkeyWalletAddress: string,
  algoAddress: string,
): Promise<Uint8Array[][]> {
  const signedGroups: Uint8Array[][] = [];

  for (const group of txnGroups) {
    // Assign group ID to all txns in group
    if (group.length > 1) {
      algosdk.assignGroupID(group);
    }

    const signedGroup: Uint8Array[] = [];

    for (const txn of group) {
      // Encode to MsgPack bytes → base64 for Turnkey
      const encodedTxn = Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64');

      const activity = await turnkeyClient.signTransaction({
        type: 'ACTIVITY_TYPE_SIGN_TRANSACTION_V2',
        organizationId: subOrganizationId,
        parameters: {
          signWith: turnkeyWalletAddress,
          unsignedTransaction: encodedTxn,
          type: 'TRANSACTION_TYPE_ALGORAND',
        },
        timestampMs: Date.now().toString(),
      });

      const signature = activity.result.signTransactionResult?.signedTransaction;
      if (!signature) {
        throw new Error(`Turnkey signing failed for txn in group. Activity: ${activity.id}`);
      }

      // Decode signed bytes and verify
      const signedTxnBytes = Buffer.from(signature, 'base64');
      signedGroup.push(signedTxnBytes);

      logger.info({
        module: 'execution',
        event: 'txn_signed',
        turnkeyActivity: activity.id,
        txnType: txn.type,
      });
    }

    signedGroups.push(signedGroup);
  }

  return signedGroups;
}
```

---

### Execution Coordinator

**File:** `execution/execution.coordinator.ts`

```typescript
import algosdk from 'algosdk';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const CONFIRMATION_ROUNDS = 3;  // wait up to 3 rounds (~10s) for confirmation

export interface ExecutionGroupResult {
  txId:        string;
  confirmed:   boolean;
  confirmedRound: number | null;
  error:       string | null;
}

/**
 * Broadcast a signed transaction group and wait for confirmation.
 * Algorand finality: ~3.3s. Poll pendingTransactionInformation() until confirmed.
 *
 * Returns txId on success, throws on unrecoverable failure.
 * Does NOT retry on business logic errors (slippage, revert).
 * Retries once on network errors (ECONNRESET, 503).
 */
export async function broadcastAndConfirm(
  signedGroup: Uint8Array[],
  algodClient: algosdk.Algodv2,
): Promise<ExecutionGroupResult> {
  try {
    const { txId } = await algodClient
      .sendRawTransaction(signedGroup)
      .do();

    logger.info({ module: 'execution', event: 'txn_broadcast', txId });

    // Wait for confirmation
    const confirmed = await algosdk.waitForConfirmation(algodClient, txId, CONFIRMATION_ROUNDS);

    logger.info({
      module: 'execution',
      event: 'txn_confirmed',
      txId,
      confirmedRound: confirmed['confirmed-round'],
    });

    return {
      txId,
      confirmed: true,
      confirmedRound: confirmed['confirmed-round'],
      error: null,
    };
  } catch (err: any) {
    const isNetworkError = err?.code === 'ECONNRESET' || err?.status === 503;

    if (isNetworkError) {
      // Retry once
      logger.warn({ module: 'execution', event: 'broadcast_retry', error: err?.message });
      return broadcastAndConfirm(signedGroup, algodClient); // single retry
    }

    logger.error({ module: 'execution', event: 'broadcast_failed', error: err?.message });
    return {
      txId: '',
      confirmed: false,
      confirmedRound: null,
      error: err?.message ?? 'Unknown broadcast error',
    };
  }
}
```

---

## x402 Payment Protocol Integration

**File:** `middleware/x402.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Endpoints that require x402 payment
const PAID_ENDPOINTS = new Set([
  '/api/v1/execute/plan',
  '/api/v1/execute/submit',
  '/api/v1/execute/simulate',
  '/api/v1/execute/autopilot/enable',
  '/api/v1/copilot/query',
  '/api/v1/copilot/query/stream',
]);

const PRICE_USDC_MICRO = 10_000; // 0.01 USDC per paid request (10,000 microUSDC)
const FACILITATOR_ADDRESS = process.env.GOPLUSFABLE_FACILITATOR_ADDRESS!;
const ALGORAND_USDC_ASA_ID = 31566704; // Mainnet USDC ASA ID

/**
 * x402 middleware — gates high-value endpoints behind per-request micropayment.
 *
 * Flow:
 * 1. If endpoint is free → pass through
 * 2. If X-PAYMENT header present → verify via Goplusfable facilitator → pass through
 * 3. If no payment → return HTTP 402 with payment instructions
 */
export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const endpoint = req.path;

  if (!PAID_ENDPOINTS.has(endpoint)) {
    return next();
  }

  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (!paymentHeader) {
    // Return HTTP 402 with payment requirements
    res.status(402).json({
      error: 'PAYMENT_REQUIRED',
      price: {
        amount: PRICE_USDC_MICRO,
        asset: 'USDC',
        asaId: ALGORAND_USDC_ASA_ID,
        network: 'algorand-mainnet',
      },
      payTo: FACILITATOR_ADDRESS,
      facilitator: 'goplusfable',
      instructions: 'Send USDC payment to the facilitator address, then retry with X-PAYMENT header containing the transaction ID.',
    });
    return;
  }

  // Verify payment with Goplusfable facilitator
  const verified = await verifyPaymentWithFacilitator(paymentHeader, PRICE_USDC_MICRO);

  if (!verified) {
    res.status(402).json({
      error: 'PAYMENT_INVALID',
      message: 'Payment could not be verified. Ensure the transaction is confirmed and the amount is correct.',
    });
    return;
  }

  logger.info({ module: 'x402', event: 'payment_verified', endpoint, paymentTxId: paymentHeader });
  next();
}

async function verifyPaymentWithFacilitator(txId: string, requiredAmountMicro: number): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.GOPLUSFABLE_API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txId, requiredAmountMicro, facilitatorAddress: FACILITATOR_ADDRESS }),
    });
    const result = await response.json();
    return result.verified === true;
  } catch {
    return false;
  }
}
```

---

## Execution Service (Orchestrator)

**File:** `execution/execution.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import algosdk from 'algosdk';
import { buildPOA, PlanOfAction } from './poa.builder';
import { evaluatePOA, PolicyResult } from './policy.engine';
import { simulatePOA } from './simulation.gate';
import { signTxnGroups } from './turnkey.signer';
import { broadcastAndConfirm } from './execution.coordinator';
import { buildTxnGroups } from './txn.group.builder';
import { ExecutionEvents } from './execution.events';
import { logger } from '../utils/logger';

export class ExecutionService {
  constructor(
    private prisma: PrismaClient,
    private algodClient: algosdk.Algodv2,
  ) {}

  /**
   * Full execution pipeline:
   * 1. Build POA
   * 2. Policy check (fail-closed)
   * 3. Simulation gate (fail-closed)
   * 4. Sign via Turnkey
   * 5. Broadcast + confirm
   * 6. Write audit records
   * 7. Emit events
   */
  async execute(params: {
    userId:          string;
    sourceEventType: PlanOfAction['sourceEventType'];
    sourceEventId:   string;
    actions:         RebalancingAction[];
  }): Promise<ExecutionResult> {
    const start = Date.now();

    // Fetch user context
    const [userProfile, portfolioSnap, riskSnap, user] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId: params.userId } }),
      this.prisma.portfolioSnapshot.findFirst({ where: { userId: params.userId }, orderBy: { snapshotAt: 'desc' } }),
      this.prisma.riskSnapshot.findFirst({ where: { userId: params.userId }, orderBy: { analyzedAt: 'desc' } }),
      this.prisma.user.findUnique({ where: { id: params.userId }, select: { algorandAddress: true, turnkeySubOrgId: true, turnkeyWalletId: true } }),
    ]);

    if (!user || !userProfile || !portfolioSnap) {
      throw new Error('Missing required user context for execution');
    }

    const goalProfile = userProfile.goalProfile;

    // Step 1: Build POA
    const poa = await buildPOA({
      userId: params.userId,
      actions: params.actions,
      currentHoldings: portfolioSnap.assetHoldings as any,
      goalProfile,
      sourceEventType: params.sourceEventType,
      sourceEventId: params.sourceEventId,
      algodClient: this.algodClient,
    });

    if (poa.steps.every(s => s.actionType === 'NO_OP')) {
      return { status: 'NO_OP', executionId: poa.executionId, steps: [] };
    }

    // Step 2: Policy check
    const volumeUsed = await this.getVolumeUsed24h(params.userId);
    const riskScoreCap = getProfileRiskCap(goalProfile);

    const policyResult = await evaluatePOA({
      poa,
      goalProfile,
      riskScore: riskSnap?.riskScore ?? 0,
      riskScoreCap,
      volumeUsed24h: volumeUsed,
    });

    if (policyResult.decision === 'BLOCKED') {
      await this.writeExecutionRecord(poa, 'POLICY_BLOCKED', policyResult.reason);
      return { status: 'POLICY_BLOCKED', reason: policyResult.reason!, executionId: poa.executionId, steps: [] };
    }

    if (policyResult.decision === 'REQUIRES_APPROVAL') {
      await this.writeExecutionRecord(poa, 'AWAITING_APPROVAL', policyResult.reason);
      // Notify user via event — they must approve via POST /execute/submit?approve=true
      return { status: 'AWAITING_APPROVAL', reason: policyResult.reason!, executionId: poa.executionId, steps: [] };
    }

    // Step 3: Build txn groups
    const txnGroups = await buildTxnGroups(poa, user.algorandAddress, this.algodClient, goalProfile);

    // Step 4: Simulation gate
    const simResult = await simulatePOA(txnGroups, this.algodClient);

    if (!simResult.passed) {
      await this.writeExecutionRecord(poa, 'SIMULATION_FAILED', simResult.failureReason);
      return {
        status: 'SIMULATION_FAILED',
        reason: simResult.failureReason!,
        executionId: poa.executionId,
        steps: [],
      };
    }

    // Step 5: Sign via Turnkey
    const signedGroups = await signTxnGroups(
      txnGroups,
      user.turnkeySubOrgId,
      user.turnkeyWalletId,
      user.algorandAddress,
    );

    // Step 6: Broadcast + confirm
    const executionRecord = await this.prisma.executionRecord.create({
      data: {
        id: poa.executionId,
        userId: params.userId,
        status: 'SUBMITTED',
        sourceEventType: params.sourceEventType,
        sourceEventId: params.sourceEventId,
        goalProfile,
        totalValueUsd: poa.totalValueUsd,
        estimatedFeesAlgo: poa.estimatedFeesAlgo,
        stepsJson: poa.steps as any,
      },
    });

    const results: ExecutionStepResult[] = [];

    for (let i = 0; i < signedGroups.length; i++) {
      const result = await broadcastAndConfirm(signedGroups[i], this.algodClient);
      results.push({ groupIndex: i, ...result });

      // Write per-group txn record
      await this.prisma.executionTransaction.create({
        data: {
          executionRecordId: poa.executionId,
          groupIndex: i,
          txId: result.txId,
          confirmed: result.confirmed,
          confirmedRound: result.confirmedRound,
          error: result.error,
        },
      });

      if (!result.confirmed) {
        await this.prisma.executionRecord.update({
          where: { id: poa.executionId },
          data: { status: 'FAILED', failureReason: result.error },
        });

        logger.error({
          module: 'execution',
          event: 'execution_failed',
          userId: params.userId,
          groupIndex: i,
          error: result.error,
        });

        return {
          status: 'FAILED',
          reason: result.error!,
          executionId: poa.executionId,
          steps: results,
        };
      }
    }

    // Step 7: Finalize
    await this.prisma.executionRecord.update({
      where: { id: poa.executionId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        durationMs: Date.now() - start,
      },
    });

    logger.info({
      module: 'execution',
      event: 'execution_complete',
      userId: params.userId,
      executionId: poa.executionId,
      steps: poa.steps.length,
      totalValueUsd: poa.totalValueUsd,
      durationMs: Date.now() - start,
    });

    // Emit events
    // ExecutionConfirmedEvent → Engine 1 (fresh portfolio scan)
    // BehavioralSignal → Engine 5 (ACTED_ON_REBALANCE)

    return {
      status: 'CONFIRMED',
      executionId: poa.executionId,
      steps: results,
    };
  }

  private async getVolumeUsed24h(userId: string): Promise<string> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.prisma.executionRecord.findMany({
      where: { userId, status: 'CONFIRMED', confirmedAt: { gte: since } },
      select: { totalValueUsd: true },
    });
    return result
      .reduce((sum, r) => sum.plus(r.totalValueUsd), new Decimal(0))
      .toFixed(8);
  }

  private async writeExecutionRecord(poa: PlanOfAction, status: string, reason: string | null): Promise<void> {
    await this.prisma.executionRecord.create({
      data: {
        id: poa.executionId,
        userId: poa.userId,
        status,
        sourceEventType: poa.sourceEventType,
        sourceEventId: poa.sourceEventId,
        goalProfile: poa.goalProfile,
        totalValueUsd: poa.totalValueUsd,
        estimatedFeesAlgo: poa.estimatedFeesAlgo,
        stepsJson: poa.steps as any,
        failureReason: reason,
      },
    });
  }
}

function getProfileRiskCap(goalProfile: string): number {
  return { CONSERVATIVE: 35, MODERATE: 60, AGGRESSIVE: 85 }[goalProfile] ?? 60;
}
```

### Monthly Turnover Cap Enforcement

**Addresses:** Wealth management analysis anti-churn recommendation

The Policy Engine must enforce a monthly portfolio turnover cap in addition to the daily volume limit:

```typescript
const MAX_MONTHLY_TURNOVER_PCT: Record<string, number> = {
  CONSERVATIVE: 20,  // max 20% of portfolio traded per 30 days
  MODERATE:     30,  // max 30%
  AGGRESSIVE:   50,  // max 50%
};
```

Calculated as: `sum(execution_records.totalValueUsd for last 30 days) / latest_portfolio_snapshot.totalValueUsd * 100`

Risk-driven executions (triggered by risk tier breach, liquidation proximity, or protocol distress) are exempt from this cap. The exemption is recorded in the `ExecutionRecord.sourceEventType` field.

---

## Database Schema

**File:** `packages/shared/prisma/schema.prisma` (additions)

```prisma
model ExecutionRecord {
  id                String          @id @db.Uuid    // = executionId from POA
  userId            String          @db.Uuid
  status            ExecutionStatus
  sourceEventType   String          // 'StrategyPlanCreated' | 'YieldOpportunitiesUpdated' | 'MANUAL'
  sourceEventId     String          @db.Uuid

  goalProfile       String
  totalValueUsd     String          // DECIMAL
  estimatedFeesAlgo String          // DECIMAL
  stepsJson         Json            // POAStep[] — full plan snapshot

  failureReason     String?
  confirmedAt       DateTime?
  durationMs        Int?

  // INSERT-only — no UPDATE except status field and confirmedAt
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  transactions      ExecutionTransaction[]
  user              User            @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, status])
  @@map("execution_records")
}

model ExecutionTransaction {
  id                  String    @id @default(uuid()) @db.Uuid
  executionRecordId   String    @db.Uuid
  groupIndex          Int
  txId                String    // Algorand transaction ID — auditable on explorer
  confirmed           Boolean
  confirmedRound      Int?
  error               String?
  createdAt           DateTime  @default(now())

  executionRecord     ExecutionRecord @relation(fields: [executionRecordId], references: [id])

  @@index([executionRecordId])
  @@index([txId])                    // fast lookup by txId for audit
  @@map("execution_transactions")
}

model AutopilotConfig {
  id            String    @id @default(uuid()) @db.Uuid
  userId        String    @db.Uuid @unique
  enabled       Boolean   @default(false)
  enabledAt     DateTime?
  disabledAt    DateTime?
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])

  @@map("autopilot_configs")
}

enum ExecutionStatus {
  PENDING
  POLICY_BLOCKED
  AWAITING_APPROVAL
  SIMULATION_FAILED
  SUBMITTED
  CONFIRMED
  FAILED
}
```

**Immutability:**
```sql
-- ExecutionRecord: allow UPDATE for status, confirmedAt, failureReason, durationMs only
-- ExecutionTransaction: INSERT-only (fully immutable audit log)
REVOKE UPDATE, DELETE ON execution_transactions FROM crestflow_app;
```

---

## Module File Structure

```
apps/copilot-api/src/modules/execution/
|-- execution.controller.ts
|-- execution.routes.ts
|-- execution.service.ts                <- 7-step pipeline orchestrator
|-- execution.events.ts                 <- ExecutionConfirmed payload
|-- poa.builder.ts                      <- POA step graph, dependency resolution
|-- policy.engine.ts                    <- hard limits, slippage caps, protocol allowlist
|-- simulation.gate.ts                  <- algod.simulateTransaction() wrapper
|-- turnkey.signer.ts                   <- Turnkey TEE signing integration
|-- execution.coordinator.ts            <- broadcast + confirmation polling
|-- txn.group.builder.ts               <- assembles step array into algosdk txn groups
|-- builders/
|   |-- haystack.builder.ts            <- swap via Haystack router
|   |-- folks.builder.ts               <- lend deposit / withdraw
|   |-- tinyman.builder.ts             <- LP add / remove (Tinyman V2)
|   |-- pact.builder.ts                <- LP add / remove (Pact)
|   +-- opt-in.builder.ts              <- ASA opt-in transaction
+-- middleware/
    +-- x402.middleware.ts              <- HTTP 402 payment gate
```

---

## API Endpoints (7)

---

### POST /api/v1/execute/plan

Build a POA from an abstract action set. Returns the plan with policy decision and simulation result — but does NOT execute.

**Request:**
```json
{
  "sourceEventId": "uuid",
  "sourceEventType": "StrategyPlanCreated",
  "actions": [
    { "assetSymbol": "ALGO", "direction": "SELL", "deltaPercent": "15.0", "urgency": "HIGH" },
    { "assetSymbol": "USDC", "direction": "BUY",  "deltaPercent": "15.0", "urgency": "HIGH" }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "policyDecision": "APPROVED",
    "simulationPassed": true,
    "steps": [
      { "stepIndex": 0, "actionType": "OPT_IN",       "protocol": "algorand",       "assetSymbol": "USDC",            "estimatedValueUsd": "0" },
      { "stepIndex": 1, "actionType": "SWAP",          "protocol": "haystack",       "fromSymbol": "ALGO", "toSymbol": "USDC", "estimatedValueUsd": "623.40", "estimatedSlippagePct": "0.12" },
      { "stepIndex": 2, "actionType": "LEND_DEPOSIT",  "protocol": "folks-finance",  "assetSymbol": "USDC",            "estimatedValueUsd": "623.40" }
    ],
    "totalValueUsd": "623.40",
    "estimatedFeesAlgo": "0.003",
    "estimatedDurationMs": 12000
  }
}
```

---

### POST /api/v1/execute/submit

Execute a previously planned POA (by executionId) or execute immediately.

**Request:**
```json
{ "executionId": "uuid", "confirm": true }
```

**Response (200 — immediate confirm, or 202 — submitted async):**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "status": "SUBMITTED",
    "message": "Execution submitted. Poll /status/:executionId for updates."
  }
}
```

---

### GET /api/v1/execute/status/:executionId

Poll execution status in real-time.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "status": "CONFIRMED",
    "steps": [
      { "groupIndex": 0, "txId": "ABCDEF123...", "confirmed": true, "confirmedRound": 48293710 },
      { "groupIndex": 1, "txId": "GHIJKL456...", "confirmed": true, "confirmedRound": 48293712 }
    ],
    "totalValueUsd": "623.40",
    "confirmedAt": "2026-06-24T10:45:00Z",
    "durationMs": 8420,
    "explorerUrl": "https://allo.info/tx/ABCDEF123..."
  }
}
```

---

### GET /api/v1/execute/history

Full execution history for the user with status, value, and txIDs.

---

### POST /api/v1/execute/simulate

Dry-run a POA without signing. Returns simulation result including expected outputs.

---

### POST /api/v1/execute/autopilot/enable

Enable autonomous execution. Executions will run without user confirmation within policy limits.

**Request:**
```json
{ "confirm": true }
```

---

### DELETE /api/v1/execute/autopilot/disable

Disable autonomous execution immediately.

---

### Autopilot Guard (MVP)

**Addresses:** NEW-06 (architecture_audit_v2.md)

The `AutopilotConfig` table and toggle endpoints exist in the schema, but autopilot execution is Phase 3. Users can enable the preference but it has no effect.

The `POST /api/v1/execute/autopilot/enable` endpoint must return:

```json
{
  "success": true,
  "data": {
    "autopilotEnabled": true,
    "message": "Autopilot preference saved. Autonomous execution launches in Phase 3. Your preference will be activated when this feature becomes available.",
    "currentBehavior": "All actions continue to require your explicit approval."
  }
}
```

### Autopilot Bias Toward Inaction (Phase 3)

When autopilot is implemented in Phase 3, it must bias toward inaction:

| Parameter | Autopilot Value | Manual Value | Rationale |
|---|---|---|---|
| Rebalancing drift threshold | 12% (not 8%) | 8% | Higher bar when user isn't reviewing each action |
| Minimum hold period | 14 days (not 7) | 7 days | Longer patience when no human judgment in loop |
| Monthly turnover cap | 20% (not 30%) | 30% | Tighter constraint without per-action approval |
| INCENTIVIZED opportunities | Never auto-enter | Show to user | Temporary yields require human judgment |
| Positions with TVL < $100K | Never auto-enter | Show with warning | Thin liquidity requires human risk assessment |

---

## Events

```typescript
export const ExecutionEvents = {
  EXECUTION_CONFIRMED:  'ExecutionConfirmed',
  EXECUTION_FAILED:     'ExecutionFailed',
  EXECUTION_BLOCKED:    'ExecutionBlocked',
  AUTOPILOT_ENABLED:    'AutopilotEnabled',
  AUTOPILOT_DISABLED:   'AutopilotDisabled',
} as const;

export interface ExecutionConfirmedPayload {
  userId:           string;
  executionId:      string;
  totalValueUsd:    string;
  stepCount:        number;
  txIds:            string[];
  goalProfile:      string;
  timestamp:        string;
}

// ExecutionConfirmed → consumed by Engine 1 (triggers fresh portfolio scan)
// ExecutionConfirmed → consumed by Engine 5 (ACTED_ON_REBALANCE behavioral signal)
```

---

## New Packages

| Package | Purpose |
|---|---|
| `@txnlab/deflex` | Haystack Router SDK — smart order routing across Tinyman + Pact |

All other packages already in project from Plan 01–02:
- `algosdk` (Plan 02)
- `@folks-finance/algorand-js-sdk` (Plan 02)
- `@tinymanorg/tinyman-js-sdk` (Plan 02)
- `@pactfi/pactsdk` (Plan 02)
- `@turnkey/http` + `@turnkey/api-key-stamper` (Plan 01)

---

## Graceful Degradation

| Condition | Behavior |
|---|---|
| Policy check BLOCKED | Write `POLICY_BLOCKED` record. Return 200 with `status: POLICY_BLOCKED` and plain-English reason |
| Policy check REQUIRES_APPROVAL | Pause plan, write `AWAITING_APPROVAL`. Notify user. Resume on explicit approval |
| Simulation fails | Write `SIMULATION_FAILED`. Return failure reason. Never sign/broadcast |
| Turnkey signing fails | Write `FAILED`. Surface error to user. Never broadcast unsigned txn |
| Algorand broadcast fails (transient) | Single retry. Write `FAILED` on second failure |
| Confirmation timeout (>3 rounds) | Poll status — txn may still confirm. Write `FAILED` if still unconfirmed after 10 rounds |
| Haystack API unavailable | Fall back to direct Tinyman swap (no aggregation). Log degraded mode |
| x402 facilitator verification fails | Return 402. Log but do not silently pass through |

---

## Logging Requirements

`module: "execution"`, JSON structured.

- `INFO` — POA built (userId, stepCount, totalValueUsd, sourceEventType)
- `INFO` — policy approved (userId, executionId, goalProfile)
- `INFO` — simulation passed (userId, executionId, groupCount)
- `INFO` — txn signed (executionId, groupIndex, turnkeyActivity)
- `INFO` — txn confirmed (txId, confirmedRound, durationMs)
- `INFO` — execution complete (executionId, totalValueUsd, durationMs)
- `WARN` — policy requires approval (executionId, reason)
- `WARN` — Haystack unavailable, falling back to Tinyman direct
- `WARN` — broadcast retry (groupIndex, error)
- `ERROR` — policy blocked (executionId, reason)
- `ERROR` — simulation failed (executionId, groupIndex, reason)
- `ERROR` — Turnkey signing failed (executionId, groupIndex)
- `ERROR` — broadcast failed (executionId, groupIndex, txId, error)

---

## Testing Requirements

Coverage: 95%+ on pure functions. Integration tests for full pipeline.

### Unit Tests

**`poa.builder.test.ts`**
- OPT_IN auto-prepended when asset not in holdings
- OPT_IN NOT added when already opted in
- Steps ordered correctly by dependency (SWAP before LEND_DEPOSIT)
- NO_OP returned when drift below threshold
- Atomic group indices assigned correctly (max 16 txns per group)
- totalValueUsd = sum of all non-NO_OP step values

**`policy.engine.test.ts`**
- Risk score > cap → BLOCKED
- Daily volume exceeded → BLOCKED
- Unknown protocol → BLOCKED
- LP_ADD with CONSERVATIVE profile → BLOCKED
- Single txn > limit → BLOCKED
- Slippage > profile max → BLOCKED
- stepValue > $2,000 → REQUIRES_APPROVAL (not BLOCKED)
- All checks pass → APPROVED
- Boundary values (exactly at limit) → correct decision

**`simulation.gate.test.ts`** (mocked algod)
- Simulation success → `passed: true`
- Simulation failure message → `passed: false` with reason
- Network error during simulate → `passed: false` (does not throw)
- Multi-group simulation: failure in group 2 → `failedGroupIndex: 1`

**`opt-in.builder.test.ts`**
- ALGO (assetId=0) → always opted in
- Asset in holdings → opted in
- Asset not in holdings → NOT opted in
- Built opt-in txn: from === to === sender, amount === 0, flatFee === true

**`turnkey.signer.test.ts`** (mocked Turnkey API)
- Multi-group signing: all groups signed
- Turnkey failure → throws (not silently swallowed)
- Atomic group ID assigned before signing (group.length > 1)

### Integration Tests

**`execution.service.integration.test.ts`** (real Postgres, mocked algod + Turnkey + protocol SDKs)
- Full pipeline: actions → POA → policy APPROVED → simulation pass → sign → broadcast → CONFIRMED record written
- Policy BLOCKED: record written with `POLICY_BLOCKED` status, no signing attempted
- Simulation fail: record written with `SIMULATION_FAILED` status, no signing attempted
- Turnkey fail: record written with `FAILED` status
- `ExecutionConfirmed` event emitted after confirmed broadcast
- `ACTED_ON_REBALANCE` behavioral signal emitted to Engine 5
- `execution_transactions` table: INSERT-only (UPDATE attempt rejected by DB)
- Daily volume: second execution that would exceed limit → BLOCKED

---

## Frontend Context Additions

### Screens Required

1. **Execution Preview Panel** — shown before confirmation. Displays all POA steps as a timeline: OPT_IN → SWAP → LEND_DEPOSIT. Each step shows: action type badge, protocol logo, asset, value, estimated slippage. "Confirm Execution" button at bottom.
2. **Execution Status Tracker** — real-time step-by-step progress. Each step: PENDING (grey) → SUBMITTED (blue) → CONFIRMED (green) / FAILED (red). Shows txID with link to allo.info explorer.
3. **High-Value Approval Modal** — shown when `REQUIRES_APPROVAL`. Displays: total value, steps, "I understand this will execute on-chain. Confirm." Must type "CONFIRM" to proceed.
4. **Policy Block Notification** — inline alert explaining why execution was blocked. Plain English. "Your risk score is too high" / "Daily limit reached" / etc.
5. **Execution History** — list of all executions. Status badges, total value, timestamp, "View on Explorer" link.
6. **Autopilot Toggle** — on Strategy page: toggle with confirmation modal. When enabled: shows "Autopilot ON" badge. When disabled: immediate effect.

### UX Rules
- Simulation failures: never surface "simulation failed" raw — translate to user-friendly: "The market moved too fast. The trade was cancelled to protect your funds."
- Every confirmed execution: show Algorand explorer txID link (allo.info/tx/{txId})
- Execution status polling: every 2 seconds while status is SUBMITTED
- POLICY_BLOCKED: clear explanation — never "ERROR" — always plain English reason
- Autopilot: always show confirmation modal before enabling ("Trades will execute without your approval within your safety limits")
- High-value approval modal: require explicit "CONFIRM" text entry (not just a button click)
