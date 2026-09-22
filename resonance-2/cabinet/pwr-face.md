# Cabinet note — PWR equity face

PWR is the third live node and the first **equity** face. Do not copy-paste a new face. Reuse the shared pieces. Do not pretend CoinGecko or Binance has PWR.

## Equity face rules

| Rule | What it means |
| --- | --- |
| Asset | US equity (Quanta / electrical infrastructure). Units are **shares**, never crypto “tokens” |
| Sleeve this brick | **RH Agentic only** — hub live lock 2026-09-21 print `0.003917` shares (supersedes 2026-09-19 `0.001578`). Do not invent Main, Coinbase, or vault lots |
| Spot | Public equity feed on the server. **Not** CoinGecko / Binance. Phase Zero already solved this in `src/lib/fetch-equities.ts` (Yahoo quote → Yahoo chart → Stooq) |
| Weekend context | Last trade ~**$636.5** (2026-09-19 weekend). Cabinet context only. Prefer a live public print. If every unpaid feed is dark, the face shows `—` — do not hardcode $636.5 as a live price |
| Locked 12 | PWR stays live. VRT is its own brick ([`vrt-face.md`](./vrt-face.md)). Leave GEV CEG HUBB dashed. XRP + SUI + ETN stay live |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} shares` for PWR (`unitsWord` from `assembleLiveFace`). XRP/SUI still say `tokens` |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live. Face qty is `formatSleeveQuantity` — values under 1 keep six decimals so `0.003917` does not round to `0.004` |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | Quantity stays a string. Face rows are label + quantity only |
| Sleeve print | `src/data/pwr-sleeves.ts` | RH Agentic `0.003917` only |
| Equity spot | `src/lib/equity-price.ts` → `fetchEquityUsd("PWR")` | Yahoo Finance unofficial quote → unofficial chart → Stooq. Same cascade as Phase Zero `fetch-equities.ts`. No API key. No CoinGecko id |
| Price route | `GET /api/spot-price?ticker=PWR` | Same JSON (`usd`, `source`, `fetchedAt`). Route dispatches equities to the equity helper; `SPOT_TICKERS` stays crypto-only |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `pwr` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | PWR `rh-agentic` is a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

XRP and SUI still use `src/lib/spot-price.ts` (CoinGecko → Binance). Thin aliases at `src/lib/xrp-face.ts` / `src/lib/xrp-price.ts` stay.

## PWR sleeves

`src/data/pwr-sleeves.ts` — hub live lock 2026-09-21. Do not invent lots.

- RH Agentic: `0.003917` **shares**
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

Headline: `0.003917 shares`, then `0.003917 × live PWR-USD` as `~$… live`. Ticker and live price stay the large pair; shares / live USD / the one sleeve row step down and stay inside the square (face-fit #31).

Durable overrides land via fill ingest on `rh-agentic` only. Seed `0.003917` remains the fallback until a hub POST applies.

## What changed vs the SUI brick

- New equity helper instead of adding PWR to `SPOT_TICKERS`
- `unitsWord: "shares"` on the assembled face
- One sleeve, not two
- Fill-ingest skip-for-offline no longer applies to PWR (use GEV / CEG / HUBB / remaining crypto for log-only; ETN and VRT are their own live books)

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Next live node is one at a time. VRT reuses `equity-price.ts` + [`vrt-face.md`](./vrt-face.md). Another crypto reuses `spot-price.ts`.
3. Do not register equities in `SPOT_TICKERS`.
4. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, inventing lots, CoinGecko PWR, hardcoding $636.5 as the live print.
