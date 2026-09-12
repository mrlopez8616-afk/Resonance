# Recording pipeline (doctrine)

Founder-locked for later phases. Phase Zero implements the Web2 record book and import/merge only. No chain writes, no wallet signing, no private keys.

1. **Web2 mimics on-chain now.** Every serious event must already look like a chain-class record: proposed, why, who authorized, outcome (queued ≠ filled), receipt, plus timestamps (`date`, `createdAt`). The Decisions schema is that shape. `fingerprint` is reserved for a later hash of the public record; sensitive details stay off-chain.

2. **Sensor path (future).** Raw anomalies log to Web2 immediately. They become a chain-class commit only after an operator views and acks them — a record viewer plus time with the beep trail. Do not auto-promote sensor noise to the durable book.

3. **Channel vs gate.** The public channel teaches the OS. Private amounts stay gated (site lock, local books). Public teaching copy must not leak sized balances or receipts that belong behind the gate.

4. **Engineer handoff.** Exportable full trail (Decisions JSON today; later a shared DB) is the bridge to real XRPL / XRS recording. Import/merge is the Phase Zero hub bridge. Do not invent a second schema for chain.

Not in this PR: sensors, ack viewer, beep trail, shared DB, hashing, or on-chain writes.
