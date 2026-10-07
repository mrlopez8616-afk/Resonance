-- Optional conviction on a ticket. Nullable. Existing rows stay NULL.
-- Values used by the desk are STRONG and LEAN. Apply by hand in Neon
-- if this environment shares the production database and skips prebuild migrate.

ALTER TABLE bets ADD COLUMN IF NOT EXISTS tier text;
