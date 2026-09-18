# Resonance 2.0

Agentic sleeve fill log. **Main and the vault are not shown here.**

This folder is a **separate** Next.js App Router app. It does not share runtime, routes, or data with the Phase Zero dashboard at the repo root. Point a new Vercel project at Root Directory `resonance-2`.

Rows come only from [`src/data/fills.ts`](src/data/fills.ts). There is no live brokerage, no seeds, no keys, and no account numbers.

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

3. Save. The page reads this file only and sorts by `time` (newest first).
4. Commit and deploy. Do not paste keys, seeds, account numbers, Main lots, or vault balances into this file.

## Deploy on Vercel (new project)

Hub should create a **new** Vercel project (do not reuse Project 1):

1. Import this Git repository.
2. Set **Root Directory** to `resonance-2`.
3. Framework Preset: Next.js (auto-detected from this folder’s `package.json`).
4. Leave env vars empty. This app has no secrets.

Project 1 at the repo root stays its own Vercel project with Root Directory `.`.
