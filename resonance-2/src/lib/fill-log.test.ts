import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import type { TransferFill } from "@/data/fills";
import { TransferFillCard } from "@/components/transfer-fill-card";

function collectText(node: ReactNode, found: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") {
    found.push(String(node));
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const type = node.type;
  if (typeof type === "function") {
    collectText((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
  collectText((node.props as { children?: ReactNode }).children, found);
  return found;
}

describe("transfer fill card", () => {
  it("shows the move and omits price and P&L", () => {
    const fill: TransferFill = {
      kind: "transfer",
      time: "2026-10-09T16:59:00-05:00",
      symbol: "SUI",
      quantity: "1.2",
      venue: "coinbase",
      fromSleeve: "cb-agentic",
      toSleeve: "coinbase",
      orderId: "transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59",
      idempotencyKey: "coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59",
      result: "filled",
      note: "Coinbase portfolio transfer Agentic d757d013 to Default 5aba0d3b. Not a trade.",
    };
    const text = collectText(TransferFillCard({ fill })).join(" ");
    assert.match(text, /kind transfer/);
    assert.match(text, /cb-agentic → coinbase/);
    assert.match(text, /quantity 1\.2/);
    assert.match(text, /venue coinbase/);
    assert.match(text, /Not a trade/);
    assert.equal(text.includes("price"), false);
    assert.equal(text.includes("P&L"), false);
  });
});
