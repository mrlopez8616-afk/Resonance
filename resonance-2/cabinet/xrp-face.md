# Cabinet note — homepage shell + XRP face

Reuse these pieces for the next live node. Do not reinvent a second floor, a second square, or a second price helper.

## Shell

| Piece | Path | Use |
| --- | --- | --- |
| Floor chrome | `src/components/operator-shell.tsx` | Header (`RESONANCE 2.0` + LIVE), canvas, bottom operator strip |
| Left toolbar | `src/components/operator-toolbar.tsx` | Home / Floor + operator log are wired. Calendar / approvals / settings stay placeholders until a route exists. Every rail icon uses `title` + `data-tooltip` so hover/focus shows a dark-shell label without a click (`::after` in `globals.css`) |
| Factory tokens | `src/app/globals.css` | Dark floor, dashed offline squares, red live rim. `--live` is the XRP border |

The fill log is still the same component. It lives on `/log` now so the homepage can be the floor.

## Node square

`src/components/node-square.tsx` is the only tile.

- `live` — solid red rim (XRP only in this brick)
- `dashed` — offline placeholder
- `empty` — the `+` slot

Grid order is `src/data/floor-nodes.ts`. Offline tickers are labels only. Do not attach prices or sleeves until that node is stood up.

## XRP face data shape

`src/lib/xrp-face.ts` → `XrpFaceData` / `XrpSleeveFace`.

```ts
{
  ticker: "XRP",
  priceUsd: number | null,
  priceLabel: string,
  source: string | null,
  fetchedAt: string | null,
  sleeves: [{ id, label, quantity, quantityLabel, source, manual }],
  totalXrp: number,
  totalUsd: number | null,
  totalUsdLabel: string
}
```

Assemble with `assembleXrpFace(sleeves, quote)`. Positions come from config. Only `quote.usd` is live. Do not invent fluctuating lots.

Sleeve quantities: `src/data/xrp-sleeves.ts`

- RH Main / RH Agentic — last-known Robinhood prints (typed placeholders)
- Coinbase — last-known Default-wallet print (stub until a **server-only** Coinbase connector exists)
- Flare vault — `FLARE_VAULT_XRP = "28273"`, `manual: true`

Never put the Xaman gas wallet address on a face.

## Price fetch

`src/lib/xrp-price.ts` (marked `server-only`)

- CoinGecko `ripple` USD, then Binance `XRPUSDT`
- Same public-feed idea as Phase Zero `src/lib/fetch-crypto.ts`, scoped to XRP
- 30s in-process cache
- Route: `GET /api/xrp-price` for the client poller
- Homepage SSR calls `loadXrpQuote()` so the first paint already has a print

No broker keys. No `NEXT_PUBLIC_*` secrets.

## Next brick (SUI, then the rest)

1. Keep `OperatorShell` / `NodeSquare`.
2. Add a typed sleeve file (or a generic `src/data/<ticker>-sleeves.ts`) if that node has lots.
3. Reuse `fetchXrpUsd` as a template — extract a shared `fetchSpotUsd(ticker)` only when the second live node needs it.
4. Flip that row in `FLOOR_NODES` from `offline` to `live` and drop a face into `NodeGrid`.
5. Wire Robinhood / Coinbase **server-side only** when credentials exist in Vercel env. Replace the placeholder quantities; do not change the face shape.

Forbidden: seeds, private keys, API secrets in the client bundle, gas-wallet addresses, click-into guts pages, lighting every square at once.
