# Cabinet note — SUI face

SUI is the second live node. PWR (equity) is the third — start at [`pwr-face.md`](./pwr-face.md). ETN is the fourth — [`etn-face.md`](./etn-face.md). VRT is the fifth — [`vrt-face.md`](./vrt-face.md). Do not copy-paste a sixth face.

## Reuse for the next live node (another equity, or the next crypto)

| Piece | Path | Use |
| --- | --- | --- |
| Live face UI | `src/components/live-node-face.tsx` | Ticker and `$price` share the same large size; `{units} tokens`, `~$usd live`, and sleeve rows step down and stay inside the square. Polls `/api/spot-price?ticker=` and `/api/sleeves?ticker=` |
| Face shape | `src/lib/live-face.ts` → `LiveFaceData` / `assembleLiveFace(ticker, sleeves, quote)` | Positions from config. Only `quote.usd` is live. Face qty is `formatSleeveQuantity(quantity)` — `note` is not painted |
| Sleeve type | `src/data/sleeves.ts` → `NodeSleeve` | `quantity` string. Face rows are label + quantity only. |
| Spot price | `src/lib/spot-price.ts` → `fetchSpotUsd(ticker)` | CoinGecko → Binance. Add the ticker to `SPOT_TICKERS` + `FEEDS` |
| Price route | `GET /api/spot-price?ticker=SUI` | Same JSON as the old `/api/xrp-price` (`usd`, `source`, `fetchedAt`) |
| Tile | `src/components/node-square.tsx` | Flip the row in `FLOOR_NODES` to `live` |

XRP still uses this same stack. Thin aliases remain at `src/lib/xrp-face.ts` and `src/lib/xrp-price.ts` / `GET /api/xrp-price`.

Hub fill ingest (RH Agentic / Coinbase prints, never Flare) is [`fill-ingest.md`](./fill-ingest.md). Monday Agentic SUI→6 AI is the first consumer of that path.

## SUI sleeves

`src/data/sui-sleeves.ts` — hub live lock 2026-09-21. Do not invent lots. Durable overrides land via fill ingest; seed values below remain the fallback.

- RH Agentic: `0` SUI (sold). Keep the row; do not drop the sleeve.
- Coinbase: `33.7` — clean face qty (`Coinbase 33.7`), no “buy print / staked” label. Coinbase Advanced Trade (2026-09-19) `balance` SUI available=0 hold=0 (staking not exposed on this API key). The number is the sum of SUI-USD **FILLED buys** only: 16.9 + 16.8 = 33.7. Sells on this book: none. Do **not** invent a separate stake size beyond 33.7.
- Headline: `0 + 33.7 = 33.7 tokens`, then `33.7 × live SUI-USD` as `~$… live`. Ticker and live price pop at the same large size; tokens / live USD / sleeves step down and stay inside the square.
- No Flare vault
- No Xaman / gas wallet address

When a server-side Coinbase connector exists: if `available`/`hold` are both 0, keep summing SUI-USD filled buys (minus filled sells) rather than showing a bare zero. Only replace 33.7 with a live wallet print when spendable or staked units are actually readable.

## What changed vs the XRP brick

- Shared `LiveNodeFace` replaced `xrp-face.tsx`
- Shared `fetchSpotUsd` replaced the XRP-only helper
- Sleeve `note` is internal only; the face does not render it
- SUI has no vault line

## Next brick

1. Keep `OperatorShell` / `NodeSquare` / `LiveNodeFace`.
2. Add `src/data/<ticker>-sleeves.ts` (or skip sleeves if the node is watch-only).
3. Register the ticker in `SPOT_TICKERS` **only if** it has a public crypto spot USD feed. Equities reuse `src/lib/equity-price.ts` — do not pretend CoinGecko has PWR, ETN, or VRT.
4. Flip `FLOOR_NODES` to `live` and pass the assembled face from `src/app/page.tsx`.
5. Wire broker connectors server-side only.

Forbidden: seeds, keys, `NEXT_PUBLIC_*` secrets, gas-wallet addresses, lighting every square, click-into guts.
