# Recording pipeline (doctrine)

Founder-locked. Phase Zero implements the Web2 record book and import/merge. **Phase 0.5** adds a Hedera **Testnet** wiring test for chain-class Decisions, then an optional **XRPL Testnet** dust-memo mirror pointer. Still no Mainnet, no Xaman-principal signing, no seed phrases in the repo.

1. **Web2 mimics on-chain now.** Every serious event must already look like a chain-class record: proposed, why, who authorized, outcome (queued ≠ filled), receipt, plus timestamps (`date`, `createdAt`). The Decisions schema is that shape. `fingerprint` is the hash of the public record when a row is attested; sensitive details stay off-chain.

2. **Sensor path (future).** Raw anomalies log to Web2 immediately (`web2_only` / `pending_operator_ack`). They become a chain-class commit only after an operator views and acks them — a record viewer plus time with the beep trail. Do not auto-promote sensor noise to the durable book or to Hedera.

3. **Channel vs gate.** The public channel teaches the OS. Private amounts stay gated (site lock, local books). Public teaching copy must not leak sized balances or receipts that belong behind the gate.

4. **Engineer handoff.** The shared Decision store (`GET/POST/PATCH /api/decisions`, Vercel Blob) is the Phase Zero hub bridge. JSON import/export remains the fallback. XRPL Testnet now stores a **pointer** (`xrplTxHash`) on this same schema — not a second database. Do not invent a second schema for chain. Setup: [`decision-sync.md`](./decision-sync.md).

5. **Playbook pointer.** Overnight Web2 mimic (treasury trail, record-book fields, Robinhood Main vs Agentic) is documented in [`overnight-build.md`](./overnight-build.md) and in-app at **What changed**. That work does not start Mainnet writes.

6. **Hedera witness (Phase 0.5 Testnet).** Hedera Hashgraph is the primary attestation path. Decision rows carry `attestationStatus` (`web2_only` → `pending_operator_ack` → `hashgraph_queued` → `hashgraph_attested`) plus `hederaMessageId` / `attestedAt` / `fingerprint`. Promotion rules and founder env setup: [`hedera-attestation.md`](./hedera-attestation.md). Live submit uses `@hashgraph/sdk` on the server with `HEDERA_OPERATOR_KEY` — never `NEXT_PUBLIC_*`, never logged. The HCS memo is `{ v, decisionId, fingerprint, attestedAt }` only. No dollar amounts. Xaman principal / Main RH never in the public memo. Sensor beeps still need operator ack.

7. **XRPL payment-rail mirror (Phase 0.5 Testnet).** After Hedera attest, a fee-only AccountSet can store ASCII memo `R1|id=…|h=…|fp=…|net=testnet` on a **separate Testnet dust wallet** (`POST /api/xrpl-mirror`, **Mirror on XRPL Testnet**). Fields: `xrplTxHash` / `xrplMemoAt`. Not a second database. Mainnet rejected. `XRPL_SEED` is server-only — never `NEXT_PUBLIC_*`, never paste it into chat. Founder steps: [`xrpl-mirror.md`](./xrpl-mirror.md).

8. **Channel vs gate (dual surface).** Private board keeps dollars and exact XRP. Public skeleton (`/public`) publishes node target % only. [`public-vs-private.md`](./public-vs-private.md).

Not in this phase: sensors, ack viewer, beep trail, Mainnet, Xaman-principal writes, or seed phrases. The shared Web2 Decision store is in. Testnet Hedera attest and XRPL mirror are opt-in via env.
