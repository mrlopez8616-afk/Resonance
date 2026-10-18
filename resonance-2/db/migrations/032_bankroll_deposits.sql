-- Bankroll deposits. Number 032.
-- 031 is manual fitness summaries. This file inserts no rows.
-- A deposit dated on or after 2026-10-07 adds to the bankroll.
-- A negative amount is a withdrawal. The same id is stored once.

CREATE TABLE IF NOT EXISTS bankroll_deposits (
  id text PRIMARY KEY,
  "date" date NOT NULL,
  amount numeric(12,2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
