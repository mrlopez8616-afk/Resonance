# Cabinet note — Brick Tracker

Each build item is a possible episode. Resonance reads the title from `build_items` and the lesson from `lessons`. This table stores only the episode overlay. It does not copy either one.

A missing overlay reads as `idea`. The hub sets status here. The site does not guess a status.

This migration does not add a Build Tracker row. Items after the original `016_build_items` seed are posted with `POST /api/build/items`. Migration `023_factory_floor` is the one later insert: the Factory Floor row.

| Piece | Path | Use |
| --- | --- | --- |
| Table | `youtube_brick_episodes` (migration `024_youtube_bricks`) | `brick_id`, `status`, optional `video_url`, optional `note`. Inserts nothing. `023_factory_floor` stays the Factory Floor wall |
| Read | `GET /api/youtube/bricks` | Owner session only. A Bearer token cannot read |
| Write | `POST /api/youtube/bricks` and `PATCH /api/youtube/bricks` | Bearer only. A session cookie cannot write |
| List | `/n/youtube/bricks` | One row per build item. Tap a row for the detail |
| Detail | `/n/youtube/bricks/<id>` | Back goes to the list. Phone nav breadcrumbs go up one level |

`status` is `idea`, `scripted`, `filmed`, or `posted`.

The lesson link is `lessons.build_item_id`. That is the only link. The same title, or the same pull request number, does not attach a lesson. When nothing links, the row says `no lesson linked`. If several lessons point at one build item, the newest date wins. Public mode keeps a lesson only when `public_safe` is true and the text has no dollar amount. An older public lesson can still show when a newer one is private.

The summary is that lesson's text, or the build item title when the lesson is not public-safe. Public mode strips dollar amounts, drops private lessons, and drops anything that looks like a secret. `sources` is never returned.

`video_url` is an `https` link or null. `note` is plain text, at most 500 characters, or null. A field that looks like a secret or a full account number is rejected.

`brick_id` must already exist on `build_items`. Unknown fields are rejected, including `title`.

Production base: `https://resonance3.vercel.app`.

## Set status

```bash
curl -sS -X POST https://resonance3.vercel.app/api/youtube/bricks \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "brick_id": "platform-pwa",
  "status": "scripted",
  "video_url": "https://www.youtube.com/watch?v=abcdefghijk",
  "note": "Open on the gear shot."
}
JSON
```

`200` returns `{ "ok": true, "episode": { "brick_id", "status", "video_url", "note", "updated_at" } }`. Posting the same id again updates that overlay. It does not add a row. Leave `video_url` or `note` out to keep the stored value. Send `null` to clear one.

## Change one field

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/youtube/bricks \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"brick_id":"platform-pwa","status":"filmed"}'
```

`200` returns the overlay. Other fields stay as stored. An unknown build item is `404`. A missing overlay starts at `idea` when the patch does not send a status.

## Read

The owner session cookie is sent by the browser. Public mode, with that session and the public cookie, returns the same rows with private lessons removed and dollar amounts stripped.

```bash
curl -sS https://resonance3.vercel.app/api/youtube/bricks \
  -H "Cookie: __Host-resonance_session=$SESSION_COOKIE"
```

`200` returns `{ "ok": true, "public": false, "count": 24, "bricks": [ ... ] }`. `title` is the current `build_items` title. It is not stored on the overlay.

## Auth

- Signed-out page visit: `307` to `/login?next=...`.
- No session on GET: `401`.
- Bearer on GET: `401`.
- Session cookie on POST or PATCH: `401`.
- Bearer on POST or PATCH: the write runs.
- Do not prefix the secret with `NEXT_PUBLIC_`.
