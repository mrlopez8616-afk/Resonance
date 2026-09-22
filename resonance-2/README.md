# Resonance 2.0

Operator floor for Resonance 2.0. **XRP, SUI, PWR, ETN, VRT, GEV, CEG, and HUBB are live.** Other node squares are offline placeholders. The Xaman gas wallet is never shown.

This folder is a **separate** Next.js App Router app. It does not share runtime, routes, or data with the Phase Zero dashboard at the repo root. Point Vercel project `resonance3` at Root Directory `resonance-2`.

## Surfaces

- `/` — factory-floor shell: left toolbar, equal node squares, LIVE chip, operator status strip. Live faces show ticker, large spot price, sleeve-sum units (`tokens` for crypto, `shares` for PWR/ETN/VRT/GEV/CEG/HUBB), live USD, then sleeve rows. `×` removes a square after confirm; `+` restores it. Sleeve files and fills stay.
- `/log` — search desk over the one fill store ([`src/data/fills.ts`](src/data/fills.ts) is the seed / local fallback). Filter by ticker, date range, sleeve, and source. A live node click opens that ticker’s pane (`/log?ticker=…`). Same fill card. Ingest is unchanged.

## Live faces (this brick)

Sleeve quantities start as typed placeholders, then update when Hub / RH Ops POSTs a fill:

- XRP — [`src/data/xrp-sleeves.ts`](src/data/xrp-sleeves.ts)
- SUI — [`src/data/sui-sleeves.ts`](src/data/sui-sleeves.ts) (RH Agentic `0` sold; Coinbase 33.7)
- PWR — [`src/data/pwr-sleeves.ts`](src/data/pwr-sleeves.ts) (RH Agentic `0.003917` **shares** only)
- ETN — [`src/data/etn-sleeves.ts`](src/data/etn-sleeves.ts) (RH Agentic `0.005844` **shares** only)
- VRT — [`src/data/vrt-sleeves.ts`](src/data/vrt-sleeves.ts) (RH Agentic `0.009991` **shares** only)
- GEV — [`src/data/gev-sleeves.ts`](src/data/gev-sleeves.ts) (RH Agentic `0.002640` **shares** only)
- CEG — [`src/data/ceg-sleeves.ts`](src/data/ceg-sleeves.ts) (RH Agentic `0.009617` **shares** only)
- HUBB — [`src/data/hubb-sleeves.ts`](src/data/hubb-sleeves.ts) (RH Agentic `0.005566` **shares** only)

Crypto live price is fetched **server-side** from public spot feeds (CoinGecko, Binance fallback) in [`src/lib/spot-price.ts`](src/lib/spot-price.ts). PWR, ETN, VRT, GEV, CEG, and HUBB use the equity helper in [`src/lib/equity-price.ts`](src/lib/equity-price.ts) (Yahoo → Yahoo chart → Stooq) — not CoinGecko. Hub posts fills to `POST /api/fills`. This app does not poll Robinhood or Coinbase. Do not put broker keys in the client or in `NEXT_PUBLIC_*`.

Flare vault is a **manual** founder constant (`28273` XRP) on the XRP face only. Ingest cannot write it. SUI, PWR, ETN, VRT, GEV, CEG, and HUBB have no vault line.

Reuse notes: [`cabinet/xrp-face.md`](cabinet/xrp-face.md), [`cabinet/sui-face.md`](cabinet/sui-face.md), [`cabinet/pwr-face.md`](cabinet/pwr-face.md), [`cabinet/etn-face.md`](cabinet/etn-face.md), [`cabinet/vrt-face.md`](cabinet/vrt-face.md), [`cabinet/gev-face.md`](cabinet/gev-face.md), [`cabinet/ceg-face.md`](cabinet/ceg-face.md), [`cabinet/hubb-face.md`](cabinet/hubb-face.md), fill ingest: [`cabinet/fill-ingest.md`](cabinet/fill-ingest.md).

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
