import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  applyHoldingsSnapshot,
  HOLDINGS_SNAPSHOT_HELP,
  latestHoldingsSync,
  parseHoldingsSnapshot,
  previewHoldingsSnapshot,
} from "./holdings-snapshot";
import { createSeedState } from "./seed";
import { migrateState } from "./storage";

const examplePath = path.join(
  process.cwd(),
  "public/examples/robinhood-holdings-snapshot.json",
);

function exampleSnapshot() {
  return parseHoldingsSnapshot(readFileSync(examplePath, "utf8"));
}

describe("holdings snapshot parse", () => {
  it("accepts the seeded Robinhood example", () => {
    const snapshot = exampleSnapshot();
    assert.equal(snapshot.source, "robinhood");
    assert.equal(snapshot.asOf, "2026-09-11T16:10:00Z");
    assert.equal(snapshot.holdings.length, 7);
    const pwr = snapshot.holdings.find((row) => row.symbol === "PWR");
    assert.equal(pwr?.quantity, "0.070066");
    assert.equal(pwr?.averageCost, "627.98");
  });

  it("matches the in-app schema help example shape", () => {
    const snapshot = parseHoldingsSnapshot(HOLDINGS_SNAPSHOT_HELP);
    assert.equal(snapshot.holdings[0]?.symbol, "PWR");
    assert.equal(snapshot.holdings[1]?.symbol, "XRP");
  });

  it("is case-insensitive on symbols", () => {
    const snapshot = parseHoldingsSnapshot(
      JSON.stringify({
        asOf: "2026-09-11T16:10:00Z",
        source: "robinhood",
        holdings: [{ symbol: "pwr", assetClass: "equity", quantity: "1" }],
      }),
    );
    assert.equal(snapshot.holdings[0]?.symbol, "PWR");
  });

  it("rejects a full Resonance export", () => {
    assert.throws(
      () => parseHoldingsSnapshot(JSON.stringify(createSeedState())),
      /full Resonance export/,
    );
  });
});

describe("holdings snapshot apply", () => {
  it("funds the six physical nodes and leaves Xaman treasury alone", () => {
    const seed = createSeedState();
    const next = applyHoldingsSnapshot(seed, exampleSnapshot());
    const physical = ["CEG", "ETN", "PWR", "GEV", "HUBB", "VRT"];
    for (const ticker of physical) {
      const node = next.nodes.find((item) => item.ticker === ticker);
      assert.equal(node?.status, "funded");
      assert.equal(node?.venue, "Robinhood");
      assert.equal(node?.syncSource, "robinhood-snapshot");
      assert.equal(node?.lastSyncedAt, "2026-09-11T16:10:00Z");
      assert.ok(node?.quantity);
    }
    const pwr = next.nodes.find((item) => item.ticker === "PWR");
    assert.equal(pwr?.quantity, "0.070066");
    assert.equal(pwr?.averageCost, "627.98");

    const xrp = next.nodes.find((item) => item.ticker === "XRP");
    assert.equal(xrp?.quantity, "69.169");
    assert.equal(xrp?.venue, "Robinhood");
    assert.match(xrp?.holdingsNote ?? "", /Separate from Xaman treasury/);
    assert.equal(next.treasury.units, seed.treasury.units);
    assert.equal(next.treasury.venue, "Xaman");

    const btc = next.nodes.find((item) => item.ticker === "BTC");
    assert.equal(btc?.status, "watch");
    assert.equal(btc?.quantity, null);
  });

  it("previews before apply without mutating state", () => {
    const seed = createSeedState();
    const preview = previewHoldingsSnapshot(seed, exampleSnapshot());
    assert.equal(preview.matchedNodeCount, 7);
    assert.equal(preview.treasuryUpdates, 0);
    assert.ok(
      preview.warnings.some((warning) => warning.includes("Xaman")),
    );
    const stillWatch = seed.nodes.find((node) => node.ticker === "PWR");
    assert.equal(stillWatch?.status, "watch");
  });

  it("only updates treasury when a holding explicitly targets it", () => {
    const seed = createSeedState();
    const next = applyHoldingsSnapshot(
      seed,
      parseHoldingsSnapshot(
        JSON.stringify({
          asOf: "2026-09-11T16:10:00Z",
          source: "manual",
          holdings: [
            {
              symbol: "XRP",
              quantity: "100",
              target: "treasury",
            },
          ],
        }),
      ),
    );
    assert.equal(next.treasury.units, 100);
    const xrp = next.nodes.find((node) => node.ticker === "XRP");
    assert.equal(xrp?.quantity, null);
  });

  it("keeps thesis editable after import (manual overlay)", () => {
    const seed = createSeedState();
    const imported = applyHoldingsSnapshot(seed, exampleSnapshot());
    const thesis = "Rewritten by operator after snapshot.";
    const nodes = imported.nodes.map((node) =>
      node.ticker === "PWR" ? { ...node, thesis, quantity: "0.08" } : node,
    );
    const pwr = nodes.find((node) => node.ticker === "PWR");
    assert.equal(pwr?.status, "funded");
    assert.equal(pwr?.thesis, thesis);
    assert.equal(pwr?.quantity, "0.08");
    assert.equal(pwr?.syncSource, "robinhood-snapshot");
  });
});

describe("holdings persistence", () => {
  it("round-trips quantity and venue through migrateState", () => {
    const seed = createSeedState();
    const imported = applyHoldingsSnapshot(seed, exampleSnapshot());
    const restored = migrateState(JSON.parse(JSON.stringify(imported)));
    const pwr = restored.nodes.find((node) => node.ticker === "PWR");
    assert.equal(pwr?.quantity, "0.070066");
    assert.equal(pwr?.venue, "Robinhood");
    assert.equal(pwr?.status, "funded");
    const sync = latestHoldingsSync(restored.nodes);
    assert.equal(sync?.source, "robinhood-snapshot");
    assert.equal(sync?.at, "2026-09-11T16:10:00Z");
  });
});
