# Cabinet note — broker read sync

The floor reads Coinbase and Robinhood on a schedule. The read does not place an order, cancel an order, or transfer funds. Approved fills still arrive through `POST /api/fills` ([`fill-ingest.md`](./fill-ingest.md)).

## Schedule

Vercel Cron calls `GET /api/cron/brokers` three times a day. Hobby cron is one UTC hour per job, and the job may start any time in that hour.

| UTC | Central |
| --- | --- |
| `0 14 * * *` | about 8 AM CT (8:00–8:59 AM CST, 9:00–9:59 AM CDT) |
| `0 19 * * *` | about 1 PM CT (1:00–1:59 PM CST, 2:00–2:59 PM CDT) |
| `0 1 * * *` | about 7 PM CT (7:00–7:59 PM CST, 8:00–8:59 PM CDT) |

The route accepts `Authorization: Bearer <CRON_SECRET>` or the sync secret. `CRON_SECRET` is already set on project `resonance3`. A manual run uses the same Bearer on `POST /api/cron/brokers`.

## What a successful read stores

Postgres tables from migration `049_broker_sync`:

| Table | What it holds |
| --- | --- |
| `broker_sync_state` | Last status, last success time, and a short message |
| `broker_positions` | Sleeve quantities from that read |
| `broker_balances` | Cash from that read |
| `broker_orders` | The recent orders or fills page |

The node pages use those quantities for sleeves the book already has. The Flare vault, RH Main, and any manual sleeve are left alone. A ticker that is not already on a book is not added.

A read that fails keeps the last good quantities and marks the node stale. A success older than 24 hours is stale. Not configured is a separate state: the sleeve prints from fills stay, and the node says not configured.

The cron JSON is status, stale, and the last success time. It does not include quantities, prices, or cash. Cash is shown on the private Crypto page only. Public view does not render the sync note.

## Coinbase

Uses `COINBASE_API_KEY_NAME` and `COINBASE_API_KEY_SECRET`, the same names as the SUI portfolio read. Both are unset on `resonance3` today.

The key is created at the Coinbase Developer Platform. Enable view permission only. Do not enable trade or transfer. The sync calls these GET paths:

- `/api/v3/brokerage/portfolios`
- `/api/v3/brokerage/portfolios/{uuid}`
- `/api/v3/brokerage/accounts?limit=250`
- `/api/v3/brokerage/orders/historical/fills?limit=50`

Default-portfolio SUI updates the `coinbase` sleeve. Agentic-portfolio SUI and XRP update `cb-agentic`. The closed XRP Default lot is not a sleeve.

## Robinhood

Robinhood has no read key on `resonance3`. The official crypto API can supply one. Stock positions cannot.

Crypto, when both of these are set:

| Variable | Where it comes from |
| --- | --- |
| `ROBINHOOD_API_KEY` | Web classic → crypto account settings → Add key. The id looks like `rh-api-…` |
| `ROBINHOOD_API_PRIVATE_KEY` | The base64 Ed25519 seed from that same step. Robinhood keeps the public key |

Enable only Read crypto accounts, Read crypto holdings, and Read crypto orders. Do not enable placing or canceling orders.

The sync calls these GET paths on `https://trading.robinhood.com`:

- `/api/v1/crypto/trading/accounts/`
- `/api/v1/crypto/trading/holdings/`
- `/api/v1/crypto/trading/orders/?limit=50`

XRP, SUI, and HBAR on that read update `rh-agentic`. Other assets are ignored.

Stock positions (the AI Stocks books, including Robinhood Agentic equities) stay not configured. Robinhood's public API key does not return equity positions, and this server does not store a trading token to reach them. The AI Stocks page says `Agentic trader · Robinhood stocks not configured`. Sleeve prints from posted fills stay in place.

## Nodes

Crypto and AI Stocks show the last sync on the private parent page and on each child card. The Agentic trader line is that same read: Coinbase Agentic follows the Coinbase sync, Robinhood Agentic crypto follows the crypto key, and Robinhood Agentic shares stay not configured. The system map lists both bridges as scheduled reads.
