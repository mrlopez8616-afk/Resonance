-- Approval queue. A row is a request and, later, a recorded decision.
-- Approving or declining does not move money, place a trade, or call out.
-- Idempotent: CREATE is IF NOT EXISTS. A second run changes nothing.
-- Number 022. 021 is the vault reward. This file inserts no rows.

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  requested_by_agent text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('trade', 'transfer', 'build', 'other')),
  node text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  decided_by text CHECK (decided_by IS NULL OR decided_by IN ('owner', 'operator')),
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL,
  UNIQUE (idempotency_key),
  CONSTRAINT approvals_pending_clear CHECK (
    status <> 'pending'
    OR (decided_by IS NULL AND decided_at IS NULL AND decision_note IS NULL)
  ),
  CONSTRAINT approvals_decided_set CHECK (
    status = 'pending'
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS approvals_status_created_idx
  ON approvals (status, created_at DESC);
