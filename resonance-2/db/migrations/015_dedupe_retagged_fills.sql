-- 011 and 012 set sleeve rh-agentic and venue robinhood on two legacy
-- fills but left source as 'seed'. The next full envelope save keyed
-- source off venue, missed those rows, and inserted robinhood copies
-- with the same external_id. Sleeve prints were not doubled.
--
-- For exactly these external_ids (the bare order id, or the seed: form
-- fillRowKey stored):
--   seed and robinhood both present: delete only the seed row
--   only seed present: set source to robinhood
--   robinhood row missing sleeve or venue: set rh-agentic / robinhood
-- The migrate step also fills a robinhood payload that lacks those fields
-- and logs how many other external_ids still sit under more than one source.
-- It does not delete those others, and it does not change sleeve quantities.
-- A second run changes 0 rows.

DELETE FROM fills
WHERE source = 'seed'
  AND external_id IN (
    '6aad6b7a-415a-4895-b43c-72c0eca79a55',
    'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
    '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
    'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
  )
  AND external_id IN (
    SELECT robinhood.external_id
    FROM fills AS robinhood
    WHERE robinhood.source = 'robinhood'
  )
RETURNING external_id;

UPDATE fills
SET source = 'robinhood',
    sleeve = CASE WHEN sleeve IS NULL OR sleeve = '' THEN 'rh-agentic' ELSE sleeve END,
    venue = CASE WHEN venue IS NULL OR venue = '' THEN 'robinhood' ELSE venue END
WHERE source = 'seed'
  AND external_id IN (
    '6aad6b7a-415a-4895-b43c-72c0eca79a55',
    'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
    '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
    'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
  )
RETURNING external_id;

UPDATE fills
SET sleeve = 'rh-agentic',
    venue = 'robinhood'
WHERE source = 'robinhood'
  AND external_id IN (
    '6aad6b7a-415a-4895-b43c-72c0eca79a55',
    'seed:6aad6b7a-415a-4895-b43c-72c0eca79a55',
    '6aad6b8e-f2a6-4be3-a803-65940a748d8d',
    'seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d'
  )
  AND (
    sleeve IS NULL
    OR sleeve = ''
    OR sleeve <> 'rh-agentic'
    OR venue IS NULL
    OR venue = ''
    OR venue <> 'robinhood'
  )
RETURNING external_id;

SELECT count(*)::int AS multi_source_external_ids
FROM (
  SELECT DISTINCT older.external_id
  FROM fills AS older
  INNER JOIN fills AS newer
    ON older.external_id = newer.external_id
   AND older.source <> newer.source
) AS multi_source;
