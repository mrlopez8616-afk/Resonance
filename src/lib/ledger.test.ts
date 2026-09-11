import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLedgerToTreasury, balanceDelta, netAmount } from "./ledger";
import { createSeedState } from "./seed";

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
