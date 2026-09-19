# Cabinet note — homepage shell + XRP face

Reuse these pieces for the next live node. Do not reinvent a second floor, a second square, or a second price helper.

SUI is already live. Shared extract lives in [`sui-face.md`](./sui-face.md) — start there for the third node.

## Shell

| Piece | Path | Use |
| --- | --- | --- |
| Floor chrome | `src/components/operator-shell.tsx` | Header (`RESONANCE 2.0` + LIVE), canvas, bottom operator strip |
| Left toolbar | `src/components/operator-toolbar.tsx` | Home / Floor + operator log are wired. Calendar / approvals / settings stay placeholders until a route exists. Every rail icon uses `aria-label` + `data-tooltip` so hover/focus shows a dark-shell label without a click (`::after` in `globals.css`). Skip native `title` so it does not stack on the CSS chip. |
| Factory tokens | `src/app/globals.css` | Dark floor, dashed offline squares, red live rim. `--live` is the live-node border |

The fill log is still the same component. It lives on `/log` now so the homepage can be the floor.

## Node square

`src/components/node-square.tsx` is the only tile.

- `live` — solid red rim (XRP and SUI in this brick)
- `dashed` — offline placeholder
- `empty` — the `+` slot

Grid order is `src/data/floor-nodes.ts`. Offline tickers are labels only.

## Live face (shared — use this, not a new XRP-only file)

| Piece | Path |
| --- | --- |
| UI | `src/components/live-node-face.tsx` |
| Shape / assemble | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` |
| Spot USD | `src/lib/spot-price.ts` → `fetchSpotUsd("XRP" \| "SUI")` |
| Poll | `GET /api/spot-price?ticker=XRP` |

`src/lib/xrp-face.ts` and `src/lib/xrp-price.ts` are thin aliases.

```ts
{
  ticker: "XRP",
  priceUsd: number | null,
  priceLabel: string,
  source: string | null,
  fetchedAt: string | null,
  sleeves: [{ id, label, quantity, quantityLabel, source, manual, note? }],
  totalUnits: number,
  totalUsd: number | null,
  totalUsdLabel: string
}
```

Positions come from config. Only `quote.usd` is live. Do not invent fluctuating lots.

Sleeve quantities: `src/data/xrp-sleeves.ts`

- RH Main / RH Agentic — last-known Robinhood prints (typed placeholders)
- Coinbase — last-known Default-wallet print (stub until a **server-only** Coinbase connector exists)
- Flare vault — `FLARE_VAULT_XRP = "28273"`, `manual: true`

Never put the Xaman gas wallet address on a face.

## Next brick

See [`sui-face.md`](./sui-face.md). Register the next ticker in `SPOT_TICKERS` only when a public spot feed exists. Equities are a different helper.

Forbidden: seeds, private keys, API secrets in the client bundle, gas-wallet addresses, click-into guts pages, lighting every square at once.
