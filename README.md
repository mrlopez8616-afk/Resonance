# Resonance

Phase Zero personal operating dashboard for founder **Andres López**.

A single-user Web2 tracker for treasury, nodes, decisions, and rewards. It is the first piece of an eventual larger OS. Phase Zero is **human-governed**: you enter figures, you make calls, the app remembers them in the browser.

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

- **Overview** — treasury summary (units, estimated USD when a live XRP price exists, ~daily reward), node watch vs funded, last decisions, optional YouTube stub.
- **Treasury** — editable working balance, reward/claim ledger (date, amount, fee, note, classification `principal | reward | fee | transfer`), persisted locally.
- **Nodes** — twelve tracking slots (not proof of holdings): digital BTC ETH SOL XRP SUI FLR; physical US equities PWR ETN VRT GEV CEG HUBB. Editable thesis, failure condition, position status `none | watch | funded`.
- **Prices** — public crypto quotes (CoinGecko, Binance fallback). Equities from public unofficial feeds when they respond; otherwise a visible **no live feed** state and manual entry. Failed fetches never show invented numbers.
- **Decisions** — question, options, pending/decided, date.
- **Settings** — treasury defaults, venues, optional public XRPL address stored for a *future* read-only watch, JSON export/import, reset to seed.

Badges:

- **Verified** — live market print from a public API.
- **Founder-reported** — operator figures (including the seeded ~26,000 XRP / ~1 XRP/day).
- **Unverified** — theses, failure conditions, manual prices, anything not independently fetched.

Seeded operating priority: build and add to treasury; keep principal; use realized rewards later to fund other nodes.

Venues (editable): Coinbase (general), Xaman (treasury), MetaMask (Flare DeFi play — secondary).

## What is not included

Resonance will not, in this phase or as a hidden control:

- Import seed phrases, secret keys, or wallet backups
- Ask for wallet signing or connect a dapp wallet
- Write to any chain
- Launch or promote an XRS (or any) token
- Auto-trade, size positions, or move funds
- Treat the twelve nodes as proof of holdings
- Fabricate prices when a feed is down

The optional XRPL field is a public `r…` address only, stored locally, unused by Phase Zero besides persistence.

## Price sources

| Book | Primary | Fallback | If all fail |
| --- | --- | --- | --- |
| Crypto | CoinGecko simple price | Binance 24h ticker | Error banner, cells show `—` |
| Equities | Yahoo public quote (unofficial, no key) | Yahoo chart, then Stooq CSV | **No live feed** + manual USD on Nodes |

Server route: `GET /api/prices` (60s cache). Quotes that cannot be fetched are omitted, not zeroed.

## Next steps (not in this PR)

1. **Read-only XRPL address watch** — use the stored public address to verify XRP balance and incoming payments. Still no keys.
2. **Coinbase export import** — parse a statement/CSV into the ledger instead of typing claims.
3. **Equity price source** — a key-backed vendor (or a documented unpaid source that actually stays up from a datacenter) so physical nodes are not dependent on unofficial Yahoo/Stooq.
4. Drop the YouTube stub when a real publishing cadence exists.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Client state in React context; persistence in `localStorage`. Public market data via Next.js Route Handlers so the browser does not hit CORS-blocked finance APIs directly.
