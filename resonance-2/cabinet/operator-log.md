# Cabinet note — operator log desk

Read brick. One fill store. Same `Fill` card. Ingest is unchanged.

This brick does **not** poll Robinhood or Coinbase. It does **not** light new nodes. It does **not** write sleeves, Flare vault, or a second JSON envelope.

| Piece | Path | Use |
| --- | --- | --- |
| Store | `resonance-2/fills.json` / `.data/fills.json` | Existing envelope. `GET /api/fills` still returns the full list |
| Ingest | `POST /api/fills` | Unchanged. See [`fill-ingest.md`](./fill-ingest.md) |
| Card | `src/components/fill-log.tsx` | Same `FillCard` / `FillLog` |
| Desk | `src/components/fill-desk.tsx` | Filters that list. Does not append |
| Query | `src/lib/fill-desk.ts` | Ticker, date range, sleeve, source |
| Drill-down | live square in `src/components/node-grid.tsx` | Click opens `/log?ticker=THAT`. The `×` still only hides the square |

## Desk

`/log` is the search desk.

| Control | Query | Rule |
| --- | --- | --- |
| ticker | `ticker` | Locked nodes (`BTC ETH SOL XRP SUI FLR PWR ETN VRT GEV CEG HUBB HBAR`), plus a historical fill symbol that is no longer a floor node (`XLM`), plus the bet ticker `UFC`. UFC is not a locked node. Anything else is ignored |
| from / to | `from`, `to` | `YYYY-MM-DD`, inclusive, on the calendar day printed on the card. A reversed range is swapped |
| sleeve | `sleeve` | `rh-main` \| `rh-agentic` \| `coinbase` \| `unset` (seed rows with no sleeve). `flare-vault` is not a fill sleeve and is ignored |
| source | `source` | Venue: `robinhood` \| `coinbase` \| `unset`. Unknown venues are ignored |

Nodes strip: every locked ticker with a non-zero live sleeve quantity, or a fill whose quantity is a non-zero decimal. A zero print (SUI Agentic `0`) does not qualify by itself. Order follows the locked roster. XLM is not a locked node, so its fills do not add a strip block. Each block opens that ticker’s pane. The strip is omitted when none qualify. It is not a time window and it is not a second store.

UFC is a separate tile on that strip when the bets store has rows. The tile shows the settled record and realized P&L and opens `/log?ticker=UFC`. That pane reads the live bets store (record, voids, total staked, realized P&L, open stake and potential return, plus the lean scorecard). Bet rows do not enter sleeve totals and do not add UFC to the floor roster.

`POST /api/bets` appends tickets with the same Bearer as settle. Re-posting an `orderId` is a no-op: the stored row is not rewritten. On read, seed ids missing from `resonance-2/bets.json` are inserted. A row already stored under that id or orderId, including a settled row, is left alone.

A live node click is `GET /log?ticker=<symbol>`. Offline roster tickers are not painted on the homepage, so they have no square to open. The desk can still search a locked ticker that is offline, because ingest may already have logged that transfer.

## Forbidden

- A second fill file, card type, or sleeve id
- Changing `POST /api/fills`, Bearer auth, or Blob path
- Lighting BTC, ETH, SOL, or FLR
- Writing `flare-vault` or putting `RESONANCE_SYNC_SECRET` in the client
- Merging this PR from the agent
