-- Health route lesson. Number 039.
-- 038 created the backup log. This file inserts one lesson
-- when that id is absent, and does not change a row that is already stored.

INSERT INTO lessons (id, date, title, category, what_changed, why, lesson, public_safe, sources)
SELECT
  'LL-049',
  DATE '2026-10-28',
  'A health check the login gate cannot hide',
  'build process',
  'GET /api/health/full checks every home tile and node page with the same loaders the pages use. It answers with a status, whether the data is stale, and the age in seconds. A dedicated read-only token opens it. The login gate lets that route through to its own check.',
  'The health check was blind behind the login gate, so a sweep could not see a broken tile without a session.',
  'A check that cannot run cannot catch a break. The token is read-only, separate from the sync secret, and the report carries statuses and ages only.',
  true,
  '["founder request, Oct 28 2026"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM lessons WHERE id = 'LL-049'
);
