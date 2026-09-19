# Resonance 2.0

Operator floor for Resonance 2.0. **XRP and SUI are live.** Other node squares are offline placeholders. The Xaman gas wallet is never shown.

This folder is a **separate** Next.js App Router app. It does not share runtime, routes, or data with the Phase Zero dashboard at the repo root. Point Vercel project `resonance3` at Root Directory `resonance-2`.

## Surfaces

- `/` — factory-floor shell: left toolbar, equal node squares, LIVE chip, operator status strip. Live faces show ticker, large spot price, sleeve-sum tokens, live USD, then sleeve rows. `×` removes a square after confirm; `+` restores it. Sleeve files and fills stay.
- `/log` — agentic sleeve fill log. Same toolbar. Rows come from the durable fill store, with [`src/data/fills.ts`](src/data/fills.ts) as seed / local fallback.

## Live faces (this brick)

Sleeve quantities start as typed placeholders, then update when Hub / RH Ops POSTs a fill:

- XRP — [`src/data/xrp-sleeves.ts`](src/data/xrp-sleeves.ts)
- SUI — [`src/data/sui-sleeves.ts`](src/data/sui-sleeves.ts) (RH Agentic 8.931; Coinbase 33.7)

Live price is fetched **server-side** from public spot feeds (CoinGecko, Binance fallback) in [`src/lib/spot-price.ts`](src/lib/spot-price.ts). Hub posts fills to `POST /api/fills`. This app does not poll Robinhood or Coinbase. Do not put broker keys in the client or in `NEXT_PUBLIC_*`.

Flare vault is a **manual** founder constant (`28273` XRP) on the XRP face only. Ingest cannot write it. SUI has no vault line.

Reuse notes: [`cabinet/xrp-face.md`](cabinet/xrp-face.md), [`cabinet/sui-face.md`](cabinet/sui-face.md), fill ingest: [`cabinet/fill-ingest.md`](cabinet/fill-ingest.md).

## Run locally

Requires Node.js 20 or newer.

```bash
cd resonance-2
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

```bash
npm run build
npm start
```

## How to append a later fill

Production path: Hub / RH Ops `POST /api/fills` with Bearer `RESONANCE_SYNC_SECRET`. Schema, idempotency, and the Monday Agentic SUI→6 AI fixture are in [`cabinet/fill-ingest.md`](cabinet/fill-ingest.md).

Local/dev without Blob still seeds from [`src/data/fills.ts`](src/data/fills.ts) and writes `.data/fills.json`. Do not paste keys, seeds, account numbers, or the gas wallet address into that file.

## Deploy on Vercel (resonance3)

1. Import this Git repository.
2. Set **Root Directory** to `resonance-2`.
3. Framework Preset: Next.js (auto-detected from this folder’s `package.json`).
4. Connect a Blob store. Set `RESONANCE_SYNC_SECRET` (server-only). Public price feeds need no keys.

Project 1 at the repo root stays its own Vercel project with Root Directory `.`.
