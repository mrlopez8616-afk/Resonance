# Factorio uploader

The `resonance-bridge` mod writes a JSON snapshot about every 5 minutes. A small script on the Windows PC posts that file here. The site stores one row per game tick. Posting the same tick again replaces that row. A later tick is kept, so `/n/factorio` can chart rockets and hours.

Generate the token on [https://resonance3.vercel.app/settings/integrations](https://resonance3.vercel.app/settings/integrations). It is shown once. Only a sha256 digest is stored. Rotating it replaces the previous token.

## Request

```
POST https://resonance3.vercel.app/api/ingest/factorio
X-Factorio-Token: <token from /settings/integrations>
Content-Type: application/json
```

The body is the bridge JSON. A missing or wrong token returns 401. The sync secret and the Health Auto Export token are not accepted.

## Body

| Field | Use |
| --- | --- |
| `tick` | Whole number. The dedupe key. |
| `play_hours` | Hours in this save. |
| `players` | `name`, `connected`, `online_hours`, `afk_minutes`. A connected player makes a snapshot older than 30 minutes stale. |
| `force.rockets_launched` | Whole number. |
| `force.technologies_researched` | Whole number. |
| `force.current_research` | Internal name, such as `worker-robots-speed-6`. |
| `force.research_progress` | Fraction from 0 to 1. |
| `production` | Up to 15 items. Each item is `name` and `per_min`. |
| `consumption` | Same shape as production. Stored with the snapshot. |
| `science_produced` | Totals by science pack name. |
| `machines` | Counts by machine name. |
| `timestamp`, `reason`, `source`, `version`, `surfaces` | Optional. `source` is usually `resonance-bridge`. |

A successful post returns `{ "ok": true, "tick": 51210000 }`.
