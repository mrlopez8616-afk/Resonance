-- Seed the Coinbase Agentic XRP sleeve (portfolio transfer, no trades).
-- Inserts XRP / cb-agentic / 10 only when that print is absent.
-- Does not update an existing quantity and does not write any other sleeve.

INSERT INTO sleeve_prints (ticker, sleeve_id, quantity)
SELECT 'XRP', 'cb-agentic', '10'
WHERE NOT EXISTS (
  SELECT 1 FROM sleeve_prints
  WHERE ticker = 'XRP' AND sleeve_id = 'cb-agentic'
)
RETURNING sleeve_id;
