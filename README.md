# Resonance

Phase Zero personal operating dashboard for founder **Andres López**.

A single-user Web2 tracker for treasury, nodes, decisions, and rewards. It is the first piece of an eventual larger OS. Phase Zero is **human-governed** and **manual-first**: you type the books so you learn the operating system. Live prices are optional. The app remembers the board in the browser. Decisions can also sync to a shared store so every device sees the same record book.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local/dev leaves the site gate off unless you set `RESONANCE_APP_PASSWORD` in `.env.local`.

## What changed overnight (2026-09-12)

The Web2 app now **behaves as if it were already on-chain**: same fields, receipts, and rules. Still no wallet, no XRS, no silent Main trades.

- **Treasury** — Founder-reported Flare vault / Xaman trail from **2026-08-28 ~20,000 XRP** through weekly-class adds to **~27,772 XRP** as of 2026-09-11/12. Principal never withdrawn. Yield (~1 XRP/day class) is ammo only. Ledger history + running principal on `/treasury`. Import/export: [`public/examples/treasury-ledger.json`](public/examples/treasury-ledger.json).
- **Decisions** — Record book already has proposal, why, `authorizedBy`, outcome, evidence/receipt, timestamps, `fingerprint: null`. Seeded `D-2026-09-11-01`…`04`. D-04 notes Agentic autonomy may trade **ETN/GEV**. PWR, VRT, ETN, GEV outcomes are **QUEUED for Monday open — not filled**.
- **Robinhood** — New `/robinhood` panel. **Main** = read-only learning / flatten Monday. **Agentic** = autonomous risk sleeve. Physical AI: PWR ETN VRT GEV CEG HUBB. Digital: BTC ETH SOL XRP SUI FLR. Venue badges (Robinhood / Xaman / founder-reported). Seeded Main lots match the holdings snapshot example.
- **Nav** — Overview skeleton nodes, Treasury ledger, Nodes, Robinhood/Agentic, Decisions, Prices, Public skeleton, What changed, Settings.
- **Public skeleton** — `/public` shows the twelve nodes as target allocation % (not dollars) and a decision index without receipts. Private board stays gated. Docs: [`docs/public-vs-private.md`](docs/public-vs-private.md).
- **Hedera (Phase 0.5 Testnet)** — Decisions carry `attestationStatus` plus `hederaMessageId` / `attestedAt` / `fingerprint`. With server env set, **Attest (Hedera Testnet)** submits a public fingerprint (no dollar amounts) to HCS. Docs: [`docs/hedera-attestation.md`](docs/hedera-attestation.md).
- In-app walkthrough: `/whats-new`. Docs: [`docs/overnight-build.md`](docs/overnight-build.md). Doctrine: [`docs/recording-pipeline.md`](docs/recording-pipeline.md).

Existing browsers that still have the old ~26,000 opening seed are migrated to the Aug 28 trail (operator-typed ledger rows are kept). Or import the treasury JSON / reset to seed.

## Site password gate

This is a **single-operator site lock**, not multi-user accounts. Vercel Deployment Protection is not used here.

1. In the Vercel dashboard open the project → **Settings → Environment Variables**.
2. Add `RESONANCE_APP_PASSWORD` (Production, and Preview if you want previews locked). Do **not** prefix it with `NEXT_PUBLIC_`.
3. Redeploy so the server process sees the variable.
4. Visiting the app shows **Unlock**. A correct password sets an **httpOnly** session cookie (~14 days). **Settings → Lock now** (and the sidebar button) clears it.

If the variable is unset, the dashboard loads without a password and a banner says the gate is off. That is the local/dev default. **Production must set the env var.** The password is verified in a Route Handler; it is never written to `localStorage` or shipped in the client bundle.

Copy [`.env.example`](.env.example) to `.env.local` if you want to try the gate locally. Choose the password offline — this repo does not include one.

## Decision sync (all devices — no JSON import)

Hub fills used to die in one browser’s `localStorage`. After this setup, a POST/PATCH updates the live Decisions page on every unlocked device.

### Vercel (Hobby is enough)

1. Project → **Storage** → **Create** → **Blob**.
2. Connect that store to this project (Production).
3. Keep `RESONANCE_APP_PASSWORD` set (you already use it for Unlock).
4. Optional but better for hub scripts: add `RESONANCE_SYNC_SECRET` (a long random string). Do **not** prefix with `NEXT_PUBLIC_`.
5. Redeploy.

Vercel writes `BLOB_READ_WRITE_TOKEN` for you. First request seeds `D-2026-09-11-01`…`04` if the store is empty.

### Check, then post a Monday fill

```bash
curl -s https://YOUR-APP.vercel.app/api/health
```

You want `"configured": true`. Then:

```bash
curl -X PATCH https://YOUR-APP.vercel.app/api/decisions \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-03","outcome":"PWR $35 and VRT $17 FILLED at Monday open.","evidence":"RH order ids here"}'
```

Open **/decisions**. The row shows filled. No file import.

`GET /api/public` and **/public** still omit dollar amounts, outcomes, and receipts. Full rows are only on `/api/decisions` (cookie or Bearer).

Local/dev without Blob writes `.data/decisions.json`. Longer note: [`docs/decision-sync.md`](docs/decision-sync.md).

## Hedera Testnet attest (Phase 0.5)

This is a wiring test, not Mainnet.

1. Vercel → **Settings → Environment Variables**.
2. Add `HEDERA_OPERATOR_KEY` (Testnet private key). **Do not** prefix `NEXT_PUBLIC_`. **Do not** paste that key into chat or Grok.
3. Optional: `HEDERA_OPERATOR_ID=0.0.10506907` (default), `HEDERA_NETWORK=testnet`, `HEDERA_TOPIC_ID=0.0.x` after the first topic is created.
4. Redeploy.
5. `curl -s https://YOUR-APP.vercel.app/api/health` — you want `"hedera": { "configured": true }`. That JSON never includes keys.
6. Unlock the site → **Decisions** → **Attest (Hedera Testnet)** on a decided row.

If the key is unset, the app still deploys. Health shows `configured: false`. You can still record a HashScan id by hand: `POST /api/attest` with `{ "id", "hederaMessageId" }`.

Founder steps in plain language: [`docs/hedera-attestation.md`](docs/hedera-attestation.md).

Production build:

```bash
npm run build
npm start
```

Checks:

```bash
npm run lint
npm test
```

No user accounts or API keys are required. Production should lock the site with `RESONANCE_APP_PASSWORD` (see above). Most app data is stored in `localStorage` under `resonance.phase-zero.v1`. Decisions also sync to the shared store when Blob is configured. First load is seeded with founder-reported sample data so the board is not empty.

## Phase Zero scope

- **Overview** — treasury summary (units, estimated USD when a live XRP price exists, ~daily reward), skeleton nodes (physical AI vs digital), Agentic queued tickets, last decisions, optional YouTube stub. When any node has a pasted holdings snapshot, a **Holdings last synced** line appears (timestamp + source). That is not a live brokerage session.
- **Treasury** — editable working balance on **Xaman** (~27,772 XRP seed, founder-reported), principal trail from Aug 28, optional manual XRP/USD for estimates, reward/claim ledger you can add and edit in place (date, amount, fee, note, classification `principal | reward | fee | transfer`). Import/merge the official trail by ID. Robinhood XRP is **not** this balance.
- **Nodes** — twelve tracking slots: digital BTC ETH SOL XRP SUI FLR; physical US equities PWR ETN VRT GEV CEG HUBB. Main-sleeve learning lots ship funded from the Robinhood snapshot example. Editable name, thesis, failure condition, position status `none | watch | funded`, sleeve, manual last price, plus optional holding fields `quantity`, `averageCost`, `venue`, `lastSyncedAt`, `syncSource`. Each node has a stable `id` plus optional `links[]` (directed edges) so a later systems map can render without a schema break.
- **Robinhood / Agentic** — Main (read-only learning / flatten Monday) vs Agentic (autonomous risk sleeve). Venue badges. Queued ≠ filled. The app never places trades.
- **Prices** — optional public crypto quotes (CoinGecko, Binance fallback) and unpaid equity feeds when they respond. Otherwise a visible **no live feed** state; type USD on Nodes. Failed fetches never show invented numbers. The rest of the board does not depend on this page.
- **Decisions** — Phase Zero **record book**. Dated ID, question, proposal, options, founder decision, why, who authorized, outcome (queued ≠ filled), receipt, review trigger, status (`pending | decided | superseded`). Shared store: `GET/POST/PATCH /api/decisions` (merge by id). Decided / superseded rows can be attested on Hedera Testnet (`POST /api/attest`). `fingerprint` is the public-record hash written on attest. JSON import is the fallback.
- **Settings** — session lock, treasury defaults, venues, **Import holdings snapshot** (paste JSON, preview, apply), optional public XRPL address stored for a *future* read-only watch, full JSON export/import, reset to seed.

Badges:

- **Verified** — live market print from a public API.
- **Founder-reported** — operator figures (including the seeded ~27,772 XRP / ~1 XRP/day ammo, and pasted holdings).
- **Verified-from-snapshot** — a pasted Grok Bot JSON snapshot was merged onto matching tickers. Not a continuous Robinhood link.
- **Unverified** — theses, failure conditions, manual prices, anything not independently fetched.

Seeded operating priority: build and add to treasury; keep principal; use realized rewards later to fund other nodes.

Venues (editable): Robinhood (fractional equities + small XRP bag), Coinbase (general), Xaman (treasury), MetaMask (Flare DeFi play — secondary).

## Decisions record book

Decisions is the durable, visible log for founder Andres López — the Phase Zero OS record book. Hub (Resonance Operations) writes structured entries in chat; this page shows them and **imports/merges by decision ID** so hub and site stay aligned without wiping unrelated local rows.

A fresh browser loads tonight’s locked records from seed (`D-2026-09-11-01` … `D-2026-09-11-04`). The shared store seeds those same four ids on first boot if empty. Existing browsers can still merge the file: [`public/examples/decisions-record-book.json`](public/examples/decisions-record-book.json). Export decisions JSON from the page for backup.

Hub writes go to `POST` / `PATCH /api/decisions` (Bearer `RESONANCE_SYNC_SECRET` or the site password). The Decisions page pulls that store and keeps `localStorage` as the offline cache. JSON import remains if sync is off. Phase 0.5 can attest a decided row on **Hedera Testnet** (`POST /api/attest`, same auth). The memo is a public fingerprint only — no dollar amounts, no Xaman principal, no Main RH lots. Sensor beeps still need an operator ack. Mainnet and XRPL stay later. No seed phrases in the repo. Private keys live only in server env (`HEDERA_OPERATOR_KEY` — never `NEXT_PUBLIC_*`, never paste into chat).

Recording-pipeline doctrine (future sensor path, public channel vs gated amounts, export → XRPL/XRS): [`docs/recording-pipeline.md`](docs/recording-pipeline.md).

## Holdings snapshot sync (Robinhood)

Resonance **cannot** call Robinhood. There is no OAuth, no brokerage API key, and no auto-trade in this app.

Flow:

1. Grok Bot pulls the founder Robinhood account and writes a JSON snapshot.
2. You paste that JSON into **Settings → Import holdings snapshot** (or load the seeded example).
3. The app validates, shows a preview, then merges into board nodes by ticker (case-insensitive).
4. Matching nodes become `funded` and receive quantity / average cost / venue / `lastSyncedAt` / `syncSource` (`robinhood-snapshot`). You can still type over any field.

**Robinhood XRP ≠ Xaman treasury.** The operating treasury (~27,772 XRP on Xaman / Flare vault) is the books of record. Robinhood also holds a small separate XRP bag (~69). Importing XRP from a Robinhood snapshot updates the **XRP node holding** with venue `Robinhood`. It does **not** overwrite treasury principal unless a holding explicitly sets `"target": "treasury"` (the Robinhood example does not).

Digital board names BTC/ETH/SOL/SUI/FLR are **not** on Robinhood; they stay watch/unfunded unless you type a holding by hand or a later snapshot includes them.

Example file (also the first import you can try immediately): [`public/examples/robinhood-holdings-snapshot.json`](public/examples/robinhood-holdings-snapshot.json).

Schema:

```json
{
  "asOf": "2026-09-11T16:10:00Z",
  "source": "robinhood",
  "holdings": [
    { "symbol": "PWR", "assetClass": "equity", "quantity": "0.070066", "averageCost": "627.98", "venue": "Robinhood" },
    { "symbol": "XRP", "assetClass": "crypto", "quantity": "69.169", "venue": "Robinhood", "note": "Separate from Xaman treasury" }
  ]
}
```

Optional holding fields: `averageCost`, `venue`, `note`, `assetClass`, `target` (`node` default, or `treasury`).

## What is not included

Resonance will not, in this phase or as a hidden control:

- Import seed phrases, secret keys, or wallet backups
- Ask for wallet signing or connect a dapp wallet
- Write to Mainnet or XRPL (Hedera **Testnet** HCS attestation of a public fingerprint is the Phase 0.5 wiring test)
- Launch or promote an XRS (or any) token
- Auto-trade, size positions, or move funds
- Log into Robinhood, store brokerage credentials, or refresh holdings by itself
- Treat a pasted snapshot as a live continuous brokerage feed
- Overwrite Xaman treasury principal with Robinhood XRP
- Fabricate prices when a feed is down
- Offer multi-user accounts, email login, or Vercel Deployment Protection (the in-app password gate is a site lock only)

The optional XRPL field is a public `r…` address only, stored locally, unused by Phase Zero besides persistence.

## Price sources

| Book | Primary | Fallback | If all fail |
| --- | --- | --- | --- |
| Crypto | CoinGecko simple price | Binance 24h ticker | Error banner, cells show `—` |
| Equities | Yahoo public quote (unofficial, no key) | Yahoo chart, then Stooq CSV | **No live feed** + manual USD on Nodes |

Server route: `GET /api/prices` (60s cache). Quotes that cannot be fetched are omitted, not zeroed.

## Next steps (not in this PR)

1. **Read-only XRPL address watch** — use the stored public address to verify XRP balance and incoming payments. Still no keys. Manual books remain the source of truth until a print is verified.
2. **Coinbase export import** — parse a statement/CSV into the ledger instead of typing claims. Robinhood already uses a pasted JSON snapshot; do not add RH OAuth here.
3. **Equity price source** — a key-backed vendor (or a documented unpaid source that actually stays up from a datacenter) so physical nodes are not dependent on unofficial Yahoo/Stooq.
4. **Systems map** — a later world-view of nodes (Factorio-style). Not in this MVP; tickers already carry class, thesis, failure condition, and status so a graph can sit on top later.
5. Drop the YouTube stub when a real publishing cadence exists.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Client state in React context; persistence in `localStorage`, plus a private Vercel Blob JSON file for shared Decisions. Public market data via Next.js Route Handlers so the browser does not hit CORS-blocked finance APIs directly.
