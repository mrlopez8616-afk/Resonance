-- 021: Flare vault yield, +6 XRP at 2026-10-09 17:25 CT. A reward, not a buy.
-- Inserts one reward row and sets the flare-vault print to 28287 in one statement,
-- only when the reward row is absent and the print is missing or exactly 28281.
-- A missing print is the founder seed 28281, which is not stored in sleeve_prints.
-- Any other print changes nothing. A second run changes 0 rows.
-- The row is not a buy and not a sell.
WITH guard AS (
  SELECT 1 AS ok
  WHERE NOT EXISTS (
      SELECT 1 FROM fills
      WHERE external_id = 'manual:reward:flare-vault:xrp:2026-10-09t17:25'
         OR payload->>'orderId' = 'reward:flare-vault:XRP:2026-10-09T17:25')
    AND NOT EXISTS (
      SELECT 1 FROM sleeve_prints
      WHERE ticker = 'XRP' AND sleeve_id = 'flare-vault' AND quantity::numeric <> 28281)
),
ins AS (
  INSERT INTO fills (source, external_id, filled_at, symbol, side, quantity, price,
                     venue, sleeve, result, log_only, note, payload)
  SELECT 'manual',
         'manual:reward:flare-vault:xrp:2026-10-09t17:25',
         '2026-10-09T17:25:00-05:00'::timestamptz, 'XRP', 'reward', '6'::numeric, NULL,
         'manual', 'flare-vault', 'filled', false,
         'Vault yield/rewards, manual update',
         '{"kind":"reward","time":"2026-10-09T17:25:00-05:00","symbol":"XRP","quantity":"6","venue":"manual","sleeve":"flare-vault","orderId":"reward:flare-vault:XRP:2026-10-09T17:25","idempotencyKey":"manual:reward:flare-vault:xrp:2026-10-09t17:25","result":"filled","note":"Vault yield/rewards, manual update"}'::jsonb
  FROM guard
  RETURNING external_id
),
dst AS (
  INSERT INTO sleeve_prints (ticker, sleeve_id, quantity)
  SELECT 'XRP', 'flare-vault', '28287' FROM ins
  ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity
  RETURNING sleeve_id, quantity
)
SELECT (SELECT count(*) FROM ins)::int AS reward_rows,
       (SELECT count(*) FROM dst)::int AS vault_rows;
