-- Factory Floor wall on /tv. One queued Build Tracker row.
-- Idempotent. A second run inserts 0 rows.

INSERT INTO build_items (id, title, node, pr_number, status, steps, next_step, sort_order, updated_at)
SELECT
  'platform-factory-floor',
  'Factory Floor TV wall',
  'platform',
  NULL,
  'queued',
  '[{"id":"spec","label":"spec written","done":false},{"id":"pr-open","label":"PR open","done":false},{"id":"tests-build","label":"local tests and build pass","done":false},{"id":"merged","label":"merged","done":false},{"id":"verified-prod","label":"verified on prod","done":false}]'::jsonb,
  NULL,
  95,
  '2026-10-11 12:00:00-05'::timestamptz
WHERE NOT EXISTS (
  SELECT 1 FROM build_items WHERE id = 'platform-factory-floor'
);
