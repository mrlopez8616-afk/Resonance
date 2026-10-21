-- Oct 17 2026 UFC Fight Night was stored twice: Buckley vs Malott and Edmonton.
-- Number 035. 034 is the SUI Coinbase balance.
-- Copy every affected row into fight_event_merge_backup, then point the
-- live row at UFC Fight Night: Buckley vs Malott.
-- Rows are updated, never deleted. A second run copies nothing and updates nothing.
-- A breakdown whose fight already exists on the Buckley slug stays put.
-- The read path aliases that slug. The backup still has the row.
-- Payload event fields are rewritten by the migrator after these statements.

CREATE TABLE IF NOT EXISTS fight_event_merge_backup (
  migration_id text NOT NULL,
  table_name text NOT NULL,
  row_key text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  PRIMARY KEY (migration_id, table_name, row_key)
);

INSERT INTO fight_event_merge_backup (migration_id, table_name, row_key, payload)
SELECT
  '035_merge_edmonton_buckley',
  'bets',
  id,
  payload
FROM bets
WHERE (
    lower(event) LIKE '%edmonton%'
    AND lower(event) NOT LIKE '%buckley%'
    AND lower(event) NOT LIKE '%malott%'
    AND lower(event) NOT LIKE '% vs%'
    AND (lower(event) LIKE '%ufc%' OR lower(event) = 'edmonton')
  )
  OR (
    lower(coalesce(payload->>'event', '')) LIKE '%edmonton%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '%buckley%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '%malott%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '% vs%'
    AND (
      lower(coalesce(payload->>'event', '')) LIKE '%ufc%'
      OR lower(coalesce(payload->>'event', '')) = 'edmonton'
    )
  )
ON CONFLICT (migration_id, table_name, row_key) DO NOTHING;

UPDATE bets
SET event = 'UFC Fight Night: Buckley vs Malott',
    updated_at = now()
WHERE (
    lower(event) LIKE '%edmonton%'
    AND lower(event) NOT LIKE '%buckley%'
    AND lower(event) NOT LIKE '%malott%'
    AND lower(event) NOT LIKE '% vs%'
    AND (lower(event) LIKE '%ufc%' OR lower(event) = 'edmonton')
  )
  OR (
    lower(coalesce(payload->>'event', '')) LIKE '%edmonton%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '%buckley%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '%malott%'
    AND lower(coalesce(payload->>'event', '')) NOT LIKE '% vs%'
    AND (
      lower(coalesce(payload->>'event', '')) LIKE '%ufc%'
      OR lower(coalesce(payload->>'event', '')) = 'edmonton'
    )
  );

INSERT INTO fight_event_merge_backup (migration_id, table_name, row_key, payload)
SELECT
  '035_merge_edmonton_buckley',
  'fight_breakdowns',
  event_slug || '/' || fight_slug,
  concat('{"event_slug":"', event_slug, '","fight_slug":"', fight_slug, '"}')::jsonb
FROM fight_breakdowns
WHERE lower(event_slug) LIKE '%edmonton%'
  AND lower(event_slug) NOT LIKE '%buckley%'
  AND lower(event_slug) NOT LIKE '%malott%'
  AND lower(event_slug) NOT LIKE '% vs%'
  AND (lower(event_slug) LIKE '%ufc%' OR lower(event_slug) = 'edmonton')
ON CONFLICT (migration_id, table_name, row_key) DO NOTHING;

UPDATE fight_breakdowns
SET event_slug = 'ufc-fight-night-buckley-vs-malott',
    updated_at = now()
WHERE lower(event_slug) LIKE '%edmonton%'
  AND lower(event_slug) NOT LIKE '%buckley%'
  AND lower(event_slug) NOT LIKE '%malott%'
  AND lower(event_slug) NOT LIKE '% vs%'
  AND (lower(event_slug) LIKE '%ufc%' OR lower(event_slug) = 'edmonton')
  AND fight_slug NOT IN (
    SELECT fight_slug
    FROM fight_breakdowns
    WHERE event_slug = 'ufc-fight-night-buckley-vs-malott'
  );

INSERT INTO fight_event_merge_backup (migration_id, table_name, row_key, payload)
SELECT
  '035_merge_edmonton_buckley',
  'fight_results',
  fight_slug,
  payload
FROM fight_results
WHERE lower(event) LIKE '%edmonton%'
  AND lower(event) NOT LIKE '%buckley%'
  AND lower(event) NOT LIKE '%malott%'
  AND lower(event) NOT LIKE '% vs%'
  AND (lower(event) LIKE '%ufc%' OR lower(event) = 'edmonton')
ON CONFLICT (migration_id, table_name, row_key) DO NOTHING;

UPDATE fight_results
SET event = 'ufc-fight-night-buckley-vs-malott',
    updated_at = now()
WHERE lower(event) LIKE '%edmonton%'
  AND lower(event) NOT LIKE '%buckley%'
  AND lower(event) NOT LIKE '%malott%'
  AND lower(event) NOT LIKE '% vs%'
  AND (lower(event) LIKE '%ufc%' OR lower(event) = 'edmonton');

INSERT INTO fight_event_merge_backup (migration_id, table_name, row_key, payload)
SELECT
  '035_merge_edmonton_buckley',
  'calendar_entries',
  id,
  payload
FROM calendar_entries
WHERE (
    lower(coalesce(event_slug, '')) LIKE '%edmonton%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '%buckley%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '%malott%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '% vs%'
    AND (
      lower(coalesce(event_slug, '')) LIKE '%ufc%'
      OR lower(coalesce(event_slug, '')) = 'edmonton'
    )
  )
  OR (
    lower(title) LIKE '%edmonton%'
    AND lower(title) NOT LIKE '%buckley%'
    AND lower(title) NOT LIKE '%malott%'
    AND lower(title) NOT LIKE '% vs%'
    AND (lower(title) LIKE '%ufc%' OR lower(title) = 'edmonton')
  )
ON CONFLICT (migration_id, table_name, row_key) DO NOTHING;

UPDATE calendar_entries
SET event_slug = 'ufc-fight-night-buckley-vs-malott',
    updated_at = now()
WHERE (
    lower(coalesce(event_slug, '')) LIKE '%edmonton%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '%buckley%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '%malott%'
    AND lower(coalesce(event_slug, '')) NOT LIKE '% vs%'
    AND (
      lower(coalesce(event_slug, '')) LIKE '%ufc%'
      OR lower(coalesce(event_slug, '')) = 'edmonton'
    )
  )
  OR (
    lower(title) LIKE '%edmonton%'
    AND lower(title) NOT LIKE '%buckley%'
    AND lower(title) NOT LIKE '%malott%'
    AND lower(title) NOT LIKE '% vs%'
    AND (lower(title) LIKE '%ufc%' OR lower(title) = 'edmonton')
  );
