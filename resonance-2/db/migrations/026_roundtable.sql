-- Roundtable. Number 026.
-- 025 is Future Ideas.
-- Agents post a thread to the founder. audience is founder or youtube.
-- The default is founder. The floor does not show youtube yet.
-- This file inserts no rows. An empty table reads as no messages yet.
-- Idempotent: CREATE is IF NOT EXISTS. A second run changes nothing.

CREATE TABLE IF NOT EXISTS roundtable_threads (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  title text NOT NULL,
  audience text NOT NULL DEFAULT 'founder' CHECK (audience IN ('founder', 'youtube')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roundtable_threads_audience_updated_idx
  ON roundtable_threads (audience, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS roundtable_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES roundtable_threads (id) ON DELETE CASCADE,
  author_kind text NOT NULL CHECK (author_kind IN ('agent', 'founder')),
  author_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roundtable_messages_thread_idx
  ON roundtable_messages (thread_id, created_at, id);
