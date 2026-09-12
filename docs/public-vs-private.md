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

`/public` shows the twelve nodes with **target allocation percentages** of the published system — not dollars. Dry powder / exact XRP is omitted. Decision index shows id, question, and attestation status only.

Later: public view may show a Hedera / on-chain memo tx hash + timestamp per decision. Still never private prices.

Target % lives on each node as `publicAllocationPct` (null = unpublished). Edit on Nodes.

See also [`hedera-attestation.md`](./hedera-attestation.md) and [`recording-pipeline.md`](./recording-pipeline.md).
