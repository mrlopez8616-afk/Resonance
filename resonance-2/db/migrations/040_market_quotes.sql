-- Last good public market quote. Number 040.
-- 039 inserted the health-route lesson. This file creates one table.
-- It inserts no rows and does not change positions, fills, or balances.
-- cache_key is spot:XRP or chart:XRP:365. payload is the feed print.

CREATE TABLE IF NOT EXISTS market_quotes (
  cache_key text PRIMARY KEY,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT market_quotes_key_chk CHECK (cache_key <> ''),
  CONSTRAINT market_quotes_source_chk CHECK (source <> '')
);
