-- Future Ideas bulletin. Number 025.
-- One row per idea the founder wants on the board.
-- Status is idea, someday, queued, or done.
-- A seed inserts only when that id is absent. A second run does not overwrite an edit.

CREATE TABLE IF NOT EXISTS future_ideas (
  id text PRIMARY KEY,
  title text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'someday', 'queued', 'done')),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_on date NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS future_ideas_added_idx ON future_ideas (added_on DESC, id);

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'driving-tracker',
  'Driving-tracker node',
  'A node that tracks driving.',
  'idea',
  '["node"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'driving-tracker');

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'resonance-shell',
  'Resonance shell / membership product',
  'Mirrors the nine nodes and the treasury. Founder''s notes. Adopt or stay. Not financial advice. A possible bridge to the Jake Claver mastermind.',
  'idea',
  '["product"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'resonance-shell');

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'per-node-dca',
  '$1/day per-node DCA once cash is steady',
  'A daily buy on each node, once cash is steady.',
  'someday',
  '["dca"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'per-node-dca');

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'resonance-world',
  'Resonance world / game-view',
  'Agents as town characters. The Founder character is user-controlled. Brainstorm only, and not queued to build.',
  'idea',
  '["brainstorm"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'resonance-world');

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'chart-time-range',
  'Chart time-range',
  'Already shipped (#99).',
  'done',
  '["shipped"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'chart-time-range');

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'health-of-the-machine',
  'Health of the Machine',
  'Already shipped (#98).',
  'done',
  '["shipped"]'::jsonb,
  '2026-10-11'::date
WHERE NOT EXISTS (SELECT 1 FROM future_ideas WHERE id = 'health-of-the-machine');
