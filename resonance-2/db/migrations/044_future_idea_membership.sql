-- Future Ideas seed. Number 044.
-- One membership idea from Oct 29, 2026.
-- A row is skipped when that title or seed id is already stored, so an edit is left alone.

INSERT INTO future_ideas (id, title, note, status, added_on)
SELECT
  'membership-access-tier',
  'Membership access tier — paid membership granting access to explore Resonance (Oct 29, 2026)',
  '',
  'idea',
  '2026-10-29'::date
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Membership access tier — paid membership granting access to explore Resonance (Oct 29, 2026)'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'membership-access-tier'
);
