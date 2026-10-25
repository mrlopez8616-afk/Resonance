-- Soft void for a bankroll deposit. Number 036.
-- 035 merges the Edmonton card. This file inserts no rows.
-- voided_at keeps the row and drops it from cash totals.
-- A second run adds nothing.

ALTER TABLE bankroll_deposits ADD COLUMN IF NOT EXISTS voided_at timestamptz;

ALTER TABLE bankroll_deposits ADD COLUMN IF NOT EXISTS void_reason text;
