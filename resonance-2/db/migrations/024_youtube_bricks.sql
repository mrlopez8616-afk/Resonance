-- Brick Tracker episode overlay. Number 024.
-- 023 is the Factory Floor wall, so this id skips it.
-- One row per build item the hub has set. A missing row reads as idea.
-- Stores status, an optional video URL, and an optional note.
-- Titles and lesson text stay on build_items and lessons. This file inserts no rows.
-- Idempotent: CREATE is IF NOT EXISTS. A second run changes nothing.

CREATE TABLE IF NOT EXISTS youtube_brick_episodes (
  brick_id text PRIMARY KEY REFERENCES build_items (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'scripted', 'filmed', 'posted')),
  video_url text,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
