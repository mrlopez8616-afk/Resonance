-- Header names on a rejected fitness ingest. Number 051.
-- 050 created ingest_attempts. This file adds one text column.
-- The column stores a JSON array of header names. It does not store values.
-- Idempotent: ADD COLUMN is IF NOT EXISTS. A second run changes nothing.
-- This file inserts nothing.

ALTER TABLE ingest_attempts ADD COLUMN IF NOT EXISTS auth_headers text;
