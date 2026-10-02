# Cabinet note — HBAR face

HBAR is a live crypto node, batched with XLM ([`xlm-face.md`](./xlm-face.md)). Do not copy-paste a new face component. Reuse the shared pieces. Do not invent RH Main, Coinbase, or a vault line.

## Crypto face rules

| Rule | What it means |
| --- | --- |
| Asset | Hedera. Units are **tokens** |
| Sleeve this brick | **RH Agentic only** — Robinhood Agentic position pull 2026-10-01 print `7847.91` tokens. Cost basis $851.06 is not a sleeve field. Do not invent Main, Coinbase, or vault lots |
| Spot | Reuse `src/lib/spot-price.ts`. CoinGecko `hedera-hashgraph`, Binance `HBARUSDT` fallback |
| Dark feed | If every public spot feed is dark, the face shows `—`. Do not invent a USD number |
| Roster | Append HBAR. Leave the existing live order and the offline roster (BTC ETH SOL, and FLR which has no floor square) as they are |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} tokens`. Ticker and live price stay the large pair |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace("HBAR", sleeves, quote)` | Position from config. Only `quote.usd` is live |
| Sleeve print | `src/data/hbar-sleeves.ts` | RH Agentic `7847.91` only |
| Spot | `src/lib/spot-price.ts` → `fetchSpotUsd("HBAR")` | Registered on `SPOT_TICKERS`. No broker key |
| Price route | `GET /api/spot-price?ticker=HBAR` | Same JSON (`usd`, `source`, `fetchedAt`) |
| Sleeves route | `GET /api/sleeves?ticker=HBAR` | Durable print, else the seed |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `hbar` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | HBAR `rh-agentic` is a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

## HBAR sleeves

`src/data/hbar-sleeves.ts` — Agentic position pull 2026-10-01.

- RH Agentic: `7847.91` **tokens**
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

Headline: `7847.91 tokens`, then `7847.91 × live HBAR-USD` as `~$… live`. The face keeps two stored decimals so the print does not round to `7,848`.

Durable overrides land via fill ingest on `rh-agentic` only. Seed `7847.91` remains the fallback until a hub POST applies. This app does not poll Robinhood.

## What this brick does not store

The seed is the position print. Cost basis $851.06 is not a sleeve field. The confirmed buys are on the operator log as `logOnly` rows (orders `6abbe0d2-3966-4255-9e10-8c160f667d88`, `6abed771-773a-43df-9015-3bf44caf9938`, and `6abed82c-87a4-49c7-9bd7-083c6a543efd`) and do not add to `7847.91`. The two older sample rows in `src/data/fills.ts` stay as they are.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting BTC / ETH / SOL / FLR, inventing lots, hardcoding a live USD print, writing RH Main.
