-- Future Ideas seeds. Number 044.
-- Two membership ideas from Oct 29, 2026.
-- A row is skipped when that title or seed id is already stored, so an edit is left alone.
-- The rewards row is someday: parked, not queued to build.
-- Its owner tag keeps it off Public view.

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

INSERT INTO future_ideas (id, title, note, status, tags, added_on)
SELECT
  'resonance-member-rewards',
  'Resonance Member Rewards',
  'future paid membership with real member login to explore the architecture and Public view. Partner affiliate discounts (e.g., 10–15% off protein). Resonance-funded stacking bonus that grows with repeat purchases (e.g., 10%+1% first buy, laddering toward ~20–25% total), with tier phase lines tied to treasury health. Founder: "down the road, lock it in." (Oct 29, 2026)',
  'someday',
  '["owner"]'::jsonb,
  '2026-10-29'::date
WHERE NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE title = 'Resonance Member Rewards'
)
AND NOT EXISTS (
  SELECT 1 FROM future_ideas WHERE id = 'resonance-member-rewards'
);
