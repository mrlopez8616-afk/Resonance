-- Health Auto Export ingest token. Number 043.
-- 042 is reserved by the visitor-analytics pull request.
-- If 042 is still free when this file is merged, leave the number at 043.
-- The token is stored only as a sha256 hex digest. The plaintext is not stored.
-- A second run changes nothing.

CREATE TABLE IF NOT EXISTS health_auto_export_tokens (
  id integer PRIMARY KEY CHECK (id = 1),
  token_hash text NOT NULL,
  updated_at timestamptz NOT NULL
);
