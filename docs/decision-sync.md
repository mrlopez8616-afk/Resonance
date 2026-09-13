# Decision sync (founder note)

Decisions used to live only in the browser. A Monday fill on hub could not show on the live site until you pasted JSON. That is now automated.

**Factorio rule:** write the fill once. Every unlocked device reads it.

## What you set on Vercel

Do this in the Vercel project → **Settings**.

### 1. Blob store (required for the live site)

1. Open **Storage**.
2. **Create** → **Blob**.
3. Name it something like `resonance-decisions`.
4. **Connect** it to the Resonance project (Production, and Preview if you use previews).
5. **Redeploy** the app.

Vercel adds `BLOB_READ_WRITE_TOKEN` for you. You do not type it.

Hobby is enough. This is one private JSON file, not a database.

### 2. Secrets you already understand

| Variable | Where | What it does |
| --- | --- | --- |
| `RESONANCE_APP_PASSWORD` | Environment Variables | Site lock. Unlocked browsers can read/write the store with the httpOnly cookie. Hub can also send this as a Bearer token. |
| `RESONANCE_SYNC_SECRET` | Environment Variables (optional) | Extra hub-only password. Prefer this in curl scripts so the site password is not copied around. |

Neither variable may start with `NEXT_PUBLIC_`.

Local/dev: copy `.env.example` to `.env.local`. Leave Blob unset — the app writes `.data/decisions.json` on your machine.

## First boot

If the store is empty, the four locked rows are written automatically:

`D-2026-09-11-01` … `D-2026-09-11-04`

No JSON import.

## Hub / Monday fill (queued → filled)

After deploy + env:

```bash
curl -s https://YOUR-APP.vercel.app/api/health
```

You want `"configured": true`. That response never includes dollar amounts.

Then:

```bash
curl -X PATCH https://YOUR-APP.vercel.app/api/decisions \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "D-2026-09-11-03",
    "outcome": "PWR $35 and VRT $17 FILLED at Monday open.",
    "evidence": "Robinhood fills: paste order ids here"
  }'
```

Same shape works for `D-2026-09-11-01` / `04` when those tickets fill.

Open **Decisions** on any unlocked phone or laptop. Click the date folder, then the decision file. The outcome updates. No file import.

## Archive + to-do list

Decisions is a folder/file archive:

- `/decisions` — date folders (`YYYY-MM-DD`)
- `/decisions?folder=2026-09-11` — files in that folder, grouped pending / decided / superseded / attested
- `/decisions/D-2026-09-11-01` — full record + **Attest (Hedera Testnet)** (live HCS submit via `POST /api/attest`)

Operator to-dos live on **Decisions → To-do**. Same Blob store, sibling file `resonance/todos.json` (local/dev: `.data/todos.json`).

```bash
curl -X POST https://YOUR-APP.vercel.app/api/todos \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"Confirm Monday fills","linkedDecisionId":"D-2026-09-11-03"}'
```

`GET /api/health` reports `todosSync.itemCount` only — no to-do text.

Operator view-ack (Web2 only, **does not** submit to Hedera):

```bash
curl -X POST https://YOUR-APP.vercel.app/api/ack \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-01"}'
```

Live Hedera Testnet attest stays on `POST /api/attest` — see [`hedera-attestation.md`](./hedera-attestation.md).

You can also POST a full hub payload (`{ "decisions": [ ... ] }`). Matching ids merge. New ids need a `question`.

## What stays private

- `GET /api/decisions` — full rows, including sizes. Cookie or Bearer required (unless you left both secrets unset, which is local/dev only).
- `GET /api/todos` — operator to-do list. Same cookie / Bearer rule.
- `GET /api/public` — redacted index. No outcomes, no evidence, no dollar amounts.
- `/public` — same rules as before. Target % and redacted questions only.

## Check

`GET /api/health` — internal note + store status + Hedera Testnet `configured` (never keys). No decision text.

Hedera Testnet attest (Phase 0.5): [`hedera-attestation.md`](./hedera-attestation.md). Same auth as this store.

JSON import on the Decisions page is still there as a fallback.
