import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  DIGITAL_TICKERS,
  LOCKED_AGENTIC_INTENTS,
  MAIN_FLATTEN_TICKERS,
  PHYSICAL_AI_TICKERS,
  SEEDED_MAIN_HOLDINGS,
  mainLearningLots,
  queuedAgenticIntents,
} from "./robinhood";
import { createSeedState } from "./seed";
import { migrateState } from "./storage";

describe("Robinhood categories", () => {
  it("splits digital rails from physical AI nodes", () => {
    assert.deepEqual([...DIGITAL_TICKERS], ["BTC", "ETH", "SOL", "XRP", "SUI", "FLR"]);
    assert.deepEqual([...PHYSICAL_AI_TICKERS], ["PWR", "ETN", "VRT", "GEV", "CEG", "HUBB"]);
  });

  it("seeds Main learning lots as funded Robinhood holdings", () => {
    const seed = createSeedState();
    const lots = mainLearningLots(seed.nodes);
    assert.equal(lots.length, 6);
    for (const ticker of MAIN_FLATTEN_TICKERS) {
      const node = seed.nodes.find((item) => item.ticker === ticker);
      assert.equal(node?.sleeve, "main");
      assert.equal(node?.status, "funded");
      assert.equal(node?.venue, "Robinhood");
      assert.equal(node?.quantity, SEEDED_MAIN_HOLDINGS[ticker]?.quantity);
    }
    const xrp = seed.nodes.find((item) => item.ticker === "XRP");
    assert.equal(xrp?.quantity, "69.169");
    assert.equal(xrp?.venue, "Robinhood");
    assert.equal(xrp?.sleeve, "main");
    assert.equal(seed.treasury.units, 27772);
    assert.equal(seed.treasury.venue, "Xaman");
  });

  it("queues PWR VRT ETN GEV on the Agentic sleeve — not filled", () => {
    const queued = queuedAgenticIntents(LOCKED_AGENTIC_INTENTS);
    assert.equal(queued.length, 4);
    const byTicker = Object.fromEntries(
      queued.map((item) => [item.ticker, item]),
    );
    assert.equal(byTicker.PWR?.notionalUsd, 35);
    assert.equal(byTicker.PWR?.authorizedByDecisionId, "D-2026-09-11-03");
    assert.equal(byTicker.VRT?.notionalUsd, 17);
    assert.equal(byTicker.ETN?.authorizedByDecisionId, "D-2026-09-11-04");
    assert.equal(byTicker.GEV?.authorizedByDecisionId, "D-2026-09-11-04");
    for (const item of queued) {
      assert.equal(item.status, "queued");
      assert.equal(item.venue, "Robinhood");
    }
    const seed = createSeedState();
    assert.equal(seed.agenticIntents.length, 4);
    assert.ok(seed.agenticIntents.every((item) => item.status === "queued"));
  });

  it("records D-04 autonomy over ETN/GEV and Monday-open queued outcomes", () => {
    const d03 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-03");
    const d04 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-04");
    assert.match(d03?.outcome ?? "", /QUEUED for Monday open/);
    assert.match(d04?.outcome ?? "", /ETN\/GEV/);
    assert.match(d04?.outcome ?? "", /QUEUED for Monday open/);
    assert.match(d04?.rationale ?? "", /ETN and GEV/);
    assert.equal(d03?.fingerprint, null);
    assert.equal(d04?.fingerprint, null);
  });

  it("backfills missing Agentic intents on migrate", () => {
    const restored = migrateState({
      version: 1,
      agenticIntents: [],
    });
    assert.equal(restored.agenticIntents.length, 4);
    assert.ok(restored.agenticIntents.some((item) => item.id === "agt-2026-09-11-etn"));
  });
});
