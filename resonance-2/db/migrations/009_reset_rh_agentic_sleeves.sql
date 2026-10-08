-- One-off data correction (2026-10-08): reset rh-agentic sleeve prints to
-- Robinhood actual holdings after the 24-fill historical backfill stacked
-- quantities onto sleeves that already matched. Fills are untouched.
-- flare-vault is never stored in sleeve_prints (seed-only), so it cannot move here.
INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES
  ('XRP',  'rh-agentic', '492.828'),
  ('SUI',  'rh-agentic', '0'),
  ('PWR',  'rh-agentic', '0.027119'),
  ('ETN',  'rh-agentic', '0.043380'),
  ('VRT',  'rh-agentic', '0.075844'),
  ('GEV',  'rh-agentic', '0.018766'),
  ('CEG',  'rh-agentic', '0.065243'),
  ('HUBB', 'rh-agentic', '0.039688'),
  ('HBAR', 'rh-agentic', '0')
ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity;
