-- Factorio snapshots from the resonance-bridge mod. Number 046.
-- 045 stores YouTube analytics. This file does not change those tables.
-- One row per game tick. A repeat of the same tick replaces that row.
-- Older ticks stay, so the node can chart rockets and play hours.
-- The ingest token is stored only as a sha256 hex digest.
-- Idempotent: CREATE is IF NOT EXISTS. A second run inserts nothing.

CREATE TABLE IF NOT EXISTS factorio_tokens (
  id integer PRIMARY KEY CHECK (id = 1),
  token_hash text NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS factorio_snapshots (
  tick bigint PRIMARY KEY,
  play_hours numeric NOT NULL,
  rockets_launched integer NOT NULL,
  technologies_researched integer NOT NULL,
  current_research text,
  research_progress numeric,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  production jsonb NOT NULL DEFAULT '[]'::jsonb,
  consumption jsonb NOT NULL DEFAULT '[]'::jsonb,
  science_produced jsonb NOT NULL DEFAULT '{}'::jsonb,
  machines jsonb NOT NULL DEFAULT '{}'::jsonb,
  surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_time text,
  reason text,
  source text NOT NULL,
  version text,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS factorio_snapshots_received_idx
  ON factorio_snapshots (received_at DESC, tick DESC);
