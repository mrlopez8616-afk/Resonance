-- 015 matched only the bare order id and the seed: key. The old save
-- wrote the duplicate under fillRowKey. With no idempotencyKey that key
-- is robinhood:<orderId>, and source comes from the venue. 015 deleted
-- nothing, then set the seed row's source to robinhood. Both copies remain.
-- 017 and 018 are reserved. This id is 019.
--
-- For exactly these two order ids, when the group has exactly 2 rows:
-- copy the loser into fills_dedupe_backup, then delete that id.
-- The migrator runs these statements in one transaction.
-- Keep the robinhood:<orderId> row when its source is robinhood and its
-- sleeve is rh-agentic; otherwise keep the earliest row.
-- One row: do nothing. Three or more: do nothing, and the review select
-- names the order id. A second run changes 0 rows and does not copy again.
-- Sleeve quantities are not written.

CREATE TABLE IF NOT EXISTS fills_dedupe_backup (
  migration_id text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  id bigint NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,
  filled_at timestamptz NOT NULL,
  symbol text NOT NULL,
  side text,
  quantity numeric,
  price numeric,
  venue text,
  sleeve text,
  result text NOT NULL,
  log_only boolean NOT NULL,
  note text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (migration_id, id)
);

WITH members AS (
  SELECT
    id, source, external_id, filled_at, symbol, side, quantity, price,
    venue, sleeve, result, log_only, note, payload, created_at
  FROM fills
  WHERE external_id IN (
      '6aad6b7a-415a-4895-b43c-72c0eca79a55',
      'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
      'robinhood:6aad6b7a-415a-4895-b43c-72c0eca79a55'
    )
    OR payload->>'orderId' = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
),
sized AS (
  SELECT count(*) AS n FROM members
),
keeper AS (
  SELECT id
  FROM members
  ORDER BY
    CASE
      WHEN external_id = 'robinhood:6aad6b7a-415a-4895-b43c-72c0eca79a55'
       AND source = 'robinhood'
       AND sleeve = 'rh-agentic' THEN 0
      WHEN source = 'robinhood' AND sleeve = 'rh-agentic' THEN 1
      ELSE 2
    END,
    created_at ASC,
    id ASC
  LIMIT 1
),
copied AS (
  INSERT INTO fills_dedupe_backup (
    migration_id, backed_up_at,
    id, source, external_id, filled_at, symbol, side, quantity, price,
    venue, sleeve, result, log_only, note, payload, created_at
  )
  SELECT
    '019_dedupe_fill_keys', now(),
    m.id, m.source, m.external_id, m.filled_at, m.symbol,
    m.side, m.quantity, m.price, m.venue, m.sleeve,
    m.result, m.log_only, m.note, m.payload, m.created_at
  FROM members AS m
  JOIN sized ON sized.n = 2
  JOIN keeper ON m.id <> keeper.id
  ON CONFLICT (migration_id, id) DO NOTHING
  RETURNING id, source, external_id
)
SELECT id, source, external_id FROM copied;

DELETE FROM fills
WHERE id = (
  SELECT backup.id
  FROM fills_dedupe_backup AS backup
  JOIN (
    SELECT count(*) AS n
    FROM fills
    WHERE external_id IN (
        '6aad6b7a-415a-4895-b43c-72c0eca79a55',
        'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
        'robinhood:6aad6b7a-415a-4895-b43c-72c0eca79a55'
      )
      OR payload->>'orderId' = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
  ) AS sized ON sized.n = 2
  WHERE backup.migration_id = '019_dedupe_fill_keys'
    AND (
      backup.external_id IN (
        '6aad6b7a-415a-4895-b43c-72c0eca79a55',
        'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
        'robinhood:6aad6b7a-415a-4895-b43c-72c0eca79a55'
      )
      OR backup.payload->>'orderId' = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
    )
  ORDER BY backup.id
  LIMIT 1
)
RETURNING id, source, external_id;

WITH members AS (
  SELECT
    id, source, external_id, filled_at, symbol, side, quantity, price,
    venue, sleeve, result, log_only, note, payload, created_at
  FROM fills
  WHERE external_id IN (
      '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
      'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d',
      'robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
    )
    OR payload->>'orderId' = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
),
sized AS (
  SELECT count(*) AS n FROM members
),
keeper AS (
  SELECT id
  FROM members
  ORDER BY
    CASE
      WHEN external_id = 'robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
       AND source = 'robinhood'
       AND sleeve = 'rh-agentic' THEN 0
      WHEN source = 'robinhood' AND sleeve = 'rh-agentic' THEN 1
      ELSE 2
    END,
    created_at ASC,
    id ASC
  LIMIT 1
),
copied AS (
  INSERT INTO fills_dedupe_backup (
    migration_id, backed_up_at,
    id, source, external_id, filled_at, symbol, side, quantity, price,
    venue, sleeve, result, log_only, note, payload, created_at
  )
  SELECT
    '019_dedupe_fill_keys', now(),
    m.id, m.source, m.external_id, m.filled_at, m.symbol,
    m.side, m.quantity, m.price, m.venue, m.sleeve,
    m.result, m.log_only, m.note, m.payload, m.created_at
  FROM members AS m
  JOIN sized ON sized.n = 2
  JOIN keeper ON m.id <> keeper.id
  ON CONFLICT (migration_id, id) DO NOTHING
  RETURNING id, source, external_id
)
SELECT id, source, external_id FROM copied;

DELETE FROM fills
WHERE id = (
  SELECT backup.id
  FROM fills_dedupe_backup AS backup
  JOIN (
    SELECT count(*) AS n
    FROM fills
    WHERE external_id IN (
        '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
        'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d',
        'robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
      )
      OR payload->>'orderId' = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
  ) AS sized ON sized.n = 2
  WHERE backup.migration_id = '019_dedupe_fill_keys'
    AND (
      backup.external_id IN (
        '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
        'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d',
        'robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
      )
      OR backup.payload->>'orderId' = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
    )
  ORDER BY backup.id
  LIMIT 1
)
RETURNING id, source, external_id;

SELECT order_id AS manual_review_order_id, row_count
FROM (
  SELECT '6aad6b7a-415a-4895-b43c-72c0eca79a55' AS order_id, count(*)::int AS row_count
  FROM fills
  WHERE external_id IN (
      '6aad6b7a-415a-4895-b43c-72c0eca79a55',
      'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
      'robinhood:6aad6b7a-415a-4895-b43c-72c0eca79a55'
    )
    OR payload->>'orderId' = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
) AS grouped
WHERE row_count >= 3
UNION ALL
SELECT order_id, row_count
FROM (
  SELECT '6aad6b8e-f2a6-4be3-a803-65940a748d8d' AS order_id, count(*)::int AS row_count
  FROM fills
  WHERE external_id IN (
      '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
      'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d',
      'robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
    )
    OR payload->>'orderId' = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
) AS grouped
WHERE row_count >= 3;
