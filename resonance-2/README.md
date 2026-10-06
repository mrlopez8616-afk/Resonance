# Resonance 2.0

Operator floor for Resonance 2.0. **XRP, SUI, PWR, ETN, VRT, GEV, CEG, HUBB, and HBAR are live.** The homepage paints those faces plus the one `+` slot. BTC, ETH, and SOL stay in the floor roster and are not painted while offline. FLR stays locked with no floor square. XLM is not a floor node; its three historical fills stay on `/log`. The Xaman gas wallet is never shown.

This folder is a **separate** Next.js App Router app. It does not share runtime, routes, or data with the Phase Zero dashboard at the repo root. Point Vercel project `resonance3` at Root Directory `resonance-2`.

## Surfaces

- `/` — factory-floor shell: left toolbar, live node squares, one `+` slot, LIVE chip, operator status strip. Offline roster rows are not painted. Live faces show ticker, large spot price, sleeve-sum units (`tokens` for crypto, `shares` for PWR/ETN/VRT/GEV/CEG/HUBB), live USD, then sleeve rows. `×` removes a square after confirm; `+` restores it. Sleeve files and fills stay.
- `/log` — search desk over the one fill store ([`src/data/fills.ts`](src/data/fills.ts) is the seed / local fallback). Filter by ticker, date range, sleeve, and source. A nodes strip lists every locked ticker with a non-zero live sleeve print or a fill quantity. A live node click opens that ticker’s pane (`/log?ticker=…`). Same fill card. Ingest is unchanged.
- `/calendar` — operating calendar. Day is the default, with Week and Month. A month square opens `/calendar/YYYY-MM-DD`. Lanes: Cadence, Capital, Build, Gates, plus node-tagged catalysts. Same Blob cabinet as fills (`resonance-2/calendar.json`) and the same Bearer secret. See [`cabinet/operating-calendar.md`](cabinet/operating-calendar.md).

## Live faces (this brick)

Sleeve quantities start as typed placeholders, then update when Hub / RH Ops POSTs a fill:

- XRP — [`src/data/xrp-sleeves.ts`](src/data/xrp-sleeves.ts) (RH Agentic `51.601`; Flare vault `28281`; no RH Main sleeve; no Coinbase sleeve)
- SUI — [`src/data/sui-sleeves.ts`](src/data/sui-sleeves.ts) (RH Agentic `0` sold; Coinbase 33.7)
- PWR — [`src/data/pwr-sleeves.ts`](src/data/pwr-sleeves.ts) (RH Agentic `0.003917` **shares** only)
- ETN — [`src/data/etn-sleeves.ts`](src/data/etn-sleeves.ts) (RH Agentic `0.005844` **shares** only)
- VRT — [`src/data/vrt-sleeves.ts`](src/data/vrt-sleeves.ts) (RH Agentic `0.009991` **shares** only)
- GEV — [`src/data/gev-sleeves.ts`](src/data/gev-sleeves.ts) (RH Agentic `0.002640` **shares** only)
- CEG — [`src/data/ceg-sleeves.ts`](src/data/ceg-sleeves.ts) (RH Agentic `0.009617` **shares** only)
- HUBB — [`src/data/hubb-sleeves.ts`](src/data/hubb-sleeves.ts) (RH Agentic `0.005566` **shares** only)
- HBAR — [`src/data/hbar-sleeves.ts`](src/data/hbar-sleeves.ts) (RH Agentic `7847.91` **tokens** only)

Crypto live price is fetched **server-side** from public spot feeds (CoinGecko, Binance fallback) in [`src/lib/spot-price.ts`](src/lib/spot-price.ts). PWR, ETN, VRT, GEV, CEG, and HUBB use the equity helper in [`src/lib/equity-price.ts`](src/lib/equity-price.ts) (Yahoo → Yahoo chart → Stooq) — not CoinGecko. Hub posts fills to `POST /api/fills`. This app does not poll Robinhood or Coinbase. Do not put broker keys in the client or in `NEXT_PUBLIC_*`.

The floor background is a mood wash from that same live book versus 24 hours ago ([`src/lib/portfolio-mood.ts`](src/lib/portfolio-mood.ts)). Each live holding is current value versus `quantity × price24hAgo` (or the feed’s own 24h percent when it did not send a prior price). **Flat** means the absolute portfolio change is under **0.05%**. If coverage of priced value is under half, or every 24h price is missing, the wash stays neutral and the chip reads unavailable. When some holdings are excluded but the rest still clear that bar, the chip says **partial**. Fight Desk bets are not holdings. Node squares stay white. In development only, `?mood=up|down|flat|unknown` forces the wash for screenshots; production ignores it.

Flare vault is a **manual** founder constant (`28281` XRP) on the XRP face only. Ingest cannot write it. SUI, PWR, ETN, VRT, GEV, CEG, HUBB, and HBAR have no vault line.

Reuse notes: [`cabinet/xrp-face.md`](cabinet/xrp-face.md), [`cabinet/sui-face.md`](cabinet/sui-face.md), [`cabinet/pwr-face.md`](cabinet/pwr-face.md), [`cabinet/etn-face.md`](cabinet/etn-face.md), [`cabinet/vrt-face.md`](cabinet/vrt-face.md), [`cabinet/gev-face.md`](cabinet/gev-face.md), [`cabinet/ceg-face.md`](cabinet/ceg-face.md), [`cabinet/hubb-face.md`](cabinet/hubb-face.md), [`cabinet/hbar-face.md`](cabinet/hbar-face.md), fill ingest: [`cabinet/fill-ingest.md`](cabinet/fill-ingest.md). XLM left the floor; the kept fills are in [`cabinet/xlm-face.md`](cabinet/xlm-face.md).

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

## How to append a bet

`POST /api/bets` uses the same Bearer as `POST /api/bets/settle` and `POST /api/calendar`: `Authorization: Bearer $RESONANCE_SYNC_SECRET`. The secret stays server-side. Send one bet, `{ "bets": [ ... ] }`, or a bare array.

`orderId` is the idempotency key. Re-posting the same orderId is a **no-op**: the stored row is returned and is not rewritten, so a later settlement stays put. It is not a field upsert. `status` defaults to `open`. `won`, `lost`, and `void` are accepted on the way in, with P&L computed the same way settle does (won = payout − stake, lost = −stake, void = 0). `payout` is the ticket payout. `hubLean` and `agreesWithLean` are optional; omitted leans are filled from the fight catalog when the fight is known.

The live blob (`resonance-2/bets.json`) inserts seed ids that are missing on the next read. A row already stored under that id or orderId is left alone, including a settled row. The second Coria ticket (`ufc-332-coria-2`, order `e4f0c363-fefd-4cb5-8e7c-bb695def7711`) rides that path.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/bets \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "content-type: application/json" \
  -d @ticket.json

RESONANCE_SYNC_SECRET=... npm run bets:post -- ticket.json
```

## How to append a later fill

Production path: Hub / RH Ops `POST /api/fills` with Bearer `RESONANCE_SYNC_SECRET`. Schema, idempotency, and the Monday Agentic SUI→6 AI fixture are in [`cabinet/fill-ingest.md`](cabinet/fill-ingest.md).

Local/dev without Blob still seeds from [`src/data/fills.ts`](src/data/fills.ts) and writes `.data/fills.json`. Do not paste keys, seeds, account numbers, or the gas wallet address into that file.

## Postgres (Neon)

Hosting stays on Vercel Hobby. When `DATABASE_URL` is set, bets, fills, settlements, and calendar rows are read from Postgres. When it is unset, the app keeps the Blob or local file and the same seed merge. Either way a store that cannot be read shows the storage banner and write routes return 503. Details, the import, and the outage replay are in [`db/README.md`](db/README.md).

```bash
npm run db:migrate
npm run db:import-blob
npm run db:replay -- --file outage.json
```

Connect Neon from the Vercel project **resonance3** (team **resonance9**): Storage → Marketplace → Neon, one click. Tick Production, Preview, and Development for `DATABASE_URL` (the pooled URL). Redeploy so the new variable is on the running build. Then run the three commands above. Import before replay.

## Deploy on Vercel (resonance3)

1. Import this Git repository.
2. Set **Root Directory** to `resonance-2`.
3. Framework Preset: Next.js (auto-detected from this folder’s `package.json`).
4. Connect a Blob store. Set `RESONANCE_SYNC_SECRET` (server-only). Public price feeds need no keys.

Project 1 at the repo root stays its own Vercel project with Root Directory `.`.
