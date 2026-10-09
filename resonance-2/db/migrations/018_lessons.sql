-- Lessons learned. Number 018 leaves 017 for the public-mode PIN tables.
-- Migration 019 (fill-dedupe follow-up) already shipped; this id sits before it.
-- sources is owner-only and is never returned in public mode.
-- This file inserts no rows. The hub posts LL-001 through LL-047
-- from cabinet/lessons-seed.json.

CREATE TABLE IF NOT EXISTS lessons (
  id text PRIMARY KEY,
  date date NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  what_changed text NOT NULL,
  why text NOT NULL,
  lesson text NOT NULL,
  public_safe boolean NOT NULL DEFAULT false,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  build_item_id text REFERENCES build_items (id) ON DELETE SET NULL,
  pr_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lessons_date_idx ON lessons (date);

CREATE INDEX IF NOT EXISTS lessons_build_item_idx ON lessons (build_item_id);
