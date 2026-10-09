-- One-off data correction: the 2026-09-18 sell of 10 XRP
-- (order 6aad6b7a-415a-4895-b43c-72c0eca79a55) was stored with a null
-- sleeve and no venue, so per-sleeve sums skipped those 10 tokens.
-- Sets that one row to rh-agentic / robinhood. A second run updates 0 rows.
-- Does not write sleeve_prints and does not re-apply sleeve math.
-- The migrate step also writes sleeve and venue into this row's payload,
-- because the operator log reads the payload. Other null-sleeve rows stay null.

UPDATE fills
SET sleeve = 'rh-agentic',
    venue = 'robinhood'
WHERE symbol = 'XRP'
  AND sleeve IS NULL
  AND (
    external_id = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
    OR external_id LIKE '%6aad6b7a-415a-4895-b43c-72c0eca79a55'
    OR payload->>'orderId' = '6aad6b7a-415a-4895-b43c-72c0eca79a55'
  )
RETURNING external_id;
