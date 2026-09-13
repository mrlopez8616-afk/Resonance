# Reports auto-file (hub / routine contract)

The binder is live. Hub (or any routine) files a brief with the same auth as Decisions. This brick does **not** invent a 7am schedule — it documents the POST so Resonance Operations can wire the routine.

Fingerprint attest is a separate operator / hub step on `POST /api/attest`. XRPL R1 mirror stays on Decisions.

## Endpoint

```
POST /api/reports
```

Same origin as the live site. `GET /api/reports` lists the binder. `GET /api/reports?day=YYYY-MM-DD` lists one Chicago folder. `GET /api/reports?id=R-YYYY-MM-DD-NN` returns one file.

## Auth

Same gate as Decisions writes:

- `Authorization: Bearer <RESONANCE_SYNC_SECRET>` (preferred for hub)
- or Bearer the site password
- or the unlocked site cookie (`resonance_gate`)

No open public file. Local/dev with both secrets unset stays open.

## Payload

JSON object (or `{ "reports": [ ... ] }` / a raw array).

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes (unless `fromDecisionId`) | Display name. **Idempotent key** with the day. |
| `kind` | no | `brief` (default) \| `rh-ops` \| `build` \| `other` |
| `body` | yes (unless `blobPointer` or `fromDecisionId`) | Filed text. Stays on the private binder — not `/public`. |
| `dayKey` | no | Chicago folder `YYYY-MM-DD`. Alias of `createdAt`. Default: today in `America/Chicago`. |
| `createdAt` | no | Same as `dayKey` if you already send that name. |
| `fromDecisionId` | no | Server helper: file a brief from a Decision id. Same day + `Decision {id}` title merges. |
| `id` | no | Force a report id. Omit and let the store assign `R-YYYY-MM-DD-NN`. |

### Idempotent-ish merge

Same **Chicago day + exact title** updates the existing file (new body, new fingerprint) instead of adding a second row. If the fingerprint is unchanged, a prior Hedera attest is kept. If the body changes, status returns to `not_yet_attested`.

## 7am Daily Resonance Brief

```bash
curl -X POST https://YOUR-APP.vercel.app/api/reports \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Daily Resonance Brief",
    "kind": "brief",
    "dayKey": "2026-09-13",
    "body": "Paste the generated brief. No dollars on public surfaces."
  }'
```

A second POST the same day with the same title overwrites that file. Open **/reports** → that day’s folder → the file.

## File from a Decision

UI: open a Decision → **File from Decision**. Or:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/reports \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"fromDecisionId":"D-2026-09-11-04","dayKey":"2026-09-13"}'
```

The helper copies existing Decision fields into the brief. It does not invent doctrine.

## Attest (Hedera Testnet)

Same route as Decisions. Fingerprint only — not the report body. No Mainnet. Existing `HEDERA_*` env.

```bash
curl -X POST https://YOUR-APP.vercel.app/api/attest \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"R-2026-09-13-01"}'
```

Manual HashScan id (no operator key):

```bash
curl -X POST https://YOUR-APP.vercel.app/api/attest \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"R-2026-09-13-01","hederaMessageId":"0.0.x/1"}'
```

UI: unlock → Reports → open a file → **Attest (Hedera Testnet)**. Status leaves “Not yet attested”. The left-rail Reports item and the folder row show an **Attested** badge.

HCS memo family: `{ "v": 1, "reportId", "fingerprint", "attestedAt" }`. See [`hedera-attestation.md`](./hedera-attestation.md).

## What this is not

- Not a printer.
- Not a new node. Locked 12 stay locked.
- Not dollars on `/public` or `/api/health` (counts only).
- Not Xaman / RH Main. No seeds in the client.
- Not Mainnet. Not a full-body on-chain write.
- XRPL R1 mirror is not on reports in this brick (Decision helper stays Decision-shaped).
