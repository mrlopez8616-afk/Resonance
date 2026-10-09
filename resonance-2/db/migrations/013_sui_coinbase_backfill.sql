-- Backfill the two Coinbase SUI buys that already sit in the coinbase
-- sleeve quantity (16.8 + 16.9 = 33.7). Inserts a fill only when that
-- order id is absent. backfill is true so a later replay does not move
-- the sleeve. Does not write sleeve_prints and does not re-apply sleeve math.
-- A second run inserts 0 rows.

INSERT INTO fills (
  source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, payload
)
SELECT
  'coinbase',
  'coinbase:6bab89a3-fdbb-4768-92f4-dbb5654bf1f3',
  '2026-09-18T12:49:23-05:00'::timestamptz,
  'SUI',
  'buy',
  '16.8'::numeric,
  '0.8020710385'::numeric,
  'coinbase',
  'coinbase',
  'filled',
  '{"time":"2026-09-18T12:49:23-05:00","symbol":"SUI","side":"buy","quantity":"16.8","price":"0.8020710385","orderId":"6bab89a3-fdbb-4768-92f4-dbb5654bf1f3","result":"filled","venue":"coinbase","sleeve":"coinbase","idempotencyKey":"coinbase:6bab89a3-fdbb-4768-92f4-dbb5654bf1f3","backfill":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM fills
  WHERE external_id = '6bab89a3-fdbb-4768-92f4-dbb5654bf1f3'
     OR external_id LIKE '%6bab89a3-fdbb-4768-92f4-dbb5654bf1f3'
     OR payload->>'orderId' = '6bab89a3-fdbb-4768-92f4-dbb5654bf1f3'
)
RETURNING external_id;

INSERT INTO fills (
  source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, payload
)
SELECT
  'coinbase',
  'coinbase:4ef87d64-62b4-42f1-ac48-7db6941d5ba8',
  '2026-09-18T12:51:58-05:00'::timestamptz,
  'SUI',
  'buy',
  '16.9'::numeric,
  '0.8019'::numeric,
  'coinbase',
  'coinbase',
  'filled',
  '{"time":"2026-09-18T12:51:58-05:00","symbol":"SUI","side":"buy","quantity":"16.9","price":"0.8019","orderId":"4ef87d64-62b4-42f1-ac48-7db6941d5ba8","result":"filled","venue":"coinbase","sleeve":"coinbase","idempotencyKey":"coinbase:4ef87d64-62b4-42f1-ac48-7db6941d5ba8","backfill":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM fills
  WHERE external_id = '4ef87d64-62b4-42f1-ac48-7db6941d5ba8'
     OR external_id LIKE '%4ef87d64-62b4-42f1-ac48-7db6941d5ba8'
     OR payload->>'orderId' = '4ef87d64-62b4-42f1-ac48-7db6941d5ba8'
)
RETURNING external_id;
