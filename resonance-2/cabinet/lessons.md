# Cabinet note — lessons

The hub keeps the Lessons node current without a deploy. Resonance stores the log. The migration inserts no rows. After this deploys, post `cabinet/lessons-seed.json` (LL-001 through LL-047). LL-042 is past tense: the fill-key fix shipped in #78 and the guarded cleanup shipped in #80.

| Piece | Path | Use |
| --- | --- | --- |
| Seed | `cabinet/lessons-seed.json` | Post-merge payload. LL-042 wording lives here |
| Table | `lessons` (migration `018_lessons`) | One row per lesson. `017` stays free. `019` already shipped |
| Read | `GET /api/lessons` | Owner session or `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Write | `POST /api/lessons` and `PATCH /api/lessons` | Bearer only. A session cookie cannot write |
| Page | `/n/lessons` | Newest first, grouped by month. Tap a row for what changed and why. A lesson with a build item links to `/n/build/<section>` |

`sources` is an array of strings. It is owner-only. Public mode never returns it.

Lessons uses `isPublicMode()` in `src/lib/public-mode-server.ts`, the same server check as the rest of the floor. When it is true, GET and the page keep only `public_safe` rows, drop any row whose text contains a dollar amount, and omit `sources`. LL-021 stays `public_safe: false` and must not render in public mode.

A blank `why` is stored as `Founder's call.` Categories are stored as given, capped at 40 characters. Unknown categories are not rejected.

Text caps: title 160, category 40, what changed 4,000, why 4,000, lesson 4,000, each source 300, at most 20 sources.

Ids look like `LL-001`. `build_item_id` must already exist on `build_items` or be null. `pr_number` is a pull request number or null.

Production base: `https://resonance3.vercel.app`.

## Upsert one lesson

```bash
curl -sS -X POST https://resonance3.vercel.app/api/lessons \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "id": "LL-001",
  "date": "2026-10-09",
  "title": "Drill down one level",
  "category": "floor",
  "what_changed": "Home shows parent cards. Detail lives on the child page.",
  "why": "Founder's call.",
  "lesson": "Keep the floor clean.",
  "public_safe": false,
  "sources": ["cabinet/operator-log.md"],
  "build_item_id": null,
  "pr_number": null
}
JSON
```

`200` returns `{ "ok": true, "lesson": { ... } }`. Posting the same id again updates that row. `created_at` stays. A blank `why` comes back as `Founder's call.`

## Bulk upsert

Send a JSON array, or `{ "lessons": [ ... ] }`. The same id updates in place. A second post does not add rows.

The post-merge seed is the file itself. From `resonance-2`:

```bash
curl -sS -X POST https://resonance3.vercel.app/api/lessons \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d @cabinet/lessons-seed.json
```

```bash
curl -sS -X POST https://resonance3.vercel.app/api/lessons \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "id": "LL-002",
      "date": "2026-10-08",
      "title": "One build per update",
      "category": "build",
      "what_changed": "Production builds only on resonance3.",
      "why": "The preview budget was spent.",
      "lesson": "Verify locally, then push once.",
      "public_safe": true,
      "sources": [],
      "build_item_id": "platform-build-budget",
      "pr_number": 68
    },
    {
      "id": "LL-003",
      "date": "2026-10-07",
      "title": "A second pass on the same id",
      "category": "working",
      "what_changed": "The hub can resend the seed.",
      "lesson": "Upsert by id.",
      "public_safe": false,
      "sources": ["hub seed"]
    }
  ]'
```

`200` returns `{ "ok": true, "upserted": 2, "lessons": [ ... ] }`. One bad row rejects the batch and writes nothing.

## Patch one field

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/lessons \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "LL-002",
    "public_safe": true,
    "lesson": "Verify locally, then push once."
  }'
```

`200` returns the lesson. Other fields stay as stored. An unknown id is `404`.

## Auth

- No Bearer and no session on GET: `401`.
- Session cookie on POST or PATCH: `401`.
- Bearer on POST or PATCH: the write runs.
- Do not prefix the secret with `NEXT_PUBLIC_`.
