# Cabinet note — CEG equity face

CEG is the seventh live node and the fifth **equity** face. This brick lights GEV, CEG, and HUBB together (founder efficiency lock — one batch, not a solo ticker PR). Do not copy-paste a new face component. Reuse the shared pieces. Do not pretend CoinGecko or Binance has CEG.

## Equity face rules

| Rule | What it means |
| --- | --- |
| Asset | US equity (Constellation Energy). Units are **shares**, never crypto “tokens” |
| Sleeve this brick | **RH Agentic only** — hub live lock 2026-09-21 print `0.009617` shares. Do not invent Main, Coinbase, or vault lots |
| Spot | Reuse `src/lib/equity-price.ts`. **Not** CoinGecko / Binance. Same unpaid cascade as PWR / ETN / VRT (Yahoo quote → Yahoo chart → Stooq) |
| Weekend / last-trade | Prefer a live public print. If every unpaid feed is dark, the face shows `—` — do not invent a USD number |
| Locked 12 | Flip CEG to live in the same batch as GEV ([`gev-face.md`](./gev-face.md)) and HUBB ([`hubb-face.md`](./hubb-face.md)). Leave BTC ETH SOL (and FLR, which has no floor square) dashed. XRP + SUI + PWR + ETN + VRT stay live |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} shares` for CEG (`unitsWord` from `assembleLiveFace`). PWR / ETN / VRT still say `shares`. XRP/SUI still say `tokens` |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live. Face qty is `formatSleeveQuantity` — values under 1 keep six decimals so `0.009617` does not round to `0.010` |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | Quantity stays a string. Face rows are label + quantity only |
| Sleeve print | `src/data/ceg-sleeves.ts` | RH Agentic `0.009617` only |
| Equity spot | `src/lib/equity-price.ts` → `fetchEquityUsd("CEG")` | Register CEG on `EQUITY_FACE_TICKERS`. Same helper as PWR / ETN / VRT. No API key. No CoinGecko id |
| Price route | `GET /api/spot-price?ticker=CEG` | Same JSON (`usd`, `source`, `fetchedAt`). Route already dispatches equities to the equity helper; `SPOT_TICKERS` stays crypto-only |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `ceg` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | CEG `rh-agentic` is now a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

XRP and SUI still use `src/lib/spot-price.ts` (CoinGecko → Binance). PWR, ETN, and VRT stay on `equity-price.ts`. Thin aliases at `src/lib/xrp-face.ts` / `src/lib/xrp-price.ts` stay.

## CEG sleeves

`src/data/ceg-sleeves.ts` — hub live lock 2026-09-21. Do not invent lots.

- RH Agentic: `0.009617` **shares**
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

Headline: `0.009617 shares`, then `0.009617 × live CEG-USD` as `~$… live`. Ticker and live price stay the large pair; shares / live USD / the one sleeve row step down and stay inside the square (face-fit #31).

Durable overrides land via fill ingest on `rh-agentic` only. Seed `0.009617` remains the fallback until a hub POST applies.

## Batch mates (same brick)

Hub lock 2026-09-21, also live in this batch:

- GEV `0.002640` — [`gev-face.md`](./gev-face.md)
- HUBB `0.005566` — [`hubb-face.md`](./hubb-face.md)

## What changed vs the VRT brick

- Reused `equity-price.ts` instead of adding a new price helper
- Same one-sleeve RH Agentic shape, qty is the post-trade print `0.009617`
- Fill-ingest skip-for-offline no longer applies to CEG (use BTC / ETH / SOL / FLR for log-only)

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Remaining offline squares are crypto (BTC ETH SOL, and FLR which is locked but has no floor square). Another crypto reuses `spot-price.ts`.
3. Do not register equities in `SPOT_TICKERS`.
4. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, inventing lots, CoinGecko CEG, hardcoding a live USD print.
