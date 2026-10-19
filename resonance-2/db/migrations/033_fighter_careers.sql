-- Fighter careers. Number 033.
-- 032 is bankroll deposits. This file inserts no rows.
-- One fighter, and one row per UFC fight. Stats stay null until Fight Desk posts them.
-- The same fighter, date, and opponent is stored once.

CREATE TABLE IF NOT EXISTS fighters (
  slug text PRIMARY KEY,
  name text NOT NULL,
  metadata jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fighter_fights (
  fighter_slug text NOT NULL REFERENCES fighters (slug),
  "date" date NOT NULL,
  event text,
  opponent text NOT NULL,
  result text,
  method text,
  round integer,
  "time" text,
  sig_strikes_landed integer,
  sig_strikes_attempted integer,
  total_strikes_landed integer,
  total_strikes_attempted integer,
  takedowns_landed integer,
  takedowns_attempted integer,
  sub_attempts integer,
  control_time_seconds integer,
  knockdowns integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fighter_slug, "date", opponent),
  CONSTRAINT fighter_fights_result_chk CHECK (
    result IS NULL OR result IN ('win', 'loss', 'draw', 'nc')
  )
);

CREATE INDEX IF NOT EXISTS fighter_fights_slug_date_idx
  ON fighter_fights (fighter_slug, "date" DESC);
