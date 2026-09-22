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
| ticker | `ticker` | Locked 12 only (`BTC ETH SOL XRP SUI FLR PWR ETN VRT GEV CEG HUBB`). Anything else is ignored |
| from / to | `from`, `to` | `YYYY-MM-DD`, inclusive, on the calendar day printed on the card. A reversed range is swapped |
| sleeve | `sleeve` | `rh-main` \| `rh-agentic` \| `coinbase` \| `unset` (seed rows with no sleeve). `flare-vault` is not a fill sleeve and is ignored |
| source | `source` | Venue: `robinhood` \| `coinbase` \| `unset`. Unknown venues are ignored |

Nodes strip: every locked ticker with a non-zero live sleeve quantity, or a fill whose quantity is a non-zero decimal. A zero print (SUI Agentic `0`) does not qualify by itself. Order follows the locked 12. Each block opens that ticker’s pane. The strip is omitted when none qualify. It is not a time window and it is not a second store.

A live node click is `GET /log?ticker=<symbol>`. Offline squares do not open a pane. The desk can still search a locked ticker that is offline on the floor, because ingest may already have logged that transfer.

## Forbidden

- A second fill file, card type, or sleeve id
- Changing `POST /api/fills`, Bearer auth, or Blob path
- Lighting BTC, ETH, SOL, or FLR
- Writing `flare-vault` or putting `RESONANCE_SYNC_SECRET` in the client
- Merging this PR from the agent
