# Restore a Resonance backup

This is the Crawl runbook. The nightly job copies data out. Putting a copy back is a drill you run by hand. Walk is that drill on a clean database. Run is an automated off-site copy plus point-in-time recovery. This job does not move money, does not write the live Blob store, and does not restore by itself.

## What a snapshot is

Each successful night is one JSON file on a private GitHub branch:

`snapshots/YYYY-MM-DD.json`

The file holds:

- every public Postgres base table discovered that night, as JSON rows
- non-secret site settings (schedule, retention, shelved nodes, destination repo and branch)
- Blob cabinet text when the store answered

Views such as `operator_log` are not copied. They are defined by migrations.

The app keeps 30 dated files. Older `snapshots/YYYY-MM-DD.json` files are removed in the same commit. Nothing else on that branch is deleted. Live tables and live Blob objects are never deleted or overwritten by this job.

The Build tile reads `backup_runs` in Postgres. It does not read GitHub, and it does not show a store URL.

## Schedule

Vercel Cron calls `GET /api/cron/backup` once a day at 08:00 UTC (`0 8 * * *`).

That is 3:00 AM Central Daylight Time and 2:00 AM Central Standard Time. Hobby cron runs once a day, so the hour stays fixed in UTC.

The route accepts `Authorization: Bearer <CRON_SECRET>` or `Authorization: Bearer <RESONANCE_SYNC_SECRET>`. If neither secret is set, the route stays closed. Vercel sends `CRON_SECRET` on the scheduled call when that variable is set.

## Env vars

Set these on the Vercel project `resonance3`. Do not commit them. They are not copied into the snapshot.

| Name | Role |
| --- | --- |
| `CRON_SECRET` | Bearer Vercel sends to the cron route. 64 hex characters (`openssl rand -hex 32`) is a good shape. |
| `RESONANCE_SYNC_SECRET` | Existing hub secret. Also accepted on the backup route for a manual run. |
| `RESONANCE_BACKUP_GITHUB_TOKEN` | Server-only credential with contents write on the private backup repo. Fine-grained access to that repo is enough. This is not `GITHUB_TOKEN`. |
| `RESONANCE_BACKUP_GITHUB_REPO` | `owner/name` of a **private** repository. A branch of a public repo is public, so do not point this at a public repo. |
| `RESONANCE_BACKUP_GITHUB_BRANCH` | Optional. Defaults to `backups`. |
| `DATABASE_URL` | Pooled Neon URL the export reads. Already used by the app. |
| `BLOB_READ_WRITE_TOKEN` | Already used to read the cabinet. The job never writes Blob. |

`resonance3-fills` is suspended (Hobby limits, 30-day lock). Reads fail until the store is available again. The run still commits the Postgres snapshot and records `blob unavailable` on `backup_runs`. The tile status line says `ok · blob unavailable`.

These stay in Vercel and are **not** in the JSON file:

- `AUTH_PASSWORD_HASH`, `AUTH_TOTP_SECRET`, `AUTH_SESSION_SECRET`
- `FINANCE_ENC_KEY` (the finance rows keep their ciphertext; the key stays here)
- `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`
- fitness and any other ingest secrets

## What is redacted

Columns and keys whose names look like a secret are stored as `[redacted]`. That includes password hashes, authenticator secrets, the owner PIN hash, session hashes, and credential ids. Values that look like a password hash, a private key, a bearer string, or a GitHub credential are replaced the same way.

After a restore, sign-in still depends on the Vercel auth env, not on those redacted columns. An operator row whose hash was redacted cannot sign in until you set that hash again. Passkeys should be registered again. Finance snapshots decrypt only when `FINANCE_ENC_KEY` is the same key that encrypted them.

## Restore drill (Walk)

Do this on a **clean database**, not on production, until the drill is recorded.

1. Pick the day. In the private repo, open branch `backups` (or `RESONANCE_BACKUP_GITHUB_BRANCH`) and download `snapshots/YYYY-MM-DD.json` with the backup credential. Do not publish that URL.
2. Read `blobStatus`. `unavailable` means the cabinet was not in that file. `copied` means Blob text is under `blobs`. `empty` means the store answered and had no cabinet files.
3. Create an empty Postgres database.
4. From `resonance-2`, with `DATABASE_URL` pointed at that empty database, run `npm run db:migrate`. That applies the embedded migrations, including `038_backup_runs`.
5. Load each array under `tables`. Insert rows with the app's normal column types (`timestamptz`, `numeric`, `jsonb`). Skip a column whose value is `[redacted]`, or replace it from the password manager before insert. `owner_pin.pin_hash` must be a real argon2id string or the row will fail its check; leave the PIN unset and set it again in the app.
6. Do not run this load against the production Neon database.
7. Confirm table counts match `tableCounts` in the file and the `backup_runs` row for that night.
8. If `blobs` has cabinet files and the Blob store is accepting writes again, a separate step can put those bodies back to the same pathnames. This cron does not do that.
9. Point a throwaway deploy at the clean database and the existing Vercel env secrets. Sign in. Confirm the floor renders. Then discard the drill database.

## When the night fails

`backup_runs.status` is `error` and `error` holds a short scrubbed reason. No snapshot file is committed for that attempt. The previous day's file stays. The tile shows the error and still hides dollar amounts in public mode.

If the snapshot commits and the log insert fails, the route reports that the run log did not save. The file is still on the branch. The next night writes that day's file again.

## What this is not

- Not a tested restore. Walk is still open until someone completes the drill above and records it.
- Not off-site from GitHub, and not Neon point-in-time recovery. Those are Run.
- Not a money movement. Nothing here places a trade, sends a transfer, or settles a bet.
