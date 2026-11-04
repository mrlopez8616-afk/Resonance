-- Broker read sync. Number 047.
-- 046 stores Factorio snapshots. This file stores the last Coinbase and
-- Robinhood read: status, positions, cash balances, and recent orders.
-- The cron is read-only. These tables do not place orders.
-- Idempotent: CREATE is IF NOT EXISTS. A second run changes nothing.

CREATE TABLE IF NOT EXISTS broker_sync_state (
  venue text PRIMARY KEY CHECK (venue IN ('coinbase', 'robinhood')),
  status text NOT NULL CHECK (status IN ('ok', 'error', 'not_configured')),
  synced_at timestamptz,
  checked_at timestamptz NOT NULL,
  message text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS broker_positions (
  venue text NOT NULL CHECK (venue IN ('coinbase', 'robinhood')),
  sleeve_id text NOT NULL,
  ticker text NOT NULL,
  quantity text NOT NULL,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (venue, sleeve_id, ticker)
);

CREATE TABLE IF NOT EXISTS broker_balances (
  venue text NOT NULL CHECK (venue IN ('coinbase', 'robinhood')),
  currency text NOT NULL,
  amount text NOT NULL,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (venue, currency)
);

CREATE TABLE IF NOT EXISTS broker_orders (
  venue text NOT NULL CHECK (venue IN ('coinbase', 'robinhood')),
  order_id text NOT NULL,
  ticker text NOT NULL,
  side text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  price text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  filled_at timestamptz,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (venue, order_id)
);
