# Resonance

Phase Zero personal operating dashboard for founder **Andres López**.

A single-user Web2 tracker for treasury, nodes, decisions, and rewards. It is the first piece of an eventual larger OS. Phase Zero is **human-governed** and **manual-first**: you type the books so you learn the operating system. Live prices are optional. The app remembers everything in the browser.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

No account, API key, or backend login is required for v0. App data is stored in `localStorage` under `resonance.phase-zero.v1`. First load is seeded with founder-reported sample data so the board is not empty.

## Phase Zero scope

- **Overview** — treasury summary (units, estimated USD when a live XRP price exists, ~daily reward), node watch vs funded, last decisions, optional YouTube stub. When any node has a pasted holdings snapshot, a **Holdings last synced** line appears (timestamp + source). That is not a live brokerage session.
- **Treasury** — editable working balance on **Xaman** (~26k XRP seed), optional manual XRP/USD for estimates, reward/claim ledger you can add and edit in place (date, amount, fee, note, classification `principal | reward | fee | transfer`). Robinhood XRP is **not** this balance.
- **Nodes** — twelve tracking slots: digital BTC ETH SOL XRP SUI FLR; physical US equities PWR ETN VRT GEV CEG HUBB. Editable name, thesis, failure condition, position status `none | watch | funded`, manual last price, plus optional holding fields `quantity`, `averageCost`, `venue`, `lastSyncedAt`, `syncSource`. Each node has a stable `id` plus optional `links[]` (directed edges) so a later systems map can render without a schema break.
- **Prices** — optional public crypto quotes (CoinGecko, Binance fallback) and unpaid equity feeds when they respond. Otherwise a visible **no live feed** state; type USD on Nodes. Failed fetches never show invented numbers. The rest of the board does not depend on this page.
- **Decisions** — question, options, pending/decided, date.
- **Settings** — treasury defaults, venues, **Import holdings snapshot** (paste JSON, preview, apply), optional public XRPL address stored for a *future* read-only watch, full JSON export/import, reset to seed.

Badges:

- **Verified** — live market print from a public API.
- **Founder-reported** — operator figures (including the seeded ~26,000 XRP / ~1 XRP/day, and pasted holdings).
- **Verified-from-snapshot** — a pasted Grok Bot JSON snapshot was merged onto matching tickers. Not a continuous Robinhood link.
- **Unverified** — theses, failure conditions, manual prices, anything not independently fetched.

Seeded operating priority: build and add to treasury; keep principal; use realized rewards later to fund other nodes.

Venues (editable): Robinhood (fractional equities + small XRP bag), Coinbase (general), Xaman (treasury), MetaMask (Flare DeFi play — secondary).

## Holdings snapshot sync (Robinhood)

Resonance **cannot** call Robinhood. There is no OAuth, no brokerage API key, and no auto-trade in this app.

Flow:

1. Grok Bot pulls the founder Robinhood account and writes a JSON snapshot.
2. You paste that JSON into **Settings → Import holdings snapshot** (or load the seeded example).
3. The app validates, shows a preview, then merges into board nodes by ticker (case-insensitive).
4. Matching nodes become `funded` and receive quantity / average cost / venue / `lastSyncedAt` / `syncSource` (`robinhood-snapshot`). You can still type over any field.

**Robinhood XRP ≠ Xaman treasury.** The operating treasury (~26k XRP on Xaman / Flare vault) is the books of record. Robinhood also holds a small separate XRP bag (~69). Importing XRP from a Robinhood snapshot updates the **XRP node holding** with venue `Robinhood`. It does **not** overwrite treasury principal unless a holding explicitly sets `"target": "treasury"` (the Robinhood example does not).

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
- Write to any chain
- Launch or promote an XRS (or any) token
- Auto-trade, size positions, or move funds
- Log into Robinhood, store brokerage credentials, or refresh holdings by itself
- Treat a pasted snapshot as a live continuous brokerage feed
- Overwrite Xaman treasury principal with Robinhood XRP
- Fabricate prices when a feed is down

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

Next.js (App Router) + TypeScript + Tailwind. Client state in React context; persistence in `localStorage`. Public market data via Next.js Route Handlers so the browser does not hit CORS-blocked finance APIs directly.
