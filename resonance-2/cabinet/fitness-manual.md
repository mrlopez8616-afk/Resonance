# Cabinet note — Fitness manual import

Summaries typed in from an app that does not post on its own. Resonance stores the rows. The site does not invent a figure.

These rows never feed the daily step rows, the run rows, or the steps and runs charts. A week or month figure can use a summary when those days have no day-by-day record. If a day-by-day record covers the same days, that record is kept and the summary is not added again.

| Piece | Path | Use |
| --- | --- | --- |
| Table | `fitness_manual_summaries` (migration `031_fitness_manual_summaries`) | One row per period, app, and metric |
| Read | `GET /api/fitness/manual` | Owner session or `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Write | `POST /api/fitness/manual` | Bearer only. A session cookie cannot write |
| Story | `/n/fitness` | Week and month figures. A summary sits in those figures, tagged manual import |
| Entries | `/n/fitness/manual` | The stored rows, each labeled manual |

The unique key is `(period_start, period_end, app, metric)`. Posting that same entry again updates the row.

`entry_date`, `period_start`, and `period_end` are `YYYY-MM-DD`. `period_end` is on or after `period_start`.

`value` is a number or a decimal string. `unit` is the unit that was written down. `approx` is true when the figure was rounded. Omit it and the row is not approximate.

`note` is optional. `source` defaults to `manual-import`.

The fitness story shows a summary inside the week or month it belongs to, tagged Manual import. An approximate entry is marked `~` and `approx`. The steps and runs charts stay on day-by-day rows and never plot a summary as a daily point. `/n/fitness/manual` still lists the latest period: the greatest `period_end`, then the greatest `period_start`. An empty table says `not recorded`.

GET returns every stored row, newest period first. Public mode strips `$` and dollar amounts from `app`, `metric`, `unit`, `note`, and `source`. A Bearer read is not public mode.

Owner pages. Signed out, the proxy redirects to `/login?next=...`.

Production base: `https://resonance3.vercel.app`.

## Add or update

One entry, or an array. The same period, app, and metric updates that row and returns `200`.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fitness/manual \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_date": "2026-10-12",
    "period_start": "2026-10-06",
    "period_end": "2026-10-12",
    "app": "Strong",
    "metric": "sessions",
    "value": 4,
    "unit": "count"
  }'
```

An array posts several entries for the same period. `approx` marks a rounded figure.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/fitness/manual \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "entry_date": "2026-10-12",
      "period_start": "2026-10-06",
      "period_end": "2026-10-12",
      "app": "Nike Run Club",
      "metric": "distance",
      "value": "12.4",
      "unit": "mi",
      "approx": true,
      "note": "from the weekly recap"
    }
  ]'
```

## Read

```bash
curl -sS https://resonance3.vercel.app/api/fitness/manual \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET"
```

The owner session can GET. In public mode that GET leaves out dollar amounts.

## Auth

- No Bearer and no owner session on GET: `401`.
- Session cookie on POST: `401`.
- The fitness phone token is not this key. POST still needs `RESONANCE_SYNC_SECRET`.
- Bearer on POST: the write runs.
- Do not prefix the secret with `NEXT_PUBLIC_`.
