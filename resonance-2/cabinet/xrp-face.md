# Cabinet note — homepage shell + XRP face

Reuse these pieces for the next live node. Do not reinvent a second floor, a second square, or a second price helper.

SUI and PWR are already live. Shared extract lives in [`sui-face.md`](./sui-face.md). Equity rules: [`pwr-face.md`](./pwr-face.md).

## Shell

| Piece | Path | Use |
| --- | --- | --- |
| Floor chrome | `src/components/operator-shell.tsx` | Header (`RESONANCE 2.0` + LIVE), canvas, bottom operator strip |
| Left toolbar | `src/components/operator-toolbar.tsx` | Home / Floor + operator log are wired. Calendar / approvals / settings stay placeholders until a route exists. Every rail icon uses `aria-label` + `data-tooltip` so hover/focus shows a dark-shell label without a click (`::after` in `globals.css`). Skip native `title` so it does not stack on the CSS chip. |
| Factory tokens | `src/app/globals.css` | Dark floor, dashed offline squares, red live rim. `--live` is the live-node border |

The fill log is still the same component. It lives on `/log` now so the homepage can be the floor.

## Node square

`src/components/node-square.tsx` is the only tile.

- `live` — solid red rim (XRP, SUI, and PWR in this brick)
- `dashed` — offline placeholder
- `empty` — the `+` slot

Grid order is `src/data/floor-nodes.ts`. Offline tickers are labels only. Add/delete chrome: [`floor-nodes.md`](./floor-nodes.md).

## Live face (shared — use this, not a new XRP-only file)

| Piece | Path |
| --- | --- |
| UI | `src/components/live-node-face.tsx` — ticker and `$price` share the same large size; `{units} tokens`, `~$usd live`, and sleeve rows step down and stay inside the square |
| Shape / assemble | `src/lib/live-face.ts` → `assembleLiveFace(ticker, sleeves, quote)` |
| Spot USD | `src/lib/spot-price.ts` → `fetchSpotUsd("XRP" \| "SUI")` |
| Poll | `GET /api/spot-price?ticker=XRP` (price) and `GET /api/sleeves?ticker=XRP` (durable prints; Flare vault stays founder-typed) |

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
  totalUnitsLabel: string,
  totalUsd: number | null,
  totalUsdLabel: string
}
```

Positions come from config, then from the durable fill-ingest store when a hub POST has landed. Only `quote.usd` is a live price. Do not invent fluctuating lots.

Sleeve quantities: `src/data/xrp-sleeves.ts` (seed / fallback). Hub writes go through [`fill-ingest.md`](./fill-ingest.md). **Flare vault stays founder-typed** — ingest cannot write `flare-vault`.

- RH Main / RH Agentic — last-known Robinhood prints (typed placeholders)
- Coinbase — last-known Default-wallet print (stub until a **server-only** Coinbase connector exists)
- Flare vault — `FLARE_VAULT_XRP = "28273"`, `manual: true`

Never put the Xaman gas wallet address on a face.

## Next brick

Fill ingest (RH + Coinbase → operator log + sleeve print) is [`fill-ingest.md`](./fill-ingest.md). SUI reuse is [`sui-face.md`](./sui-face.md). PWR equity reuse is [`pwr-face.md`](./pwr-face.md). Register a crypto ticker in `SPOT_TICKERS` only when a public crypto spot feed exists. Equities use `equity-price.ts`, not CoinGecko.

Forbidden: seeds, private keys, API secrets in the client bundle, gas-wallet addresses, click-into guts pages, lighting every square at once.
