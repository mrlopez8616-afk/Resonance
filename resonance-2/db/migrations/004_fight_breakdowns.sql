-- Per-fight breakdowns for any event slug. UFC 332 stays on its static files.
-- Idempotent. Production prebuild applies this the same way as 003_bet_tier.sql.

CREATE TABLE IF NOT EXISTS fight_breakdowns (
  event_slug text NOT NULL,
  fight_slug text NOT NULL,
  fight_n integer,
  card text,
  slot text,
  division text,
  rounds integer,
  a_name text,
  b_name text,
  lean text,
  conf text,
  tier text,
  method text,
  why text,
  x_factor text,
  edges jsonb,
  odds jsonb,
  stats jsonb,
  links jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_slug, fight_slug)
);
