# Postgres storage

`DATABASE_URL` selects the backend. When it is set, bets, fills (the operator log), settlements, and calendar rows live in Postgres. When it is unset, the stores stay on the private Blob (or the local `.data` file) and still merge seeds on read. Pages keep the 45s tag cache and the fail-soft banner either way.

The app reads one variable, the pooled Neon URL. Extra names the integration adds (`DATABASE_URL_UNPOOLED`, `PGHOST`, and the rest) are ignored.

## Commands

From `resonance-2`, with `DATABASE_URL` in the environment:

```bash
npm run db:migrate
npm run db:import-blob -- --dry-run
npm run db:import-blob
npm run db:replay -- --file outage.json --dry-run
npm run db:replay -- --file outage.json
```

`db:migrate` applies `db/migrations` in order. Each file uses `IF NOT EXISTS` (the operator-log view is created only when it is missing). A second run skips files already listed in `schema_migrations`.

Production builds run that same migrator before `next build` (`npm run prebuild`) when `VERCEL_ENV` is `production` and `DATABASE_URL` is set. Preview and local builds skip it, because preview deployments share the production database. `POST /api/storage/migrate` with `Authorization: Bearer $RESONANCE_SYNC_SECRET` runs it on demand. The SQL lives in the server bundle (`src/lib/pg/embedded-migrations.ts`). Runtime does not read `db/migrations` from disk. The files stay the reviewed source, and a test checks the constants match them. The first fitness read runs the embedded fitness DDL when `fitness_metrics` is missing, then upserts the manual day, so a preview can show that day before the production deploy. A failed fitness read is logged and the page still renders.

`db:import-blob` reads `resonance-2/bets.json`, `resonance-2/fills.json`, and `resonance-2/calendar.json` from the private Blob and upserts them. A missing object is an empty domain. A 403 or a suspended store fails the whole run and writes nothing. `--dry-run` prints counts and does not write rows. Re-running is safe. Import does not delete rows that exist only in Postgres. Run it before replay: a later import copies the blob again and will overwrite a row the replay has already changed.

`db:replay` reads a local file saved during the outage:

```json
{
  "bets": [],
  "settlements": [{ "id": "ufc-332-nolan", "status": "lost" }],
  "calendar": []
}
```

Bets dedupe on `orderId`. The same settlement is a no-op. Calendar ids dedupe. `--post` sends those bodies to `/api/bets`, `/api/bets/settle`, and `/api/calendar` with `Authorization: Bearer $RESONANCE_SYNC_SECRET` instead of writing SQL. `RESONANCE_BASE_URL` defaults to `https://resonance3.vercel.app`.

The same import is `POST /api/storage/import` with that Bearer. `?dryRun=1` counts only. It returns 503 when the blob is suspended.

## Tables

| Table | Key | What it holds |
| --- | --- | --- |
| `fills` | `(source, external_id)` unique | Operator log rows. `operator_log` is a view of this table. |
| `sleeve_prints` | `(ticker, sleeve_id)` | Live sleeve quantities. Not an ingest stream. |
| `bets` | `id` primary key, `order_id` unique | Current ticket. `order_id` falls back to `id`. |
| `settlements` | `external_id` unique | History. The bet row still has the current status, payout, and realized P&L. |
| `calendar_entries` | `id` | Lanes, catalysts, and fights (`kind = fight`, `lane` null). |
| `fight_results` | `fight_slug` | Empty until PR #50. Bout clock is column `clock` and payload `time`. |
| `fight_breakdowns` | `(event_slug, fight_slug)` | Per-fight lean, why, edges, stats, and odds. Any event slug. UFC 332 stays on its static files. |
| `bet_corrections` | `(bet_id, version)` | Empty until a bet payload carries `correctionVersion`. |
| `store_meta` | `domain` | Envelope `updated_at` and `seeded_at`. |
| `fitness_metrics` | `(source, external_id)` unique | Daily health metrics. One row per source, metric, Chicago day, and unit. A re-sent day updates `qty`. |
| `fitness_workouts` | `(source, external_id)` unique | Workouts. Version 2 uses the export `id`. A re-sent workout updates the row. |

Seeds still merge on read: missing seed ids are inserted, and a row already stored under that id or order id is left alone.

Money columns are `numeric`. Instants are `timestamptz`. The JSON `payload` is the round-trip copy the API returns, so a new field rides along once the parser allows it.

## Adding a domain

Money (bank and card transactions) and fitness (runs, steps, lifts) are new tables plus a new file in `db/migrations`. They do not change bets, fills, or calendar.

Copy this shape:

- One table per stream. Fitness is two streams, because Health Auto Export posts metrics and workouts separately: `fitness_metrics` (steps, active energy, heart rate, resting heart rate, walking + running distance) and `fitness_workouts` (runs and strength, distinguished by workout name). Money stays a later table: `money_transactions`.
- `source text not null` and `external_id text not null`, unique together. That pair is the idempotent ingest key. Re-posting the same source and external id is a no-op.
- `timestamptz` for when it happened. `numeric` for amounts. Never `float`.
- `payload jsonb` for the rest of the row.

A new domain does not need a new cache framework. Add one tag, read through `cachedBlobRead`, and call `revalidateBlobTag` only after a successful write. Map a down database to `StorageUnavailableError` so the page shows the existing banner and the write route returns 503.

## What PR #50 changes on rebase

Branch `cursor/fight-results-ufc-332-6ce2`. Do not merge this file's behavior into that branch by copying UI. Point the stores at the backend that is already here:

1. `detectFightResultsBackend` must call `detectStoreBackend(env, "RESONANCE_FIGHT_RESULTS_FILE")` from `src/lib/store-backend.ts`. The return type includes `"postgres"`. `DATABASE_URL` wins over the Blob token.
2. In `fight-results-store.ts`, when the backend is `"postgres"`, load with `loadFightResults` and save with `saveFightResults` from `src/lib/pg/envelopes.ts`. Keep the file and blob branches. Display reads go through `cachedBlobRead`. Call `revalidateBlobTag` only after a successful save.
3. Add `fightResults: "resonance-blob-fight-results"` to `BLOB_TAGS` in `src/lib/blob-read.ts`. The comment there is the slot. Do not reuse the bets, fills, or calendar tags.
4. Keep `applyBetCorrections` inside `finalizeBets`, which already calls `applyStoredBetCorrections` in `src/lib/bets-store-core.ts` after the lean backfill and before the dirty flag. Replace that function's body. Do not add a second write path. A stored row whose `correctionVersion` is already at the correction's version stays put.
5. `sold` is allowed because `bets.status` is `text`, not an enum. `correctionVersion` round-trips only after `coerceBet` keeps it. Until then the row stays in `bets.payload` only if the in-memory bet still has the field at save time. `bet_corrections` records `(bet_id, version)` when that field is present. The bet row remains the current ticket.
6. Map `FightResult.time` to column `clock`. `saveFightResults` also stores the full object in `payload`, and `loadFightResults` reads that object back.
7. `src/lib/store-page.ts` already treats backend `"postgres"` as a live durable store. Do not map it back to `"file"`.
8. Leave `/api/bets`, `/api/bets/settle`, and `/api/fights/result` request and response fields as they are. `override` stays in the HTTP layer. Auth stays `Authorization: Bearer $RESONANCE_SYNC_SECRET`.
