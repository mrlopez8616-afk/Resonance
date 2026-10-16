-- Chain Security feed. Number 030.
-- 029 seeds Future Ideas. This file does not change those rows.
-- One row per incident. id is the slug a weekly post updates.
-- A seed inserts only when that id is absent, so an edit is left alone.
-- source_url is set only for an article that was checked. Otherwise it stays null.
-- Loss amounts are US dollars. Idempotent: CREATE is IF NOT EXISTS.
-- A second run inserts nothing new.

CREATE TABLE IF NOT EXISTS chain_security_incidents (
  id text PRIMARY KEY,
  occurred_on date,
  subject text NOT NULL,
  category text NOT NULL CHECK (category IN ('bridge_exploit', 'chain_bug', 'wallet_hardware', 'ai_quantum')),
  cause text NOT NULL,
  loss_kind text NOT NULL CHECK (loss_kind IN ('amount', 'range', 'not_recorded', 'none')),
  loss_low numeric,
  loss_high numeric,
  status text NOT NULL,
  source_url text,
  exposures jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chain_security_loss_shape CHECK (
    (loss_kind = 'amount' AND loss_low IS NOT NULL AND loss_high IS NULL AND loss_low >= 0)
    OR (loss_kind = 'range' AND loss_low IS NOT NULL AND loss_high IS NOT NULL AND loss_high >= loss_low AND loss_low >= 0)
    OR (loss_kind = 'not_recorded' AND loss_low IS NULL AND loss_high IS NULL)
    OR (loss_kind = 'none' AND loss_low IS NULL AND loss_high IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS chain_security_incidents_category_idx
  ON chain_security_incidents (category, id);

INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures
)
SELECT
  'autheo-theo',
  '2026-10-12'::date,
  'Autheo (THEO), Hyperlane bridge on Base',
  'bridge_exploit',
  '119M THEO minted. Token down 92%.',
  'range',
  730000,
  1760000,
  'not recorded',
  'https://publicaml.org/autheo-theo-exploit/',
  '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM chain_security_incidents WHERE id = 'autheo-theo');

INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures
)
SELECT
  'pirate-chain-arrr',
  '2026-10-14'::date,
  'Pirate Chain (ARRR)',
  'chain_bug',
  'Mint bug.',
  'not_recorded',
  NULL,
  NULL,
  'not recorded',
  'https://www.cryptotimes.io/2026/10/16/pirate-chain-exploit-mints-39-8m-arrr-rollback-plan-dropped/',
  '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM chain_security_incidents WHERE id = 'pirate-chain-arrr');

INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures
)
SELECT
  'ledger-cryptobilis',
  NULL,
  'Ledger / CryptoBilis',
  'wallet_hardware',
  'Tampered devices.',
  'amount',
  102000000,
  NULL,
  'not recorded',
  'https://bitquery.io/investigations/ledger-cryptobilis-hack',
  '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM chain_security_incidents WHERE id = 'ledger-cryptobilis');

INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures
)
SELECT
  'near-intents',
  NULL,
  'NEAR Intents',
  'chain_bug',
  'not recorded',
  'amount',
  3800000,
  NULL,
  'funds returned',
  'https://cointelegraph.com/news/near-intents-recovers-entire-stolen-38m-after-ultimatum-to-exploiter',
  '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM chain_security_incidents WHERE id = 'near-intents');

INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures
)
SELECT
  'xrpl-ai-bug',
  NULL,
  'XRPL',
  'chain_bug',
  'A bug that AI found.',
  'none',
  NULL,
  NULL,
  'patched',
  'https://xrpl.org/blog/2026/vulnerabilitydisclosurereport-bug-20261009',
  '["xrpl"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM chain_security_incidents WHERE id = 'xrpl-ai-bug');
