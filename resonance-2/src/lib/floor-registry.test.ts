import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR_NODES } from "@/data/floor-nodes";
import { catalogNodes, removedNodes, visibleNodes } from "./floor-registry";

const LIVE = ["XRP", "SUI", "PWR", "ETN", "VRT", "GEV", "CEG", "HUBB"];
const OFFLINE = ["BTC", "ETH", "SOL"];

describe("homepage floor paint", () => {
  it("paints live faces and the one add slot", () => {
    const visible = visibleNodes([]);
    assert.deepEqual(
      visible.map((node) => node.ticker),
      [...LIVE, "+"],
    );
    assert.equal(
      visible.some((node) => node.status === "offline"),
      false,
    );
    assert.equal(visible.filter((node) => node.status === "empty").length, 1);
  });

  it("keeps offline tickers in the roster and off the grid", () => {
    assert.deepEqual(
      catalogNodes().map((node) => node.ticker),
      [...LIVE, ...OFFLINE],
    );
    assert.equal(
      FLOOR_NODES.some((node) => node.ticker === "FLR"),
      false,
    );

    const visible = visibleNodes(["xrp", "btc"]);
    assert.deepEqual(
      visible.map((node) => node.ticker),
      ["SUI", "PWR", "ETN", "VRT", "GEV", "CEG", "HUBB", "+"],
    );

    assert.deepEqual(
      removedNodes(["xrp", "btc"]).map((node) => node.ticker),
      ["XRP", "BTC"],
    );
  });
});
