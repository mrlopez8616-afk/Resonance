# Cabinet note — operating calendar

Day itinerary for Resonance 2.0, plus a week board and a month grid. One event store. Four lanes. Catalysts sit beside the lanes. They do not replace them. The homepage floor stays live nodes plus the one `+`.

This brick does **not** sync Google. It does **not** push a phone. It does **not** open a Carla queue. It does **not** invent nodes or write fills.

| Piece | Path | Use |
| --- | --- | --- |
| Store | `resonance-2/calendar.json` / `.data/calendar.json` | Sibling of the fill envelope in the **same** Blob cabinet |
| Auth | `RESONANCE_SYNC_SECRET` | Same Bearer as `POST /api/fills`. No second secret |
| Lane seed | `src/data/calendar.ts` | Daily Brief rhythm + Monday Agentic SUI→6 AI |
| Catalyst seed | `src/data/catalyst-events.json` | 34 verified catalysts. Mapped by `src/data/catalyst-seed.ts` |
| Desk | `src/components/calendar-desk.tsx` | `/calendar`. Day default. Week board. Month grid |
| Route | `GET` + `POST /api/calendar` | Read is public. Write is Bearer |
| Cadence writer | `npm run calendar:brief` | `scripts/post-daily-brief.ts` |
| Capital writer | `POST /api/fills` | Also upserts a Capital row. Fill ingest still succeeds if that write fails |
| Build writer | `.github/workflows/calendar-build.yml` | Pull request opened / ready / merged |

## Store choice

Reuse the fill cabinet. Do not open a second Blob store and do not put events inside `resonance-2/fills.json` (that file is fills and sleeve prints only).

Backend pick (same order as fills):

1. `BLOB_READ_WRITE_TOKEN` → private Blob object `resonance-2/calendar.json`
2. else local/dev → `.data/calendar.json` (`RESONANCE_CALENDAR_FILE` overrides the path)
3. Vercel without Blob → the desk still renders the seed in memory (`seed fallback`). `POST` returns **503** until Blob is connected

On each read, the committed catalog is upserted by id. A matching id with the same body is a no-op. A matching id with a changed body updates that row. Rows the catalog does not own (a posted Daily Brief, a fill, a pull request) stay. Re-seeding does not duplicate.

```ts
{
  version: 1,
  updatedAt: string,
  seededAt: string | null,
  events: CalendarEvent[]
}
```

Lane row:

```ts
{
  id,            // lowercase slug, idempotency key
  lane,          // cadence | capital | build | gates
  start,         // ISO-8601 with offset or Z
  title,
  status,        // scheduled | history | pending | awaiting | merged | open
  writer,        // agent | founder
  link?,         // site path (/log?…) or https URL
  note?,
  recurrence?    // cadence only: weekdays at HH:mm America/Chicago
}
```

Catalyst row (`kind: "catalyst"`). No `lane`.

```ts
{
  id,
  kind: "catalyst",
  node,            // XRP | SUI | FLR | PWR | ETN | VRT | GEV | CEG | HUBB | MACRO
  start,           // ISO-8601. Midnight Chicago when the source has no clock (`allDay`)
  end?,            // inclusive civil YYYY-MM-DD
  title,
  status,          // confirmed | tentative
  writer,          // agent | founder
  sourceUrl,       // required https URL. POST alias: source_url
  note?,
  location?,
  datePrecision?,  // day | window | month. POST alias: date_precision
  allDay?          // true when the source has no clock
}
```

`datePrecision: "month"` is a month-level item. It is not painted on a fake day. `window` spans the civil range and is labeled Window. A multi-day row with no precision (or `day`) appears on each civil day from `start` through `end`.

Display and the Daily Brief rhythm use **America/Chicago**. The standing weekday brief is derived on read. It is not copied into the file. A posted row `cadence-daily-brief-YYYY-MM-DD` replaces that day's rhythm row so the itinerary shows one brief.

## Who writes what

| Lane / type | Writer | Seed |
| --- | --- | --- |
| Cadence | agent | Standing Daily Brief, weekdays 7:00 AM America/Chicago. A concrete weekday row is posted by the brief |
| Capital | agent | Monday 2026-09-21 Agentic SUI→6 AI, status `history`, link `/log?ticker=SUI&from=2026-09-21&to=2026-09-21`. New RH / Coinbase fills upsert another Capital row |
| Build | agent | empty until a pull request posts |
| Gates | founder | empty. `writer: "agent"` is **400** |
| Catalyst | agent | 34 rows from `catalyst-events.json`. Node is one of the ten above |

The founder may also write cadence, capital, build, or a catalyst (`writer: "founder"`). An agent may not write gates.

## How to add an event

`Authorization: Bearer <RESONANCE_SYNC_SECRET>`

- If the secret is **set**, POST without a matching Bearer is `401`.
- If the secret is **unset** (local/dev only), POST is open.
- GET stays public. It never returns secrets.
- Never prefix the secret with `NEXT_PUBLIC_`. Never put the Bearer token in a Client Component.

Same id + same body → `200` and `"deduped": true` (no second row).

Same id + changed title, start, status, link, note, recurrence, source, end, or precision → updates that row (`"updated": true`). Lane, kind, node, and writer stay fixed.

```bash
curl -X POST https://resonance3.vercel.app/api/calendar \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "build-operating-calendar",
    "lane": "build",
    "writer": "agent",
    "start": "2026-09-24T09:00:00-05:00",
    "title": "Operating calendar",
    "status": "awaiting"
  }'
```

Founder gate:

```bash
curl -X POST https://resonance3.vercel.app/api/calendar \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gates-example",
    "lane": "gates",
    "writer": "founder",
    "start": "2026-09-24T15:00:00-05:00",
    "title": "Founder approval",
    "status": "open"
  }'
```

`{ "event": { ... } }` is accepted, same as fill ingest wraps `{ "fill": { ... } }`.

GET `/api/calendar` returns the stored rows. `GET /api/calendar?day=2026-09-23` also returns that Chicago day’s occurrences (the weekday brief is expanded there). Month-precision catalysts are stored and returned in `events`. They are omitted from `occurrences` so a month item is not a fake day.

## Lane writers

All three use `POST /api/calendar` with the same Bearer. None of them write Gates.

### Cadence — Daily Brief

The brief runs outside this repo. Once each weekday it POSTs:

```bash
curl -X POST https://resonance3.vercel.app/api/calendar \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "cadence-daily-brief-2026-09-25",
    "lane": "cadence",
    "writer": "agent",
    "start": "2026-09-25T07:00:00-05:00",
    "title": "Daily Brief",
    "status": "scheduled"
  }'
```

`start` is 07:00 America/Chicago. September is `-05:00`. January is `-06:00`. From this repo the helper applies the offset:

```bash
cd resonance-2
RESONANCE_SYNC_SECRET=... npm run calendar:brief -- 2026-09-25
RESONANCE_SYNC_SECRET=... npm run calendar:brief -- 2026-09-25 --note "Desk note" --link https://example.com/brief
```

Omit the date and the helper uses today in America/Chicago. Weekends exit with an error. `CALENDAR_URL` overrides the host (default `https://resonance3.vercel.app/api/calendar`).

### Capital — fill ingest

`POST /api/fills` still writes only `resonance-2/fills.json`. After a successful ingest (including a deduped retry) it also upserts a Capital calendar row:

| Field | Value |
| --- | --- |
| id | `capital-fill-` + the fill idempotency key, lowercased, non-alphanumerics turned into hyphens, cut at 80 characters |
| lane | `capital` |
| status | `history` |
| link | `/log?ticker=…&from=YYYY-MM-DD&to=YYYY-MM-DD` using the printed fill day |
| title | `{TICKER} {side} {qty}` |

If the calendar write fails, the fill response stays successful. Fills are not rolled back.

### Build — pull requests

`.github/workflows/calendar-build.yml` runs on `pull_request` `opened`, `ready_for_review`, `reopened`, and `closed` for this repository. It POSTs id `build-pr-<number>`.

| Action | Status |
| --- | --- |
| opened, reopened | `pending` |
| ready_for_review | `awaiting` |
| closed and merged | `merged` |
| closed and not merged | `history` |

`start` stays the pull request `created_at`. `link` is the pull request URL.

**Repository secret to add** (Actions, not Vercel, not the client): `RESONANCE_SYNC_SECRET`, the same value already set on the Vercel project `resonance3`. No second name. Until that secret exists, the workflow exits before it calls the calendar.

## Desk

`/calendar` opens on today in America/Chicago. Day is the default.

| Control | Query | Rule |
| --- | --- | --- |
| view | `view` | `day` (default) \| `week` \| `month`. Anything else is day |
| day | `day` | `YYYY-MM-DD`. Default today. Anchors the week and the month |
| lane | `lane` | `cadence` \| `capital` \| `build` \| `gates`. Anything else is ignored |
| node | `node` | `XRP` \| `SUI` \| `FLR` \| `PWR` \| `ETN` \| `VRT` \| `GEV` \| `CEG` \| `HUBB` \| `MACRO`. Anything else is ignored |
| event | `event` | Opens that row’s detail. A `link` jumps to `/log` or an https URL. `sourceUrl` is the catalyst source link |

Day keeps the week strip and the itinerary. Week lists the seven days. Month is a Monday-start grid. A day square opens that day’s itinerary. Chips are the node (or a short lane mark). Tentative chips are dashed. A month-precision catalyst is a “This month” row, not a chip on the 1st.

A lane filter hides catalysts. A node filter hides lane rows. Both filters together show the intersection.

The toolbar Calendar control is a real link, the same way Operator log is. The floor grid is unchanged.

## Forbidden

- A second Blob store, a second secret, or calendar rows inside `fills.json`
- A homepage calendar widget, or fake Build / Gates items
- A catalyst node outside the ten, or an event that is not in `catalyst-events.json` for the seed
- Google sync, phone push, or a live Carla queue
- Lighting nodes, writing sleeves, or touching Xaman principal / RH Main
- Putting `RESONANCE_SYNC_SECRET` or `BLOB_READ_WRITE_TOKEN` in the client
- Merging this PR from the agent
