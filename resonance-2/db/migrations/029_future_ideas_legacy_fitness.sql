-- Future Ideas seeds. Number 029.
-- Two Founder ideas from Oct 13, 2026. A row is skipped when that title
-- or seed id is already stored, so an edit is left alone.
-- added_on is the day the row is inserted. This file names no date.

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'nuevo-arcabuz',
  'Legacy / Nuevo Arcabuz',
  'A new Club de Arcabuz: a building, Saturday dances, scholarships, elder care, and an eventual UBI for about 1,500 people. Pieces: a founding book, charter, endowment, building, living record, and successors. Owned by the Nuevo Arcabuz agent.',
  'idea',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Legacy / Nuevo Arcabuz'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'nuevo-arcabuz'
);

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'fitness-auto-sync',
  'Fitness auto-sync (Health Auto Export)',
  'Automatic steps and runs through the Health Auto Export app''s REST API automation (Premium, $6.99 a year or $24.99 lifetime). Parked for a few weeks.',
  'someday',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Fitness auto-sync (Health Auto Export)'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'fitness-auto-sync'
);
