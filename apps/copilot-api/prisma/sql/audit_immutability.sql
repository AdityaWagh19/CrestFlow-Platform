-- Audit Layer Immutability Enforcement
-- Apply after Prisma migrations to prevent UPDATE/DELETE on audit tables.
-- Run with: psql $DATABASE_URL -f prisma/sql/audit_immutability.sql

-- Prevent UPDATE on audit_entries
CREATE OR REPLACE RULE audit_entries_no_update AS
  ON UPDATE TO audit_entries DO INSTEAD NOTHING;

-- Prevent DELETE on audit_entries
CREATE OR REPLACE RULE audit_entries_no_delete AS
  ON DELETE TO audit_entries DO INSTEAD NOTHING;

-- Prevent UPDATE on execution_transactions (INSERT-only audit trail)
CREATE OR REPLACE RULE execution_transactions_no_update AS
  ON UPDATE TO execution_transactions DO INSTEAD NOTHING;

-- Prevent DELETE on execution_transactions
CREATE OR REPLACE RULE execution_transactions_no_delete AS
  ON DELETE TO execution_transactions DO INSTEAD NOTHING;

-- Prevent UPDATE/DELETE on portfolio_snapshots (immutable snapshots)
CREATE OR REPLACE RULE portfolio_snapshots_no_update AS
  ON UPDATE TO portfolio_snapshots DO INSTEAD NOTHING;

CREATE OR REPLACE RULE portfolio_snapshots_no_delete AS
  ON DELETE TO portfolio_snapshots DO INSTEAD NOTHING;

-- Prevent UPDATE/DELETE on risk_snapshots
CREATE OR REPLACE RULE risk_snapshots_no_update AS
  ON UPDATE TO risk_snapshots DO INSTEAD NOTHING;

CREATE OR REPLACE RULE risk_snapshots_no_delete AS
  ON DELETE TO risk_snapshots DO INSTEAD NOTHING;

-- Prevent UPDATE/DELETE on strategy_snapshots
CREATE OR REPLACE RULE strategy_snapshots_no_update AS
  ON UPDATE TO strategy_snapshots DO INSTEAD NOTHING;

CREATE OR REPLACE RULE strategy_snapshots_no_delete AS
  ON DELETE TO strategy_snapshots DO INSTEAD NOTHING;

-- Prevent UPDATE/DELETE on yield_opportunity_snapshots
CREATE OR REPLACE RULE yield_opportunity_snapshots_no_update AS
  ON UPDATE TO yield_opportunity_snapshots DO INSTEAD NOTHING;

CREATE OR REPLACE RULE yield_opportunity_snapshots_no_delete AS
  ON DELETE TO yield_opportunity_snapshots DO INSTEAD NOTHING;
