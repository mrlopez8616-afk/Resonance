# Hedera attestation (doctrine)

Founder-locked: **Hedera Hashgraph** is the primary attestation / hashgraph witness for Resonance.

Phase Zero shipped the schema only. **Phase 0.5** is a **Testnet wiring test**: the hub or the Decisions page can submit a public fingerprint to Hedera Consensus Service (HCS) and write the witness ids back into the shared Decision store. After that, an optional **XRPL Testnet dust-memo** can store a payment-rail pointer (schema R1) — not a second database. Mainnet stays later. Setup: [`xrpl-mirror.md`](./xrpl-mirror.md).

Schema: `attestationStatus`, `hederaMessageId` (topic/sequence or tx id), `attestedAt` (timestamp), `fingerprint` (SHA-256 of the public record).

## Status ladder (Decision fields)

| Status | Meaning |
| --- | --- |
| `web2_only` | Default. Record exists only in the Web2 book. |
| `pending_operator_ack` | Sensor / raw event logged in Web2. Not eligible for Hedera until an operator views and acks. |
| `hashgraph_queued` | Chain-class decision, operator-acked, waiting for a Hedera submit. |
| `hashgraph_attested` | Witnessed. Fill `hederaMessageId` + `attestedAt`. Public view may show the attestation link. |

`fingerprint` is the hash of the **public** record. Sensitive amounts stay off-chain / off-memo.

## Promotion rules (unchanged)

1. **Sensor beeps stay Web2** (`web2_only` or `pending_operator_ack`) until an operator views and acks. Do not auto-promote the beep trail.
2. **Chain-class Decisions** (proposal, why, who authorized, outcome queued ≠ filled, receipt) are eligible for Hedera after that ack → `hashgraph_queued` then `hashgraph_attested`. The Attest button is the operator action for rows already decided or superseded in the book.
3. **Public view** (`/public`) shows attestation status, reserved memo hash / timestamp (Hedera id when live), **not dollar amounts**.
4. Main Robinhood lots and Xaman principal never appear in a public memo. The HCS payload is only `{ v, decisionId, fingerprint, attestedAt }`.

The **Attest (Hedera Testnet)** button on `/decisions/[id]` is the live HCS submit (`POST /api/attest`). Operator view-ack (sensor beeps, no Hedera) is a separate `POST /api/ack`. After a row is `hashgraph_attested`, **Mirror on XRPL Testnet** (`POST /api/xrpl-mirror`) is the follow-on payment-rail pointer. Hedera attest is unchanged.

## Phase 0.5 Testnet wiring (founder steps)

Do this in the Vercel project → **Settings → Environment Variables**. Then **redeploy**.

| Variable | Required? | What it is |
| --- | --- | --- |
| `HEDERA_NETWORK` | No | `testnet` (default). Mainnet is rejected. |
| `HEDERA_OPERATOR_ID` | No | Testnet account. Default / example: `0.0.10506907`. |
| `HEDERA_OPERATOR_KEY` | Yes for live submit | Testnet **private key** (DER or hex). Server-only. |
| `HEDERA_TOPIC_ID` | No | HCS topic `0.0.x`. If missing, the first successful Attest creates one. Copy that id back here. |

**Never** prefix these with `NEXT_PUBLIC_`. **Never** paste `HEDERA_OPERATOR_KEY` into chat, Grok, a ticket, or the repo. The key is not logged.

Check:

```bash
curl -s https://YOUR-APP.vercel.app/api/health
```

You want `"hedera": { "configured": true, "network": "testnet", ... }`. That payload never includes keys.

Then unlock the site, open **Decisions**, and click **Attest (Hedera Testnet)** on a decided or superseded row. Or:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/attest \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-04"}'
```

Auth is the same as Decision writes: Bearer `RESONANCE_SYNC_SECRET` or the site password cookie. No open public attest.

If the operator key is unset, the app still deploys. Health shows `configured: false`. Live submit returns **503** with setup steps. Wiring fallback (no SDK):

```bash
curl -X POST https://YOUR-APP.vercel.app/api/attest \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-04","hederaMessageId":"0.0.x/1"}'
```

That marks the row `hashgraph_attested` and stores the message id you already have from HashScan.

After the first live topic create, save `HEDERA_TOPIC_ID` so later attests reuse the same topic. Health and the attest response both return the topic id.

## What the memo contains

Public fingerprint fields: id, date, question, status, decision text, who authorized, attestation ladder (`chain_class`). Dollar sizes and unit prints are redacted before hashing. **Omitted:** outcome, evidence, rationale, proposal, options — those can carry ticket sizes.

HCS message (preferred witness): `TopicMessageSubmitTransaction` / ConsensusSubmitMessage with JSON `{ "v": 1, "decisionId", "fingerprint", "attestedAt" }`. No amounts. No Xaman address. No Main RH lots.

The XRPL follow-on is a 1-drop self-payment whose memo is `R1|id=…|h=…|fp=…|net=testnet` only. Same purity rule. Separate Testnet dust wallet — never the Xaman principal seed. [`xrpl-mirror.md`](./xrpl-mirror.md).
