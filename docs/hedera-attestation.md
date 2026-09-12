# Hedera attestation (doctrine)

Founder-locked: **Hedera Hashgraph** is the primary attestation / hashgraph witness for Resonance. Phase Zero does **not** talk to Hedera, store keys, or submit messages. Schema only: `attestationStatus`, `hederaMessageId` (tx / message id), `attestedAt` (timestamp).

## Status ladder (Decision fields)

| Status | Meaning |
| --- | --- |
| `web2_only` | Default tonight. Record exists only in the Web2 book. |
| `pending_operator_ack` | Sensor / raw event logged in Web2. Not eligible for Hedera until an operator views and acks. |
| `hashgraph_queued` | Chain-class decision, operator-acked, waiting for a Hedera submit. |
| `hashgraph_attested` | Witnessed. Fill `hederaMessageId` + `attestedAt`. Public view may show the attestation link. |

`fingerprint` remains the reserved hash of the **public** record. Sensitive amounts stay off-chain / off-memo.

## Promotion rules

1. **Sensor beeps stay Web2** (`web2_only` or `pending_operator_ack`) until an operator views and acks. Do not auto-promote the beep trail.
2. **Chain-class Decisions** (proposal, why, who authorized, outcome queued ≠ filled, receipt) are eligible for Hedera after that ack → `hashgraph_queued` then `hashgraph_attested`.
3. **Public view** (`/public`) shows attestation status, reserved memo hash / timestamp (Hedera id when live), **not dollar amounts**.
4. Main Robinhood lots and Xaman principal never appear in a public memo.

No Hedera SDK, operator keys, or network calls in this phase.
