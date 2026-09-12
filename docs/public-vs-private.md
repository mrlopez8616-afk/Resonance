# Public vs private (dual surface)

Resonance has two surfaces. Phase Zero implements the private board fully and a shareable **public skeleton** at `/public`.

## 1. Private Resonance (default / gated)

The operator board behind the site lock (`RESONANCE_APP_PASSWORD` in production):

- Exact founder treasury XRP (~27,772) and the Aug 28 trail
- Robinhood Main vs Agentic ties, quantities, average cost
- Cash / dry powder
- Decision receipts, sized outcomes, evidence

Do not publish these figures on a public memo or an on-chain memo.

## 2. Public / shareable skeleton

`/public` shows the twelve nodes with **target allocation percentages** of the published system — not dollars. Dry powder / exact XRP / RH quantities are omitted (`omitDryPowder: true`). Decision index shows id, redacted question, attestation status, and memo hash + timestamp (Hedera Testnet message id when a row is `hashgraph_attested`).

Dollar sizes and exact unit prints are stripped from public memo text. Never put private prices in a public or on-chain memo.

`GET /api/public` is the ungated JSON form of this skeleton. `GET /api/decisions` stays locked (cookie or Bearer) because it includes outcomes and sizes.

Target % lives on each node as `publicAllocationPct` (null = unpublished). Edit on Nodes.

See also [`hedera-attestation.md`](./hedera-attestation.md) and [`recording-pipeline.md`](./recording-pipeline.md).
