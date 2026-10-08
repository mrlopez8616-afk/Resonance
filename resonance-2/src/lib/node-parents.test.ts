import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR_NODES } from "@/data/floor-nodes";
import { FIGHT_DESK_ID, NODE_PARENT, PARENTS } from "@/data/node-parents";
import { formatCompactUsd } from "@/lib/live-face";
import {
  legacyParentHref,
  isZeroCryptoHolding,
  nodePageHref,
  nodesOnParent,
  parentAggregate,
  parentById,
  parentCardHref,
  parentSummaryLine,
  removedOnParent,
  sumLiveUsd,
} from "./node-parents";

const PROPOSED = {
  xrp: "crypto",
  sui: "crypto",
  hbar: "crypto",
  btc: "crypto",
  eth: "crypto",
  sol: "crypto",
  flr: "crypto",
  pwr: "ai-stocks",
  etn: "ai-stocks",
  vrt: "ai-stocks",
  gev: "ai-stocks",
  ceg: "ai-stocks",
  hubb: "ai-stocks",
  [FIGHT_DESK_ID]: "predictions",
} as const;

describe("node parent map", () => {
  it("maps every painted and roster home node, and leaves the add slot unmapped", () => {
    assert.deepEqual(NODE_PARENT, PROPOSED);
    for (const node of FLOOR_NODES) {
      if (node.status === "empty") {
        assert.equal(Object.hasOwn(NODE_PARENT, node.id), false);
      } else {
        assert.equal(typeof NODE_PARENT[node.id as keyof typeof NODE_PARENT], "string");
      }
    }
    assert.equal(FLOOR_NODES.some((node) => node.ticker === "FLR"), false);
    assert.equal(Object.hasOwn(NODE_PARENT, "flr"), true);
    assert.equal(Object.hasOwn(NODE_PARENT, "xlm"), false);
    for (const parentId of Object.values(NODE_PARENT)) {
      assert.ok(PARENTS.some((parent) => parent.id === parentId));
    }
  });

  it("shows the five confirmed parents and leaves fitness and finance empty", () => {
    assert.deepEqual(
      PARENTS.map((parent) => ({ id: parent.id, label: parent.label })),
      [
        { id: "crypto", label: "Crypto" },
        { id: "ai-stocks", label: "AI Stocks" },
        { id: "fitness", label: "Fitness" },
        { id: "finance", label: "Finance" },
        { id: "predictions", label: "Predictions" },
      ],
    );
    assert.equal(parentById("ai"), null);
    assert.equal(parentById("stocks"), null);
    assert.equal(parentById("money"), null);
    const assigned = new Set<string>(Object.values(NODE_PARENT));
    for (const id of ["fitness", "finance"] as const) {
      assert.equal(assigned.has(id), false);
      assert.deepEqual(nodesOnParent([], id).map((node) => node.ticker), []);
    }
    assert.equal(parentById("nope"), null);
  });

  it("paints the same live squares under their parent, and never paints offline or FLR", () => {
    assert.deepEqual(
      nodesOnParent([], "crypto").map((node) => node.ticker),
      ["XRP", "SUI", "HBAR", "+"],
    );
    assert.deepEqual(
      nodesOnParent([], "ai-stocks").map((node) => node.ticker),
      ["PWR", "ETN", "VRT", "GEV", "CEG", "HUBB", "+"],
    );
    assert.deepEqual(nodesOnParent([], "predictions").map((node) => node.ticker), []);
    assert.deepEqual(
      nodesOnParent(["xrp", "pwr", "btc"], "crypto").map((node) => node.ticker),
      ["SUI", "HBAR", "+"],
    );
    assert.deepEqual(
      removedOnParent(["xrp", "pwr", "btc"], "crypto").map((node) => node.ticker),
      ["XRP", "BTC"],
    );
    assert.equal(
      nodesOnParent([], "crypto").some((node) => node.ticker === "FLR" || node.ticker === "BTC"),
      false,
    );
  });

  it("sums the children that have a real value and counts the rest as missing", () => {
    assert.deepEqual(sumLiveUsd({ XRP: 10, SUI: 5 }, ["XRP", "SUI"]), {
      usd: 15,
      valued: 2,
      painted: 2,
    });
    assert.deepEqual(sumLiveUsd({ XRP: 10, SUI: null }, ["XRP", "SUI"]), {
      usd: 10,
      valued: 1,
      painted: 2,
    });
    assert.deepEqual(sumLiveUsd({ XRP: 10 }, ["XRP", "BTC"]), {
      usd: 10,
      valued: 1,
      painted: 2,
    });
    assert.deepEqual(sumLiveUsd({}, []), { usd: null, valued: 0, painted: 0 });

    const complete = parentAggregate(
      "crypto",
      [],
      { XRP: 10, SUI: 2.5, HBAR: 0 },
      null,
      "live",
    );
    assert.equal(complete.connected, true);
    assert.equal(complete.childCount, 2);
    assert.equal(complete.liveUsd, 12.5);
    assert.equal(complete.liveUsdLabel, formatCompactUsd(12.5));
    assert.equal(complete.valuedCount, 2);
    assert.equal(complete.paintedCount, 2);
    assert.equal(complete.openBets, null);
    assert.equal(isZeroCryptoHolding("HBAR", 0), true);
    assert.equal(isZeroCryptoHolding("HBAR", 0.004), true);
    assert.equal(isZeroCryptoHolding("HBAR", 0.02), false);
    assert.equal(isZeroCryptoHolding("PWR", 0), false);

    const missing = parentAggregate(
      "crypto",
      [],
      { XRP: 10, SUI: null, HBAR: 1 },
      null,
      "live",
    );
    assert.equal(missing.liveUsd, 11);
    assert.equal(missing.liveUsdLabel, formatCompactUsd(11));
    assert.equal(missing.valuedCount, 2);
    assert.equal(missing.paintedCount, 3);
    assert.equal(missing.childCount, 3);

    const none = parentAggregate(
      "crypto",
      [],
      { XRP: null, SUI: null, HBAR: null },
      null,
      "live",
    );
    assert.equal(none.liveUsd, null);
    assert.equal(none.valuedCount, 0);
    assert.equal(none.paintedCount, 3);

    const hidden = parentAggregate("ai-stocks", ["pwr"], { ETN: 1, VRT: 1, GEV: 1, CEG: 1, HUBB: 1 }, null, "live");
    assert.equal(hidden.childCount, 5);
    assert.equal(hidden.paintedCount, 5);
    assert.equal(hidden.liveUsd, 5);
  });

  it("counts the fight desk tile and uses its open count only when the summary exists", () => {
    const live = parentAggregate(
      "predictions",
      [],
      {},
      {
        open: 2,
        staked: "10.00",
        stakedLabel: "$10.00",
        potential: "20.00",
        potentialLabel: "$20.00",
        wins: 1,
        losses: 0,
        record: "1-0",
        estimated: false,
      },
      "seed-only",
    );
    assert.equal(live.connected, true);
    assert.equal(live.childCount, 1);
    assert.equal(live.openBets, 2);
    assert.equal(live.liveUsd, null);

    const down = parentAggregate("predictions", [], {}, null, "unavailable");
    assert.equal(down.childCount, 1);
    assert.equal(down.openBets, null);

    const empty = parentAggregate("fitness", [], { XRP: 99 }, null, "live");
    assert.equal(empty.connected, false);
    assert.equal(empty.childCount, 0);
    assert.equal(empty.liveUsd, null);
    assert.equal(empty.openBets, null);
  });

  it("keeps a parent card to one real line and one hop", () => {
    const summed = parentAggregate(
      "crypto",
      [],
      { XRP: 10, SUI: 2.5, HBAR: 0 },
      null,
      "live",
    );
    assert.deepEqual(parentSummaryLine(summed), {
      value: formatCompactUsd(12.5),
      unit: "sum",
      coverage: false,
    });

    const partial = parentAggregate(
      "ai-stocks",
      [],
      { PWR: 4, ETN: 1, VRT: null, GEV: 2, CEG: 1, HUBB: null },
      null,
      "live",
    );
    assert.deepEqual(parentSummaryLine(partial), {
      value: formatCompactUsd(8),
      unit: "value of 4 of 6",
      coverage: true,
    });
    assert.deepEqual(
      parentSummaryLine(
        parentAggregate("crypto", [], { XRP: null, SUI: null, HBAR: null }, null, "live"),
      ),
      { value: "value of 0 of 3", unit: "", coverage: true },
    );

    const predictions = parentAggregate(
      "predictions",
      [],
      {},
      {
        open: 15,
        staked: "1.00",
        stakedLabel: "$1.00",
        potential: "2.00",
        potentialLabel: "$2.00",
        wins: 0,
        losses: 0,
        record: "0-0",
        estimated: true,
      },
      "live",
    );
    assert.equal(predictions.openBets, 15);
    assert.equal(parentSummaryLine(predictions), null);
    assert.equal(parentSummaryLine(parentAggregate("finance", [], {}, null, "live")), null);
    assert.equal(parentSummaryLine(parentAggregate("fitness", [], {}, null, "live")), null);

    assert.equal(parentCardHref("predictions"), "/n/predictions");
    assert.equal(parentCardHref("crypto"), "/n/crypto");
    assert.equal(parentCardHref("ai-stocks"), "/n/ai-stocks");
    assert.equal(nodePageHref("XRP"), "/n/crypto/xrp");
    assert.equal(nodePageHref("PWR"), "/n/ai-stocks/pwr");
    assert.equal(legacyParentHref("ai"), "/n/ai-stocks");
    assert.equal(legacyParentHref("stocks"), "/n/ai-stocks");
    assert.equal(legacyParentHref("ai", "pwr"), "/n/ai-stocks/pwr");
    assert.equal(legacyParentHref("stocks", "xrp"), "/n/ai-stocks");
    assert.equal(legacyParentHref("money"), "/n/finance");
    assert.equal(legacyParentHref("fights"), "/n/predictions");
    assert.equal(legacyParentHref("fights", "bankroll"), "/n/predictions");
    assert.equal(legacyParentHref("crypto"), null);
    assert.equal(nodePageHref("FLR"), null);
    assert.equal(nodePageHref("UFC"), null);
  });
});
