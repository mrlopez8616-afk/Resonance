-- One-off data correction: the 2026-09-18 buy of 16.931 SUI
-- (order 6aad6b8e-f2a6-4be3-a803-65940a748d8d, the SUI leg of the
-- XRP→SUI swap) was stored with a null sleeve and no venue.
-- Sets that one row to rh-agentic / robinhood. A second run updates 0 rows.
-- Does not write sleeve_prints and does not re-apply sleeve math.
-- The migrate step also writes sleeve and venue into this row's payload,
-- because the operator log reads the payload. Other null-sleeve rows stay null.

UPDATE fills
SET sleeve = 'rh-agentic',
    venue = 'robinhood'
WHERE symbol = 'SUI'
  AND sleeve IS NULL
  AND (
    external_id = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
    OR external_id LIKE '%6aad6b8e-f2a6-4be3-a803-65940a748d8d'
    OR payload->>'orderId' = '6aad6b8e-f2a6-4be3-a803-65940a748d8d'
  )
RETURNING external_id;
