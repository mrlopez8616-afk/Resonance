import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR_NODES } from "@/data/floor-nodes";
import { FIGHT_DESK_ID, NODE_PARENT, PARENTS } from "@/data/node-parents";
import { formatCompactUsd } from "@/lib/live-face";
import {
  nodesOnParent,
  parentAggregate,
  parentById,
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
  pwr: "ai",
  etn: "ai",
  vrt: "ai",
  gev: "ai",
  ceg: "ai",
  hubb: "ai",
  [FIGHT_DESK_ID]: "fights",
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

  it("leaves stocks, fitness, and money with no home nodes", () => {
    assert.deepEqual(parentById("stocks"), { id: "stocks", label: "Stocks" });
    assert.deepEqual(parentById("fitness"), { id: "fitness", label: "Fitness" });
    assert.deepEqual(parentById("money"), { id: "money", label: "Money" });
    const assigned = new Set<string>(Object.values(NODE_PARENT));
    for (const id of ["stocks", "fitness", "money"] as const) {
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
      nodesOnParent([], "ai").map((node) => node.ticker),
      ["PWR", "ETN", "VRT", "GEV", "CEG", "HUBB", "+"],
    );
    assert.deepEqual(nodesOnParent([], "fights").map((node) => node.ticker), []);
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

  it("sums live USD only when every painted child already has one", () => {
    assert.equal(sumLiveUsd({ XRP: 10, SUI: 5 }, ["XRP", "SUI"]), 15);
    assert.equal(sumLiveUsd({ XRP: 10, SUI: null }, ["XRP", "SUI"]), null);
    assert.equal(sumLiveUsd({ XRP: 10 }, ["XRP", "BTC"]), null);
    assert.equal(sumLiveUsd({}, []), null);

    const complete = parentAggregate(
      "crypto",
      [],
      { XRP: 10, SUI: 2.5, HBAR: 0 },
      null,
      "live",
    );
    assert.equal(complete.connected, true);
    assert.equal(complete.childCount, 3);
    assert.equal(complete.liveUsd, 12.5);
    assert.equal(complete.liveUsdLabel, formatCompactUsd(12.5));
    assert.equal(complete.openBets, null);

    const missing = parentAggregate(
      "crypto",
      [],
      { XRP: 10, SUI: null, HBAR: 1 },
      null,
      "live",
    );
    assert.equal(missing.liveUsd, null);
    assert.equal(missing.liveUsdLabel, null);
    assert.equal(missing.childCount, 3);

    const hidden = parentAggregate("ai", ["pwr"], { ETN: 1, VRT: 1, GEV: 1, CEG: 1, HUBB: 1 }, null, "live");
    assert.equal(hidden.childCount, 5);
    assert.equal(hidden.liveUsd, 5);
  });

  it("counts the fight desk tile and uses its open count only when the summary exists", () => {
    const live = parentAggregate(
      "fights",
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

    const down = parentAggregate("fights", [], {}, null, "unavailable");
    assert.equal(down.childCount, 1);
    assert.equal(down.openBets, null);

    const empty = parentAggregate("fitness", [], { XRP: 99 }, null, "live");
    assert.equal(empty.connected, false);
    assert.equal(empty.childCount, 0);
    assert.equal(empty.liveUsd, null);
    assert.equal(empty.openBets, null);
  });
});
