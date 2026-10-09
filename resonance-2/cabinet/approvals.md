# Cabinet note — approvals

Agents raise a request. A signed-in owner records approved or declined. The row is the whole effect. This queue does not move money, place a trade, call a broker, or run a deploy.

Carla is the operator this queue is for. This version does not sign her in. `users.role` may be `operator`, and `decided_by` can store `operator`, but login still accepts only `andres`. A live operator session is dropped. Decisions are owner-only until that login path exists. Do not add spend limits or an automatic action here.

Public mode hides the queue: the page, the phone tab, the toolbar control, and `GET /api/approvals`.

| Piece | Path | Use |
| --- | --- | --- |
| Table | `approvals` (migration `022_approvals`) | One row per request. Inserts nothing |
| Submit | `POST /api/approvals` | Bearer only. Idempotent on `idempotency_key` |
| List | `GET /api/approvals` | Owner session or `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Decide | `POST /api/approvals/<id>/decision` | Owner session, same-origin. Bearer cannot decide. A second decision is 409 |
| Page | `/n/approvals` | Parent. Children are `/n/approvals/pending` and `/n/approvals/done` |

Control Room is still a later queue item, so this is its own parent rather than a child of that page.

Production base: `https://resonance3.vercel.app`.

Text is plain. A field that looks like a secret or a full account number is rejected. That includes private keys, live API keys, tokens, a JSON key such as `password` or `account_number`, 12 or more digits, and a labeled account, routing, or card number. Write amounts in words or short numbers. `detail` is text, not JSON.

Caps: title 160, detail 4,000, agent name 80, node slug 40, idempotency key 8 to 160, note 500.

`category` is `trade`, `transfer`, `build`, or `other`. `node` is an optional slug such as `xrp` or `platform`.

`idempotency_key` is chosen by the agent. Posting the same key again returns the original row and does not change it.

## Submit

```bash
curl -sS -X POST https://resonance3.vercel.app/api/approvals \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "idempotency_key": "floor-desk:thursday-walkthrough",
  "requested_by_agent": "floor-desk",
  "title": "Clear the Thursday walkthrough",
  "detail": "Confirm the room is booked. This request only asks for a yes or no.",
  "category": "other",
  "node": null
}
JSON
```

`200` returns `{ "ok": true, "replay": false, "approval": { ... } }`. The same key returns `"replay": true` and the original approval. A session cookie without the bearer is `401`.

## List

```bash
curl -sS https://resonance3.vercel.app/api/approvals?status=pending \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET"
```

`status` may be `pending`, `done`, `approved`, `declined`, `cancelled`, or omitted for every row. `done` is everything that is no longer pending. Public mode, with the owner session and the public cookie, returns `404` and does not include the rows.

## Decide

The owner session cookie is sent by the browser from `/n/approvals/pending`. The button asks for a confirm step, then posts. `executed` is false. Nothing else runs.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/approvals/appr_example/decision \
  -H "Content-Type: application/json" \
  -H "Origin: https://resonance3.vercel.app" \
  -H "Cookie: __Host-resonance_session=$SESSION_COOKIE" \
  -d '{"decision":"approved","note":"Cleared for the work window."}'
```

`decision` is `approved` or `declined`. `note` is optional. `200` returns `{ "ok": true, "executed": false, "approval": { ... } }`.

A second post for the same id returns `409`. A bearer token, with or without the session cookie, returns `401`. A signed-out page visit redirects to login (`307`). A signed-out list or decision returns `401`.
