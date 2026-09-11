import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLedgerToTreasury, balanceDelta, netAmount } from "./ledger";
import { createSeedState } from "./seed";
import { xrpUsdRate } from "./valuation";

describe("ledger math", () => {
  it("nets amount minus fee", () => {
    assert.equal(netAmount({ amount: 7.14, fee: 0.02 }), 7.12);
  });

  it("does not move the working balance unless asked", () => {
    assert.equal(
      balanceDelta({
        amount: 1,
        fee: 0,
        classification: "reward",
        applyToBalance: false,
      }),
      0,
    );
  });

  it("applies reward net to the working balance", () => {
    const state = createSeedState();
    const next = applyLedgerToTreasury(state, {
      id: "t1",
      date: "2026-09-11",
      amount: 1,
      fee: 0.1,
      note: "test",
      classification: "reward",
      applyToBalance: true,
      createdAt: "2026-09-11T00:00:00.000Z",
    });
    assert.equal(next.treasury.units, 26000.9);
    assert.equal(next.ledger.length, state.ledger.length + 1);
  });
});

describe("manual-first valuation", () => {
  it("does not invent an XRP/USD rate", () => {
    assert.equal(xrpUsdRate(null, null), null);
  });

  it("prefers a live print over a typed rate", () => {
    const rate = xrpUsdRate(1.39, 2);
    assert.equal(rate?.usd, 1.39);
    assert.equal(rate?.provenance, "verified");
  });

  it("uses a typed rate when no live print exists", () => {
    const rate = xrpUsdRate(undefined, 1.4);
    assert.equal(rate?.usd, 1.4);
    assert.equal(rate?.provenance, "founder-reported");
  });
});

describe("graph-ready node records", () => {
  it("gives every node a stable id and a links array", () => {
    const state = createSeedState();
    assert.equal(state.nodes.length, 12);
    for (const node of state.nodes) {
      assert.ok(node.id.startsWith("node-"));
      assert.ok(Array.isArray(node.links));
    }
    const xrp = state.nodes.find((node) => node.ticker === "XRP");
    assert.ok(xrp?.links.some((link) => link.targetTicker === "FLR"));
  });
});
