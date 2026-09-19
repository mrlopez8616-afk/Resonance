# Cabinet note — SUI face

SUI is the second live node. Do not copy-paste a third face. Reuse the shared pieces that this brick extracted from XRP.

## Reuse for the next live node (PWR / physical AI, or the next crypto)

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Ticker, live USD, sleeve rows, TOTAL USD. Polls `/api/spot-price?ticker=` |
| Face shape | `src/lib/live-face.ts` → `LiveFaceData` / `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | `quantity` string + optional `note` (honest zero / staked copy) |
| Spot price | `src/lib/spot-price.ts` → `fetchSpotUsd(ticker)` | CoinGecko → Binance. Add the ticker to `SPOT_TICKERS` + `FEEDS` |
| Price route | `GET /api/spot-price?ticker=SUI` | Same JSON as the old `/api/xrp-price` (`usd`, `source`, `fetchedAt`) |
| Tile | `src/components/node-square.tsx` | Flip the row in `FLOOR_NODES` to `live` |

XRP still uses this same stack. Thin aliases remain at `src/lib/xrp-face.ts` and `src/lib/xrp-price.ts` / `GET /api/xrp-price`.

## SUI sleeves

`src/data/sui-sleeves.ts` — 2026-09-19 CT Resonance check. Do not invent lots.

- RH Agentic: `8.931` SUI
- Coinbase: `0` with `note: "staked/unavailable"` — spendable balance is zero; likely staked. The face shows `0 (staked/unavailable)`. USD total uses 0 for this row.
- No Flare vault
- No Xaman / gas wallet address

When a server-side Coinbase connector exists, replace the `0` only if spendable units are actually readable. A staked-not-available print should stay a noted zero, not a guessed quantity.

## What changed vs the XRP brick

- Shared `LiveNodeFace` replaced `xrp-face.tsx`
- Shared `fetchSpotUsd` replaced the XRP-only helper
- Sleeve `note` exists so a zero can stay honest
- SUI has no vault line

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Add `src/data/<ticker>-sleeves.ts` (or skip sleeves if the node is watch-only).
3. Register the ticker in `SPOT_TICKERS` **only if** it has a public spot USD feed. Equities need a different server helper — do not pretend CoinGecko has PWR.
4. Flip `FLOOR_NODES` to `live` and pass the assembled face from `src/app/page.tsx`.
5. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, click-into guts.
