# Resonance 2.0

Operator floor for Resonance 2.0. **XRP and SUI are live.** Other node squares are offline placeholders. The Xaman gas wallet is never shown.

This folder is a **separate** Next.js App Router app. It does not share runtime, routes, or data with the Phase Zero dashboard at the repo root. Point Vercel project `resonance3` at Root Directory `resonance-2`.

## Surfaces

- `/` — factory-floor shell: left toolbar, equal node squares, LIVE chip, operator status strip. XRP and SUI faces show live USD plus sleeve quantities.
- `/log` — existing agentic sleeve fill log. Same toolbar. Rows still come only from [`src/data/fills.ts`](src/data/fills.ts).

## Live faces (this brick)

Sleeve quantities are typed placeholders:

- XRP — [`src/data/xrp-sleeves.ts`](src/data/xrp-sleeves.ts)
- SUI — [`src/data/sui-sleeves.ts`](src/data/sui-sleeves.ts) (RH Agentic 8.931; Coinbase 0 staked/unavailable)

Live price is fetched **server-side** from public spot feeds (CoinGecko, Binance fallback) in [`src/lib/spot-price.ts`](src/lib/spot-price.ts). The next brick can replace those quantities with server-side Robinhood / Coinbase connectors. Do not put broker keys in the client or in `NEXT_PUBLIC_*`.

Flare vault is a **manual** founder constant (`28273` XRP) on the XRP face only. It is not a chain read. SUI has no vault line.

Reuse notes: [`cabinet/xrp-face.md`](cabinet/xrp-face.md), [`cabinet/sui-face.md`](cabinet/sui-face.md).

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

1. Open [`src/data/fills.ts`](src/data/fills.ts).
2. Append a new object to the `fills` array. Keep the recorded values as strings so quantity and price stay exact:

```ts
{
  time: "2026-09-18T12:00:00-05:00", // ISO-8601 with offset
  symbol: "XRP",
  side: "buy",                       // "buy" | "sell"
  quantity: "1.5",
  price: "1.40",
  orderId: "uuid-from-the-broker",
  result: "filled",
},
```

3. Save. `/log` reads this file only and sorts by `time` (newest first).
4. Commit and deploy. Do not paste keys, seeds, account numbers, or the gas wallet address into this file.

## Deploy on Vercel (resonance3)

1. Import this Git repository.
2. Set **Root Directory** to `resonance-2`.
3. Framework Preset: Next.js (auto-detected from this folder’s `package.json`).
4. Leave broker env vars empty in this brick. Public price feeds need no keys.

Project 1 at the repo root stays its own Vercel project with Root Directory `.`.
