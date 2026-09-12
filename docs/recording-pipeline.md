# Recording pipeline (doctrine)

Founder-locked for later phases. Phase Zero implements the Web2 record book and import/merge only. No chain writes, no wallet signing, no private keys.

1. **Web2 mimics on-chain now.** Every serious event must already look like a chain-class record: proposed, why, who authorized, outcome (queued ≠ filled), receipt, plus timestamps (`date`, `createdAt`). The Decisions schema is that shape. `fingerprint` is reserved for a later hash of the public record; sensitive details stay off-chain.

2. **Sensor path (future).** Raw anomalies log to Web2 immediately (`web2_only` / `pending_operator_ack`). They become a chain-class commit only after an operator views and acks them — a record viewer plus time with the beep trail. Do not auto-promote sensor noise to the durable book or to Hedera.

3. **Channel vs gate.** The public channel teaches the OS. Private amounts stay gated (site lock, local books). Public teaching copy must not leak sized balances or receipts that belong behind the gate.

4. **Engineer handoff.** Exportable full trail (Decisions JSON today; later a shared DB) is the bridge to real XRPL / XRS recording. Import/merge is the Phase Zero hub bridge. Do not invent a second schema for chain.

5. **Playbook pointer.** Overnight Web2 mimic (treasury trail, record-book fields, Robinhood Main vs Agentic) is documented in [`overnight-build.md`](./overnight-build.md) and in-app at **What changed**. That work does not start chain writes.

6. **Hedera witness (later).** Hedera Hashgraph is the primary attestation path. Decision rows already carry `attestationStatus` (`web2_only` → `pending_operator_ack` → `hashgraph_queued` → `hashgraph_attested`) plus reserved `hederaMessageId` / `attestedAt`. Promotion rules: [`hedera-attestation.md`](./hedera-attestation.md). No Hedera SDK or keys in Phase Zero.

7. **Channel vs gate (dual surface).** Private board keeps dollars and exact XRP. Public skeleton (`/public`) publishes node target % only. [`public-vs-private.md`](./public-vs-private.md).

Not in this phase: sensors, ack viewer, beep trail, shared DB, hashing, Hedera submits, or on-chain writes.
