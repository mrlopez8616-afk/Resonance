-- Last Coinbase portfolio read of SUI. Number 034.
-- 033 is fighter careers. This file inserts no rows.
-- coinbase_qty is the Default portfolio, including staked SUI.
-- cb_agentic_qty is the Agentic portfolio.
-- The Xaman vault and RH Main are not stored here.

CREATE TABLE IF NOT EXISTS sui_coinbase_balance (
  ticker text PRIMARY KEY,
  coinbase_qty text NOT NULL,
  cb_agentic_qty text NOT NULL,
  observed_at timestamptz NOT NULL,
  CONSTRAINT sui_coinbase_balance_ticker_chk CHECK (ticker = 'SUI')
);
