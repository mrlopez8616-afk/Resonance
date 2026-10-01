# Cabinet note — XLM face

XLM is a live crypto node, batched with HBAR ([`hbar-face.md`](./hbar-face.md)). Do not copy-paste a new face component. Reuse the shared pieces. Do not invent RH Main, Coinbase, or a vault line.

## Crypto face rules

| Rule | What it means |
| --- | --- |
| Asset | Stellar Lumens. Units are **tokens** |
| Sleeve this brick | **RH Agentic only** — Robinhood Agentic position pull 2026-10-01 print `0` tokens. Do not invent Main, Coinbase, or vault lots. The node stays on the floor |
| Spot | Reuse `src/lib/spot-price.ts`. CoinGecko `stellar`, Binance `XLMUSDT` fallback |
| Dark feed | If every public spot feed is dark, the face shows `—`. Do not invent a USD number |
| Roster | Append XLM after HBAR. Leave the existing live order and the offline roster as they are |

## Reuse

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Same square. `{units} tokens`. Ticker and live price stay the large pair |
| Face shape | `src/lib/live-face.ts` → `assembleLiveFace("XLM", sleeves, quote)` | Position from config. Only `quote.usd` is live |
| Sleeve print | `src/data/xlm-sleeves.ts` | RH Agentic `0` only |
| Spot | `src/lib/spot-price.ts` → `fetchSpotUsd("XLM")` | Registered on `SPOT_TICKERS`. No broker key |
| Price route | `GET /api/spot-price?ticker=XLM` | Same JSON (`usd`, `source`, `fetchedAt`) |
| Sleeves route | `GET /api/sleeves?ticker=XLM` | Durable print, else the seed |
| Tile | `src/components/node-square.tsx` | `FLOOR_NODES` row `xlm` is `live` |
| Ingest | [`fill-ingest.md`](./fill-ingest.md) | XLM `rh-agentic` is a live book. `rh-main` / `coinbase` are **not** on this face (400). Flare vault untouched |

## XLM sleeves

`src/data/xlm-sleeves.ts` — Agentic position pull 2026-10-01.

- RH Agentic: `0` **tokens** (no open position; the 2026-09-29 lot was sold)
- No RH Main line
- No Coinbase line
- No Flare vault
- No Xaman / gas wallet address

The face shows the position, not each fill. Headline: `0 tokens`. With a live XLM-USD quote the value line is `~$0.00 live`. When the spot feed is dark the value line is `—`, the same as any other face with no quote. The sleeve row prints `0`, the same as SUI Agentic `0`. Do not print `NaN` or a six-decimal zero.

The square stays on the floor. The founder removes it with `×`. Do not drop XLM from the roster in this brick.

Durable overrides land via fill ingest on `rh-agentic` only. Seed `0` remains the fallback until a hub POST applies. This app does not poll Robinhood.

## What this brick does not store

The seed is the position print. The two confirmed buys and the 2026-10-01 sell are on the operator log as `logOnly` rows (orders `6abbe0e4-575c-4abe-a90e-90368b43a1b6`, `6abbe113-41cb-4aa8-9e7c-0a986335b95a`, and `6abed758-0215-4703-8d11-c412686df9be`) and do not move `0`. The two older sample rows in `src/data/fills.ts` stay as they are.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting BTC / ETH / SOL / FLR, inventing lots, hardcoding a live USD print, writing RH Main.
