-- Fight Desk home tile lesson. Number 037.
-- 036 added the deposit void columns. This file inserts one lesson
-- when that id is absent, and does not change a row that is already stored.

INSERT INTO lessons (id, date, title, category, what_changed, why, lesson, public_safe, sources)
SELECT
  'LL-048',
  DATE '2026-10-27',
  'Catch a broken tile before the founder does',
  'build process',
  'The Fight Desk home tile keeps the bet record when deposits cannot be read, shows a real zero bankroll, and keeps the last good deposit rows. Empty build, lessons, and chain tiles no longer say the read failed when the rows were loaded.',
  'On Oct 27, 2026 the founder saw unavailable / not recorded on the Fight Desk home tile while the bets API was returning the book.',
  'The Fight Desk home tile showed ''unavailable / not recorded'' and the founder found it before we did. The system should catch its own breaks. Fix: a 3x-daily Site Health Check (9 AM, 1 PM, 6 PM CT) where Architect sweeps every tile and node page and fixes what it finds before the founder sees it. The home tile blanked a live bet book when the deposit read failed, and it also hid a real zero bankroll, so either case was painted as unavailable / not recorded.',
  true,
  '["founder report, Oct 27 2026"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM lessons WHERE id = 'LL-048'
);
