# Cabinet note — build tracker

The hub keeps the Build node current without a deploy. Resonance stores the checklist. Percent is the share of steps marked done. The site does not guess a percent.

| Piece | Path | Use |
| --- | --- | --- |
| Table | `build_items` (migration `016_build_items`) | One row per item. `steps` is a JSON checklist |
| Read | `GET /api/build/items` | Owner session or `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Write | `POST /api/build/items` and `PATCH /api/build/items` | Bearer only. A session cookie cannot write |
| Page | `/n/build` | Groups by node. Live items older than 7 days sit under Shipped |

`GITHUB_TOKEN` is optional and server-only. It is never sent to the browser. Pull state is cached for about 10 minutes. If GitHub is rate-limited, the page keeps the last stored steps.

Nodes: `crypto`, `ai-stocks`, `fitness`, `finance`, `fight-desk`, `platform`, `youtube`.

Status: `live`, `in_progress` (or `in progress`), `queued`, `blocked`.

A new item with no `steps` gets the standard ladder, all undone: spec written, PR open, local tests and build pass, merged, verified on prod. Each step is an equal share. Add a custom step by id when the work needs one.

Production base: `https://resonance3.vercel.app`.

## Add a queued item

```bash
curl -sS -X POST https://resonance3.vercel.app/api/build/items \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "platform-example",
    "title": "Example queued item",
    "node": "platform",
    "status": "queued",
    "next_step": "Write the spec"
  }'
```

`201` returns the item. `percent` is `0` until a step is done. Posting the same id again is `409`.

## Update next_step

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/build/items \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "platform-system-map",
    "next_step": "Starts after Build Tracker merges"
  }'
```

## Mark a step done

Send the step id. Other steps stay as they are. This marks the custom founder step on Runs tracking:

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/build/items \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "fitness-runs",
    "steps": [{ "id": "founder-shortcut", "done": true }]
  }'
```

A new step needs a label:

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/build/items \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "finance-private-node",
    "steps": [{ "id": "first-snapshot", "done": true }]
  }'
```

Verified on prod is set this way, after the builder's post-deploy checks:

```bash
curl -sS -X PATCH https://resonance3.vercel.app/api/build/items \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "platform-build-tracker",
    "steps": [{ "id": "verified-prod", "done": true }]
  }'
```

## Auth

- No Bearer and no session on GET: `401`.
- Session cookie on POST or PATCH: `401`.
- Bearer on POST or PATCH: the write runs.
- Do not prefix the secret with `NEXT_PUBLIC_`.
