-- OBS recording posts from the PC. Number 048.
-- 047 stores printer ink. This file does not change those tables.
-- One row per folder, file name, and created time. A repeat updates that row.
-- The ingest token is stored only as a sha256 hex digest.
-- Idempotent: CREATE is IF NOT EXISTS. A second run inserts nothing.

CREATE TABLE IF NOT EXISTS obs_tokens (
  id integer PRIMARY KEY CHECK (id = 1),
  token_hash text NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS obs_recordings (
  recording_key text PRIMARY KEY,
  file_name text NOT NULL,
  folder text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_sec numeric,
  created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS obs_recordings_created_idx
  ON obs_recordings (created_at DESC, recording_key);
