-- Encrypted finance snapshots. Aggregates only.
-- Number 008 leaves 006 and 007 for other in-flight branches.
-- The migrator applies this id when those numbers are absent.
-- payload_enc, iv, and tag are AES-256-GCM (base64 text). Plaintext is not stored.

CREATE TABLE IF NOT EXISTS finance_snapshots (
  as_of date PRIMARY KEY,
  schema_version integer NOT NULL,
  sha256 text NOT NULL,
  payload_enc text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  stored_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_snapshots_sha256_idx ON finance_snapshots (sha256);
