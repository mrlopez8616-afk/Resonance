-- Future Ideas seeds. Number 027.
-- 026 is left open. This file does not create the roundtable table.
-- One insert per idea. A row is skipped when that title is already stored,
-- or when the seed id is already stored, so an edit is left alone.
-- added_on is the day the row is inserted. This file names no date.

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'roundtable',
  'Roundtable',
  'Agents talk to the Founder, later to the YouTube channel.',
  'idea',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Roundtable'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'roundtable'
);

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'own-apps',
  'Own apps',
  'Resonance''s own apps.',
  'idea',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Own apps'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'own-apps'
);

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'mastermind',
  'Mastermind',
  'A subscription makes buyers Resonance members in a mastermind with the Founder (meetings, events), framed as a mirror to follow, not financial advice.',
  'idea',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Mastermind'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'mastermind'
);

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'factory-floor-redesign',
  'Factory Floor redesign',
  '',
  'idea',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Factory Floor redesign'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'factory-floor-redesign'
);
