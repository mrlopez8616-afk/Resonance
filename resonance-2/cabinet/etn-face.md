# Cabinet note — ETN equity face

ETN is the fourth live node and the second **equity** face. Do not copy-paste a fifth face. Reuse the shared pieces. Do not pretend CoinGecko or Binance has ETN.

## Equity face rules

| Rule | What it means |
| --- | --- |
| Asset | US equity (Eaton / power management). Units are **shares**, never crypto “tokens” |
| Sleeve this brick | **RH Agentic only** — founder / hub lock **`0.002374` shares** as of 2026-09-20 (account ••••0757). RH Main equities were **empty** on that live read. Do not invent Main as Agentic. The 2026-09-11 snapshot `0.041504` was RH Main and is not this sleeve. No Coinbase or vault lots |
| Spot | Reuse `src/lib/equity-price.ts`. **Not** CoinGecko / Binance. Same unpaid cascade as PWR (Yahoo quote → Yahoo chart → Stooq) |
| Weekend / last-trade | Prefer a live public print. If every unpaid feed is dark, the face shows `—` — do not invent a USD number |
| Locked 12 | Flip ETN to live. Leave VRT GEV CEG HUBB (and remaining crypto squares) dashed. XRP + SUI + PWR stay live |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} shares` for ETN (`unitsWord` from `assembleLiveFace`). PWR still says `shares`. XRP/SUI still say `tokens` |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live. Face qty is `formatSleeveQuantity` — values under 1 keep six decimals so `0.002374` does not round to `0.002` |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | Quantity stays a string. Face rows are label + quantity only |
| Sleeve print | `src/data/etn-sleeves.ts` | RH Agentic `0.002374` only |
| Equity spot | `src/lib/equity-price.ts` → `fetchEquityUsd("ETN")` | Register ETN on `EQUITY_FACE_TICKERS`. Same helper as PWR. No API key. No CoinGecko id |
| Price route | `GET /api/spot-price?ticker=ETN` | Same JSON (`usd`, `source`, `fetchedAt`). Route already dispatches equities to the equity helper; `SPOT_TICKERS` stays crypto-only |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `etn` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | ETN `rh-agentic` is now a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

XRP and SUI still use `src/lib/spot-price.ts` (CoinGecko → Binance). PWR stays on `equity-price.ts`. Thin aliases at `src/lib/xrp-face.ts` / `src/lib/xrp-price.ts` stay.

## ETN sleeves

`src/data/etn-sleeves.ts` — founder / hub lock 2026-09-20. Do not invent lots.

- RH Agentic: `0.002374` **shares** (account ••••0757)
- No RH Main line (Main equities empty on 2026-09-20; do not reuse snapshot `0.041504`)
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

Headline: `0.002374 shares`, then `0.002374 × live ETN-USD` as `~$… live`. Ticker and live price stay the large pair; shares / live USD / the one sleeve row step down and stay inside the square (face-fit #31).

Durable overrides land via fill ingest on `rh-agentic` only. Seed `0.002374` remains the fallback until a hub POST applies.

## What changed vs the PWR brick

- Reused `equity-price.ts` instead of adding a third price helper
- `EQUITY_FACE_TICKERS` is now `PWR` + `ETN`
- Same one-sleeve RH Agentic shape
- Fill-ingest skip-for-offline no longer applies to ETN (use VRT / GEV / … for log-only)

## Later bricks (do not light)

Hub live read 2026-09-20, RH Agentic (account ••••0757). **Document only — do not flip these squares live in this brick.** RH Main equities were empty; do not invent Main as Agentic.

| Ticker | Agentic shares | Floor |
| --- | --- | --- |
| PWR | `0.001578` | already live (matches [`pwr-face.md`](./pwr-face.md)) |
| ETN | `0.002374` | this brick |
| VRT | `0.004027` | keep dashed |
| GEV | `0.001068` | keep dashed |
| CEG | `0.003904` | keep dashed |
| HUBB | `0.002235` | keep dashed |

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Next live node is one at a time. Another physical equity reuses `equity-price.ts` + a new `*-sleeves.ts` and the Agentic print in the table above. Another crypto reuses `spot-price.ts`.
3. Do not register equities in `SPOT_TICKERS`.
4. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, inventing lots (including copying emptied Main onto Agentic), CoinGecko ETN, hardcoding a live USD print.
