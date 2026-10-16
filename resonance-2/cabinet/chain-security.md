# Cabinet note — Chain Security

Weekly incident feed. Resonance stores the rows. The site does not invent a loss, a date, or a URL.

| Piece | Path | Use |
| --- | --- | --- |
| Table | `chain_security_incidents` (migration `030_chain_security`) | One row per incident. `id` is the slug |
| Read | `GET /api/chain-security` | Owner session or `Authorization: Bearer $RESONANCE_SYNC_SECRET` |
| Write | `POST /api/chain-security` | Bearer only. The same `id` updates that row. A session cookie cannot write |
| Page | `/n/chain-security` | My exposure, then one card per incident |
| Incident | `/n/chain-security/<id>` | Date, chain or bridge, category, cause, loss, status, source |

Categories, in the order the page paints them: `bridge_exploit`, `chain_bug`, `wallet_hardware`, `ai_quantum`.

Loss is one of:

- `loss_low` set and `loss_high` omitted: a single dollar amount
- both set: a low–high range, used when sources disagree
- neither, or `"loss": "not recorded"`: not recorded
- `"loss": "none"`: no loss

`occurred_on` is `YYYY-MM-DD` or null. Null reads as not recorded.

`source_url` is an `http` or `https` URL, or null. Null reads as `source pending`. The server does not look up an article and does not fill in a URL.

`exposures` is a list of `flare-fxrp` and `xrpl`. The My exposure card always names the Flare FXRP bridge and the XRPL. An incident is listed there when its `exposures` include that id, or when the subject names XRPL, the XRP Ledger, FXRP, or Flare.

Public mode keeps the pages and returns `loss` as `hidden`. Dollar fields are omitted. A dollar amount in the cause is stripped before the page or the GET body is sent.

Owner pages. Signed out, the proxy redirects to `/login?next=...`.

Production base: `https://resonance3.vercel.app`.

## Add or update an incident

Posting the same `id` again replaces the row and returns `200`. The first post returns `201`.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/chain-security \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "example-bridge",
    "subject": "Example bridge",
    "category": "bridge_exploit",
    "cause": "What happened.",
    "occurred_on": "2026-10-16",
    "loss_low": 1000000,
    "loss_high": 2000000,
    "status": "active",
    "source_url": null,
    "exposures": []
  }'
```

A single amount omits `loss_high`. No recorded loss omits both. No loss sends `"loss": "none"`.

```bash
curl -sS -X POST https://resonance3.vercel.app/api/chain-security \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "example-bridge",
    "subject": "Example bridge",
    "category": "bridge_exploit",
    "cause": "Patched the next week.",
    "occurred_on": "2026-10-16",
    "loss_low": 1000000,
    "status": "patched",
    "source_url": "https://example.com/incident",
    "exposures": ["xrpl"]
  }'
```

## Read the feed

```bash
curl -sS https://resonance3.vercel.app/api/chain-security \
  -H "Authorization: Bearer $RESONANCE_SYNC_SECRET"
```

The owner session can GET. In public mode that GET sets `loss` to `hidden` and leaves out `loss_low`, `loss_high`, and `loss_kind`.

## Auth

- No Bearer and no owner session on GET: `401`.
- Session cookie on POST: `401`.
- Bearer on POST: the write runs.
- Do not prefix the secret with `NEXT_PUBLIC_`.
