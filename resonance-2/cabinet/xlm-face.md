# Cabinet note — XLM face

XLM is a live crypto node, batched with HBAR ([`hbar-face.md`](./hbar-face.md)). Do not copy-paste a new face component. Reuse the shared pieces. Do not invent RH Main, Coinbase, or a vault line.

## Crypto face rules

| Rule | What it means |
| --- | --- |
| Asset | Stellar Lumens. Units are **tokens** |
| Sleeve this brick | **RH Agentic only** — Robinhood Agentic position pull 2026-09-29 print `1910.31` tokens. Do not invent Main, Coinbase, or vault lots |
| Spot | Reuse `src/lib/spot-price.ts`. CoinGecko `stellar`, Binance `XLMUSDT` fallback |
| Dark feed | If every public spot feed is dark, the face shows `—`. Do not invent a USD number |
| Roster | Append XLM after HBAR. Leave the existing live order and the offline roster as they are |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} tokens`. Ticker and live price stay the large pair |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace("XLM", sleeves, quote)` | Position from config. Only `quote.usd` is live |
| Sleeve print | `src/data/xlm-sleeves.ts` | RH Agentic `1910.31` only |
| Spot | `src/lib/spot-price.ts` → `fetchSpotUsd("XLM")` | Registered on `SPOT_TICKERS`. No broker key |
| Price route | `GET /api/spot-price?ticker=XLM` | Same JSON (`usd`, `source`, `fetchedAt`) |
| Sleeves route | `GET /api/sleeves?ticker=XLM` | Durable print, else the seed |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `xlm` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | XLM `rh-agentic` is a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

## XLM sleeves

`src/data/xlm-sleeves.ts` — Agentic position pull 2026-09-29.

- RH Agentic: `1910.31` **tokens** (the open position)
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

The position is two filled buys on the same sleeve: `1891.36` then `18.95`. The face shows the position, not each fill. Headline: `1910.31 tokens`, then `1910.31 × live XLM-USD` as `~$… live`.

Durable overrides land via fill ingest on `rh-agentic` only. Seed `1910.31` remains the fallback until a hub POST applies. This app does not poll Robinhood.

## What this brick does not store

The seed is the position print, same as the other live books. It is not a replay of either buy into `src/data/fills.ts`. Those two sample rows stay as they are.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting BTC / ETH / SOL / FLR, inventing lots, hardcoding a live USD print, writing RH Main.
