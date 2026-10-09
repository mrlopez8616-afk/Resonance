-- 020: Coinbase internal transfer, 1.2 SUI from cb-agentic to coinbase,
-- 2026-10-09 about 16:59 CT. Not a trade, no realized P/L.
-- Inserts one transfer row and moves both SUI prints in the same statement,
-- only when: the transfer row is absent, the cb-agentic SUI print is exactly 1.2,
-- the coinbase SUI print is absent or exactly 33.7, and buy 4f8720ee sits in cb-agentic.
-- The buy row is not changed. A second run changes 0 rows.
WITH guard AS (
  SELECT 1 AS ok
  WHERE NOT EXISTS (
      SELECT 1 FROM fills
      WHERE external_id = 'coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59'
         OR payload->>'orderId' = 'transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59')
    AND EXISTS (
      SELECT 1 FROM sleeve_prints
      WHERE ticker = 'SUI' AND sleeve_id = 'cb-agentic' AND quantity::numeric = 1.2)
    AND NOT EXISTS (
      SELECT 1 FROM sleeve_prints
      WHERE ticker = 'SUI' AND sleeve_id = 'coinbase' AND quantity::numeric <> 33.7)
    AND EXISTS (
      SELECT 1 FROM fills
      WHERE symbol = 'SUI' AND sleeve = 'cb-agentic'
        AND payload->>'orderId' = '4f8720ee-fd80-4a8e-b7f2-ec4c9f8c1f79')
),
ins AS (
  INSERT INTO fills (source, external_id, filled_at, symbol, side, quantity, price,
                     venue, sleeve, result, log_only, note, payload)
  SELECT 'coinbase',
         'coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59',
         '2026-10-09T16:59:00-05:00'::timestamptz, 'SUI', 'transfer', '1.2'::numeric, NULL,
         'coinbase', NULL, 'filled', false,
         'Coinbase portfolio transfer Agentic d757d013 to Default 5aba0d3b. Not a trade.',
         '{"kind":"transfer","time":"2026-10-09T16:59:00-05:00","symbol":"SUI","quantity":"1.2","venue":"coinbase","fromSleeve":"cb-agentic","toSleeve":"coinbase","orderId":"transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59","idempotencyKey":"coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59","result":"filled","note":"Coinbase portfolio transfer Agentic d757d013 to Default 5aba0d3b. Not a trade."}'::jsonb
  FROM guard
  RETURNING external_id
),
src AS (
  UPDATE sleeve_prints SET quantity = '0'
  WHERE ticker = 'SUI' AND sleeve_id = 'cb-agentic' AND EXISTS (SELECT 1 FROM ins)
  RETURNING sleeve_id, quantity
),
dst AS (
  INSERT INTO sleeve_prints (ticker, sleeve_id, quantity)
  SELECT 'SUI', 'coinbase', '34.9' FROM ins
  ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity
  RETURNING sleeve_id, quantity
)
SELECT (SELECT count(*) FROM ins)::int AS transfer_rows,
       (SELECT count(*) FROM src)::int AS from_rows,
       (SELECT count(*) FROM dst)::int AS to_rows;
