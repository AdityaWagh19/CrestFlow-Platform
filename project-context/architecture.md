# CrestFlow — Architecture

> This file evolves with the project.
> DB schemas are added and updated here as each domain is implemented.
> All schemas must align with the domain model defined in `system-architecture.png` and `instructions.md`.

---

## Schema Conventions

- All monetary values stored as `DECIMAL` or `TEXT` (never `FLOAT` or `DOUBLE`)
- All timestamps stored as `TIMESTAMPTZ` (UTC)
- All IDs use `UUID` unless a natural key exists
- All financial snapshots are immutable once committed — append-only
- Audit log tables are append-only — no deletes, no updates

---

## Domains

1. [Identity](#identity)
2. [Portfolio](#portfolio)
3. [Risk](#risk)
4. [Yield](#yield)
5. [Strategy](#strategy)
6. [Execution](#execution)
7. [User Intelligence](#user-intelligence)
8. [Audit](#audit)

---

## Identity

> Covers: user accounts, embedded wallets, KYC status, DID/VC linkage.

*Schema to be added when onboarding module is implemented.*

---

## Portfolio

> Covers: assets, positions, snapshots, allocation, exposure, PnL, cost basis, health scores.

*Schema to be added when Engine 1 is implemented.*

---

## Risk

> Covers: risk scores, concentration records, liquidity analysis, liquidation monitoring, alerts.

*Schema to be added when Engine 2 is implemented.*

---

## Yield

> Covers: opportunities, rankings, sustainability scores, idle capital records.

*Schema to be added when Engine 4 is implemented.*

---

## Strategy

> Covers: recommendations, rebalancing plans, strategy records, expected outcomes.

*Schema to be added when Engine 3 is implemented.*

---

## Execution

> Covers: execution plans (POA), transaction records, simulation results, execution status.

*Schema to be added when Engine 6 is implemented.*

---

## User Intelligence

> Covers: investor profiles, personas, goals, behavioral signals, risk tolerance bands.

*Schema to be added when Engine 5 is implemented.*

---

## Audit

> Immutable, append-only. All financial actions must produce an audit entry.

*Schema to be added when execution pipeline is implemented.*
