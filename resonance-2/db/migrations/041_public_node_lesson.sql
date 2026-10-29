-- Public node lesson. Number 041.
-- 040 created market_quotes. This file inserts one lesson
-- when that id is absent, and does not change a row that is already stored.

INSERT INTO lessons (id, date, title, category, what_changed, why, lesson, public_safe, sources)
SELECT
  'LL-050',
  DATE '2026-10-29',
  'Every node opens in Public mode',
  'build process',
  'Every node opens in Public mode, Fight Desk included. Dollar figures on those pages become a record, a win rate, an ROI percent, or a count. Stakes, payouts, bankroll, deposits, and position dollars stay off the shared screen.',
  'On Oct 29, 2026 the Fight Desk home tile did not open in Public mode. The route block answered with Private, so the drill-down looked broken.',
  'The Public mode route block made Fight Desk look broken. Every node now opens in Public mode with $ swapped for %.',
  true,
  '["founder report, Oct 29 2026"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM lessons WHERE id = 'LL-050'
);
