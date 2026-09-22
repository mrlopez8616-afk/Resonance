# Cabinet note — fill ingest (RH + Coinbase)

Hub / Robinhood Ops files fills. Resonance 2.0 owns the **site write path**.

This brick does **not** poll Robinhood or Coinbase. It does **not** light new nodes. It does **not** touch Xaman principal, RH Main account credentials, or the founder-entered Flare vault quantity.

Reuse the existing operator log and live faces. Do not invent a second fill card, a second sleeve type, or a second floor.

| Piece | Path | Use |
| --- | --- | --- |
| Fill row | `src/data/fills.ts` → `Fill` | Same card on `/log`. Ingest **extends** this shape (venue / sleeve / tradeId / idempotency key) |
| Log UI | `src/components/fill-log.tsx` | Same `FillLog` / `FillCard` |
| Sort | `src/lib/fills.ts` → `listFills` | Newest `time` first |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | Quantity stays a string |
| Seed prints | `src/data/xrp-sleeves.ts`, `src/data/sui-sleeves.ts`, `src/data/pwr-sleeves.ts`, `src/data/etn-sleeves.ts`, `src/data/vrt-sleeves.ts`, `src/data/gev-sleeves.ts`, `src/data/ceg-sleeves.ts`, `src/data/hubb-sleeves.ts` | Fallback when the durable store has no override |
| Face | `assembleLiveFace` + `LiveNodeFace` | Positions from merged sleeves. Only `quote.usd` is a live price |
| Auth spirit | Phase Zero `RESONANCE_SYNC_SECRET` Bearer | Server-only. Never `NEXT_PUBLIC_*` |
| Store spirit | Phase Zero Blob + local file | Private JSON envelope. Local/dev writes `.data/fills.json` |

Live floor is **XRP + SUI + PWR + ETN + VRT + GEV + CEG + HUBB**. Locked 12 nodes only — never invent a ticker or a sleeve id. PWR, ETN, VRT, GEV, CEG, and HUBB are equity faces ([`pwr-face.md`](./pwr-face.md), [`etn-face.md`](./etn-face.md), [`vrt-face.md`](./vrt-face.md), [`gev-face.md`](./gev-face.md), [`ceg-face.md`](./ceg-face.md), [`hubb-face.md`](./hubb-face.md)); ingest may write `rh-agentic` only on those six.

## Who writes what

- **Hub / RH Ops** POSTs a fill after a Robinhood or Coinbase value transfer.
- **This app** appends the operator log and refreshes the matching live sleeve print.
- **Founder** is the only writer of Flare vault quantity (`FLARE_VAULT_XRP` / `flare-vault`). Ingest refuses that id.

## Auth

Mirror Phase Zero decision-sync style. Server-only.

| Variable | Where | What it does |
| --- | --- | --- |
| `RESONANCE_SYNC_SECRET` | Vercel env for project `resonance3` (Root Directory `resonance-2`). Local: `.env.local` from `.env.example` | Hub Bearer token for `POST /api/fills` |
| `BLOB_READ_WRITE_TOKEN` | Created when a Blob store is connected to `resonance3` | Durable envelope. Do not type this by hand |
| `RESONANCE_FILLS_FILE` | Local/dev override only | Default `.data/fills.json` when Blob is unset |

`Authorization: Bearer <RESONANCE_SYNC_SECRET>`

- If the secret is **set**, POST without a matching Bearer is `401`.
- If the secret is **unset** (local/dev only), POST is open so the brick can be exercised without copying production secrets.
- GET `/api/fills` and GET `/api/sleeves` stay public — `/log` and the live faces are already public prints. GET never returns secrets, seeds, or broker keys.
- Never prefix these with `NEXT_PUBLIC_`. Never put the Bearer token in a Client Component.

Phase Zero (`RESONANCE_APP_PASSWORD`, cookie gate, `/api/decisions`) is a **sibling** app. Do not change it. Resonance 2.0 does not share that cookie gate.

## Fill event (POST body)

Canonical ingest object. Strings stay strings so quantity and price stay exact.

```json
{
  "venue": "robinhood",
  "orderId": "uuid-from-the-broker",
  "tradeId": "optional-if-orderId-missing",
  "ticker": "SUI",
  "side": "buy",
  "qty": "8.931",
  "price": "1.10",
  "sleeve": "rh-agentic",
  "filledAt": "2026-09-21T08:30:00-05:00",
  "result": "filled"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `venue` | yes | `robinhood` \| `coinbase` (lowercase after normalize) |
| `orderId` or `tradeId` | one required | Trimmed. Used for the idempotency key. Prefer `orderId` when both exist |
| `ticker` | yes | Uppercase. Must be one of the locked 12: `BTC ETH SOL XRP SUI FLR PWR ETN VRT GEV CEG HUBB` |
| `side` | yes | `buy` \| `sell` |
| `qty` | yes | Positive decimal string. Alias: `quantity` (existing `Fill` field) |
| `price` | yes | Non-negative decimal string |
| `sleeve` | yes | Print target. `rh-main` \| `rh-agentic` \| `coinbase` only |
| `filledAt` | yes | ISO-8601 with offset or `Z`. Alias: `time` (existing `Fill` field) |
| `result` | no | Defaults to `filled` |
| `note` | no | Operator copy only (packet name). Not a second quantity |

Aliases exist so hub can POST either the cabinet names (`ticker`, `qty`, `filledAt`) or the existing fill-log names (`symbol`, `quantity`, `time`). Stored rows always use the existing `Fill` field names plus the extensions below.

Single object, or `{ "fill": { ... } }`. One fill per POST. Hub retries the same body; the site dedupes.

## Idempotency

**Key = `venue` + trade key.**

1. Normalize `venue` to lowercase `robinhood` or `coinbase`.
2. Trade key = `orderId` if present and non-empty after trim, else `tradeId`.
3. Compare the trade key **case-insensitively** (UUIDs). Display keeps the original spelling.
4. Key string: `{venue}:{lowercase-trade-key}`  
   Example: `robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d`

A second POST with the same key:

- HTTP **200**
- `{ "ok": true, "deduped": true, "idempotencyKey": "…" }`
- **Does not** append another log row
- **Does not** apply the sleeve delta again

Also treat an existing seed row with the same `orderId` / `tradeId` as a hit, even if that seed row predates `venue`. Retries must not double-count.

## Stored row (operator log)

Ingest writes one `Fill` and keeps `/log` on the same component:

```ts
{
  time,          // filledAt
  symbol,        // ticker
  side,
  quantity,      // qty
  price,
  orderId,       // trade key (orderId or tradeId)
  result,
  venue,         // robinhood | coinbase
  tradeId?,      // present when hub sent it
  sleeve,        // rh-main | rh-agentic | coinbase
  idempotencyKey // venue:trade-key
}
```

`src/data/fills.ts` remains the **seed / local fallback**. Those two sample rows stay as-is. First boot of an empty durable store copies them into the envelope **without** re-applying sleeve math (the typed last-known prints already include that history).

## Sleeve apply

Start from the durable override for that ticker + sleeve id, else the static seed quantity.

| `side` | Effect |
| --- | --- |
| `buy` | sleeve quantity **increases** by `qty` |
| `sell` | sleeve quantity **decreases** by `qty` |

Math is decimal-string (no binary float). Trailing zeros are stripped.

### Which sleeve ids update

| Sleeve id | XRP | SUI | PWR | ETN | VRT | GEV | CEG | HUBB | Writer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rh-main` | yes | **no** (SUI has no Main line) | **no** (PWR has no Main line) | **no** (ETN has no Main line) | **no** (VRT has no Main line) | **no** (GEV has no Main line) | **no** (CEG has no Main line) | **no** (HUBB has no Main line) | ingest, venue `robinhood` only |
| `rh-agentic` | yes | yes (`0` seed, sold) | yes (`0.003917` seed, shares) | yes (`0.005844` seed, shares) | yes (`0.009991` seed, shares) | yes (`0.002640` seed, shares) | yes (`0.009617` seed, shares) | yes (`0.005566` seed, shares) | ingest, venue `robinhood` only |
| `coinbase` | yes | yes | **no** (PWR has no Coinbase line) | **no** (ETN has no Coinbase line) | **no** (VRT has no Coinbase line) | **no** (GEV has no Coinbase line) | **no** (CEG has no Coinbase line) | **no** (HUBB has no Coinbase line) | ingest, venue `coinbase` only |
| `flare-vault` | yes (XRP only) | no such line | no such line | no such line | no such line | no such line | no such line | no such line | **founder / typed constant only** |

Venue / sleeve pairing is strict so a mis-aimed POST cannot move the wrong print:

- `robinhood` → `rh-main` or `rh-agentic`
- `coinbase` → `coinbase`

### Flare vault (founder lock)

`flare-vault` is **never** written by ingest.

- POST with `sleeve: "flare-vault"` → **400**, no log row, no sleeve mutation
- Any other attempt to target that id is refused the same way
- On **read**, a tampered store override for `flare-vault` is ignored. The face always uses the founder-typed `FLARE_VAULT_XRP` from `src/data/xrp-sleeves.ts`

Do not invent a Flare amount. Do not auto-edit vault quantity.

### Live vs offline tickers

- **Live books today:** XRP, SUI, PWR, ETN, VRT, GEV, CEG, HUBB. Sleeve apply runs only when that ticker already has the named sleeve id.
- **Unknown sleeve on a live book** (example: `SUI` + `rh-main`, `PWR` + `coinbase`, `ETN` + `rh-main`, `VRT` + `rh-main`, or `GEV` + `rh-main`) → **400**. Do not invent a row.
- **Locked but offline ticker** (BTC, ETH, SOL, FLR) → operator log **may** append (value transfer still happened). Sleeve apply is skipped. Do not invent a face or a sleeve book.
- Unknown ticker outside the locked 12 → **400**.

## Durable envelope

One private JSON file (atomic fill + sleeve write — same spirit as Phase Zero `resonance/decisions.json`):

- Blob path: `resonance-2/fills.json`
- Local/dev: `.data/fills.json`

```ts
{
  version: 1,
  updatedAt: string,
  seededAt: string | null,
  fills: Fill[],
  sleevePrints: { [ticker: string]: { [sleeveId: string]: string } }
}
```

`sleevePrints` holds **overrides only** for writable ids. Missing key → use the static seed. `flare-vault` in this map is ignored on read and refused on write.

Backend pick (same as Phase Zero):

1. `BLOB_READ_WRITE_TOKEN` → Blob
2. else local/dev → file
3. Vercel without Blob → GET falls back to static seeds so the floor still renders; POST returns **503** until a Blob store is connected

## Routes

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/fills` | Bearer secret (or open if unset) | Ingest one fill. 200 + `deduped` |
| `GET` | `/api/fills` | public | Operator log rows, newest first. Seed fallback if store empty / unconfigured |
| `GET` | `/api/sleeves?ticker=XRP` | public | Merged sleeve rows for a live face. Flare vault stays founder-typed |

POST 200 body:

```json
{
  "ok": true,
  "deduped": false,
  "idempotencyKey": "robinhood:…",
  "fill": { },
  "sleeves": { "ticker": "SUI", "sleeves": [ ] },
  "backend": "blob"
}
```

Retry of the same key: `"deduped": true` and the original stored fill. Sleeve quantities unchanged.

## First consumer — Monday Agentic SUI → 6 AI

Monday’s Agentic SUI packet is the first hub caller. It lands on the **RH Agentic** sleeve of the **SUI** live face. It is not a Coinbase print. It is not Flare. It does not light BTC / ETH / SOL / FLR.

Hub substitutes the real Robinhood order id, filled qty, filled price, and fill time. **Do not treat the fixture numbers as a live lot.** This brick does not invent the Monday size.

Fixture (also at [`/examples/monday-agentic-sui-6ai.json`](../public/examples/monday-agentic-sui-6ai.json)):

```json
{
  "venue": "robinhood",
  "orderId": "REPLACE-WITH-ROBINHOOD-ORDER-ID",
  "ticker": "SUI",
  "side": "buy",
  "qty": "REPLACE-WITH-FILLED-QTY",
  "price": "REPLACE-WITH-FILLED-PRICE",
  "sleeve": "rh-agentic",
  "filledAt": "2026-09-21T08:30:00-05:00",
  "result": "filled",
  "note": "Monday Agentic SUI→6 AI"
}
```

```bash
curl -X POST https://resonance3.vercel.app/api/fills \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d @resonance-2/public/examples/monday-agentic-sui-6ai.json
```

After a real fill (placeholders replaced):

1. `/log` shows one new row (venue Robinhood, sleeve RH Agentic).
2. SUI face `rh-agentic` quantity moves by `qty` (buy up / sell down).
3. XRP Flare vault is unchanged.
4. The same POST again returns `deduped: true`.

## Forbidden

- Polling Robinhood / Coinbase from this site
- Lighting new nodes or inventing sleeve ids
- Writing `flare-vault`
- Seeds, broker keys, `NEXT_PUBLIC_*` secrets, Xaman / gas wallet addresses
- Changing Phase Zero plant chrome or its Blob files
- Merging this PR from the agent
