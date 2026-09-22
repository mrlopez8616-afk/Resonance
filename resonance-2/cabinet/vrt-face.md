# Cabinet note — VRT equity face

VRT is the fifth live node and the third **equity** face. Do not copy-paste a sixth face. Reuse the shared pieces. Do not pretend CoinGecko or Binance has VRT.

## Equity face rules

| Rule | What it means |
| --- | --- |
| Asset | US equity (Vertiv / thermal + power infrastructure). Units are **shares**, never crypto “tokens” |
| Sleeve this brick | **RH Agentic only** — hub live lock 2026-09-21 print `0.009991` shares. Do not invent Main, Coinbase, or vault lots |
| Spot | Reuse `src/lib/equity-price.ts`. **Not** CoinGecko / Binance. Same unpaid cascade as PWR / ETN (Yahoo quote → Yahoo chart → Stooq) |
| Weekend / last-trade | Prefer a live public print. If every unpaid feed is dark, the face shows `—` — do not invent a USD number |
| Locked 12 | Flip VRT to live. Leave GEV CEG HUBB (and remaining crypto squares) dashed. XRP + SUI + PWR + ETN stay live |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} shares` for VRT (`unitsWord` from `assembleLiveFace`). PWR / ETN still say `shares`. XRP/SUI still say `tokens` |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live. Face qty is `formatSleeveQuantity` — values under 1 keep six decimals so `0.009991` does not round to `0.010` |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | Quantity stays a string. Face rows are label + quantity only |
| Sleeve print | `src/data/vrt-sleeves.ts` | RH Agentic `0.009991` only |
| Equity spot | `src/lib/equity-price.ts` → `fetchEquityUsd("VRT")` | Register VRT on `EQUITY_FACE_TICKERS`. Same helper as PWR / ETN. No API key. No CoinGecko id |
| Price route | `GET /api/spot-price?ticker=VRT` | Same JSON (`usd`, `source`, `fetchedAt`). Route already dispatches equities to the equity helper; `SPOT_TICKERS` stays crypto-only |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `vrt` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | VRT `rh-agentic` is now a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

XRP and SUI still use `src/lib/spot-price.ts` (CoinGecko → Binance). PWR and ETN stay on `equity-price.ts`. Thin aliases at `src/lib/xrp-face.ts` / `src/lib/xrp-price.ts` stay.

## VRT sleeves

`src/data/vrt-sleeves.ts` — hub live lock 2026-09-21. Do not invent lots.

- RH Agentic: `0.009991` **shares**
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

Headline: `0.009991 shares`, then `0.009991 × live VRT-USD` as `~$… live`. Ticker and live price stay the large pair; shares / live USD / the one sleeve row step down and stay inside the square (face-fit #31).

Durable overrides land via fill ingest on `rh-agentic` only. Seed `0.009991` remains the fallback until a hub POST applies.

## Later faces (do not light)

2026-09-21 Agentic prints, cabinet-only until their own brick:

- GEV `0.002640`
- CEG `0.009617`
- HUBB `0.005566`

Leave those squares dashed. Do not invent Main lots or Coinbase rows for them.

## What changed vs the ETN brick

- Reused `equity-price.ts` instead of adding a fourth price helper
- `EQUITY_FACE_TICKERS` is now `PWR` + `ETN` + `VRT`
- Same one-sleeve RH Agentic shape, qty is the post-trade print `0.009991`
- Fill-ingest skip-for-offline no longer applies to VRT (use GEV / CEG / HUBB / remaining crypto for log-only)

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Next live node is one at a time. Another physical equity reuses `equity-price.ts` + a new `*-sleeves.ts`. Another crypto reuses `spot-price.ts`.
3. Do not register equities in `SPOT_TICKERS`.
4. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, inventing lots, CoinGecko VRT, hardcoding a live USD print.
