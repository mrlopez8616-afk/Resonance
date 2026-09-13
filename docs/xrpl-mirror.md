# XRPL Testnet dust-memo mirror (doctrine)

Founder-locked: **Hedera Hashgraph** is the governance / hashgraph witness. **XRPL** is only a **payment-rail mirror pointer** — not a second full database.

Phase 0.5 practices the same sequence as Hedera: **Testnet first**. Mainnet is rejected.

The dust wallet is **not** the Xaman principal. Separate Testnet wallet. Never paste `XRPL_SEED` into chat, Grok, a ticket, or the repo.

## What gets written on XRPL

A fee-only **AccountSet** on the Testnet dust account (no Destination, no transfer — XRPL rejects Payment-to-self as `temREDUNDANT`) whose `MemoData` is ASCII schema **R1**:

```
R1|id=<decisionId>|h=<hederaMessageId>|fp=<fingerprintPrefix16>|net=testnet
```

Example:

```
R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=abababababababab|net=testnet
```

**Never** in the memo: amounts, outcomes, evidence, vault addresses, seeds, Xaman principal, Main RH lots.

Hedera already has the public fingerprint. XRPL only points at that witness.

## When you can mirror

1. The Decision is **decided** or **superseded**.
2. You already clicked **Attest (Hedera Testnet)** (or recorded a HashScan id). The row is `hashgraph_attested` and has `hederaMessageId` + `fingerprint`.
3. Then click **Mirror on XRPL Testnet** on the same file page, or POST `/api/xrpl-mirror`.

Hedera attest does **not** change. Mirror is a follow-on.

## Phase 0.5 Testnet wiring (founder steps)

Do this in the Vercel project → **Settings → Environment Variables**. Then **redeploy**.

| Variable | Required? | What it is |
| --- | --- | --- |
| `XRPL_NETWORK` | No | `testnet` (default). Mainnet is rejected. |
| `XRPL_ACCOUNT` | No | Classic r-address. Default / example: `r4oZhE86dHD4kj1BJWdfmt1xfPNrn6xxd7`. |
| `XRPL_SEED` | Yes for live submit | Family seed for **that Testnet dust wallet only**. Server-only. |
| `XRPL_WS_URL` | No | Testnet websocket. Default: `wss://s.altnet.rippletest.net:51233`. |

**Never** prefix these with `NEXT_PUBLIC_`. **Never** paste `XRPL_SEED` into chat. The seed is not logged. Health never returns it.

This wallet is a **Testnet recorder**. It is not the Xaman treasury and not a watch-only address you would put in Settings.

Check:

```bash
curl -s https://YOUR-APP.vercel.app/api/health
```

You want `"xrpl": { "configured": true, "network": "testnet", "account": "r4o…" }`. No seed in that JSON.

If `XRPL_SEED` is unset, the app still deploys. Health shows `configured: false`. Live mirror returns **503** with setup steps.

Then unlock the site, open a row that is already **hashgraph attested** (for example D-04), and click **Mirror on XRPL Testnet**. Or:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/xrpl-mirror \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-04"}'
```

Auth is the same as Decision writes / Hedera attest: Bearer `RESONANCE_SYNC_SECRET` or the site password cookie. No open public mirror.

Wiring fallback (no seed — you already have a Testnet tx hash from testnet.xrpl.org):

```bash
curl -X POST https://YOUR-APP.vercel.app/api/xrpl-mirror \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"D-2026-09-11-04","xrplTxHash":"<64-char-testnet-hash>"}'
```

That stores `xrplTxHash` + `xrplMemoAt` on the Decision. The file page links to `https://testnet.xrpl.org/transactions/<hash>`.

## Schema

Decision fields added: `xrplTxHash`, `xrplMemoAt`. Public view may show the Testnet explorer link. Private amounts stay gated.

See also [`hedera-attestation.md`](./hedera-attestation.md) and [`recording-pipeline.md`](./recording-pipeline.md).
