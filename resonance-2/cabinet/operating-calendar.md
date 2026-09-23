# Cabinet note — operating calendar

Day itinerary for Resonance 2.0. One event store. Four lanes. No month grid. The homepage floor stays live nodes plus the one `+`.

This brick does **not** sync Google. It does **not** push a phone. It does **not** open a Carla queue. It does **not** invent nodes or write fills.

| Piece | Path | Use |
| --- | --- | --- |
| Store | `resonance-2/calendar.json` / `.data/calendar.json` | Sibling of the fill envelope in the **same** Blob cabinet |
| Auth | `RESONANCE_SYNC_SECRET` | Same Bearer as `POST /api/fills`. No second secret |
| Seed | `src/data/calendar.ts` | Daily Brief + Monday Agentic SUI→6 AI. Build and Gates stay empty |
| Desk | `src/components/calendar-desk.tsx` | `/calendar`. Day default. Week strip. Lane filter |
| Route | `GET` + `POST /api/calendar` | Read is public. Write is Bearer |

## Store choice

Reuse the fill cabinet. Do not open a second Blob store and do not put events inside `resonance-2/fills.json` (that file is fills and sleeve prints only).

Backend pick (same order as fills):

1. `BLOB_READ_WRITE_TOKEN` → private Blob object `resonance-2/calendar.json`
2. else local/dev → `.data/calendar.json` (`RESONANCE_CALENDAR_FILE` overrides the path)
3. Vercel without Blob → the desk still renders the seed in memory (`seed fallback`). `POST` returns **503** until Blob is connected

An empty configured store is seeded once, then left alone. A store that already has rows is not re-seeded.

```ts
{
  version: 1,
  updatedAt: string,
  seededAt: string | null,
  events: CalendarEvent[]
}
```

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

Display and the Daily Brief rhythm use **America/Chicago**. Weekday occurrences are derived on read. They are not copied into the file.

## Who writes what

| Lane | Writer | v1 seed |
| --- | --- | --- |
| Cadence | agent | Daily Brief, weekdays 7:00 AM America/Chicago |
| Capital | agent | Monday 2026-09-21 Agentic SUI→6 AI, status `history`, link `/log?ticker=SUI&from=2026-09-21&to=2026-09-21` |
| Build | agent | empty |
| Gates | founder | empty. `writer: "agent"` is **400** |

The founder may also write cadence, capital, or build (`writer: "founder"`). An agent may not write gates.

## How to add an event

`Authorization: Bearer <RESONANCE_SYNC_SECRET>`

- If the secret is **set**, POST without a matching Bearer is `401`.
- If the secret is **unset** (local/dev only), POST is open.
- GET stays public. It never returns secrets.
- Never prefix the secret with `NEXT_PUBLIC_`. Never put the Bearer token in a Client Component.

Same id + same body → `200` and `"deduped": true` (no second row).

Same id + changed title, start, status, link, note, or recurrence → updates that row (`"updated": true`). Lane and writer stay fixed.

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

GET `/api/calendar` returns the stored rows. `GET /api/calendar?day=2026-09-23` also returns that Chicago day’s occurrences (the weekday brief is expanded there).

## Desk

`/calendar` is the day itinerary. Omit `day` and the desk uses today in America/Chicago.

| Control | Query | Rule |
| --- | --- | --- |
| day | `day` | `YYYY-MM-DD`. Default today. The week strip is Monday–Sunday around that day |
| lane | `lane` | `cadence` \| `capital` \| `build` \| `gates`. Anything else is ignored |
| event | `event` | Opens that row’s detail on the selected day. A `link` jumps to `/log` or an https URL |

Click a row for the detail. Build and Gates render an empty day. They do not get placeholder bricks.

The toolbar Calendar control is a real link, the same way Operator log is. The floor grid is unchanged.

## Forbidden

- A second Blob store, a second secret, or calendar rows inside `fills.json`
- A month view, a homepage calendar widget, or fake Build / Gates items
- Google sync, phone push, or a live Carla queue
- Lighting nodes, writing sleeves, or touching Xaman principal / RH Main
- Putting `RESONANCE_SYNC_SECRET` or `BLOB_READ_WRITE_TOKEN` in the client
- Merging this PR from the agent
