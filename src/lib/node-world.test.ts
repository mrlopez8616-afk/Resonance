import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import { DIGITAL_TICKERS, PHYSICAL_AI_TICKERS } from "./robinhood";
import { createSeedState } from "./seed";
import type { Decision } from "./types";
import {
  allocationLabel,
  altitudeScale,
  capitalFlowsFor,
  decisionTouchesTicker,
  decisionsForTicker,
  nextAltitude,
  publicSafeStampBlob,
  stampSummaryForTicker,
  textMentionsTicker,
  worldCards,
  worldNodeOrder,
} from "./node-world";

describe("node world", () => {
  it("uses the locked twelve-node set in digital-then-physical order", () => {
    const seed = createSeedState();
    const ordered = worldNodeOrder(seed.nodes);
    assert.equal(ordered.length, 12);
    assert.deepEqual(
      ordered.map((node) => node.ticker),
      [...DIGITAL_TICKERS, ...PHYSICAL_AI_TICKERS],
    );
    const cards = worldCards(seed.nodes);
    assert.equal(cards.length, 12);
    assert.ok(cards.every((card) => card.web2Record));
    assert.ok(cards.every((card) => !("quantity" in card)));
    assert.ok(cards.every((card) => !("averageCost" in card)));
  });

  it("does not invent tickers when extras appear on the board", () => {
    const seed = createSeedState();
    const extra = {
      ...seed.nodes[0],
      id: "node-fake",
      ticker: "FAKE",
    };
    const ordered = worldNodeOrder([...seed.nodes, extra]);
    assert.equal(ordered.length, 12);
    assert.equal(
      ordered.some((node) => node.ticker === "FAKE"),
      false,
    );
  });

  it("matches decisions to tickers by word boundary, not substrings", () => {
    assert.equal(textMentionsTicker("KEEP Monday sells on CEG/ETN/PWR", "CEG"), true);
    assert.equal(textMentionsTicker("Ethereum is watched", "ETH"), false);
    assert.equal(textMentionsTicker("solution path", "SOL"), false);
    assert.equal(textMentionsTicker("Watch SOL until sized", "SOL"), true);

    const d01 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-01");
    const d03 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-03");
    const d04 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-04");
    assert.ok(d01 && d03 && d04);
    assert.equal(decisionTouchesTicker(d01, "PWR"), true);
    assert.equal(decisionTouchesTicker(d01, "BTC"), false);
    assert.equal(decisionTouchesTicker(d03, "VRT"), true);
    assert.equal(decisionTouchesTicker(d04, "ETN"), true);
    assert.equal(decisionTouchesTicker(d04, "GEV"), true);
  });

  it("includes intent-authorized decisions even if the ticker is only on the intent", () => {
    const seed = createSeedState();
    const rows = decisionsForTicker(seed.decisions, "PWR", seed.agenticIntents);
    assert.ok(rows.some((row) => row.id === "D-2026-09-11-03"));
  });

  it("builds capital flows from treasury well, existing links, and queued intents — no dollar sizes", () => {
    const seed = createSeedState();
    const flows = capitalFlowsFor(seed.nodes, seed.agenticIntents);
    const blob = JSON.stringify(flows);
    assert.ok(flows.some((flow) => flow.id === "flow-treasury-xrp"));
    assert.ok(
      flows.some(
        (flow) => flow.from === "XRP" && flow.to === "FLR" && flow.kind === "depends-on",
      ),
    );
    assert.ok(flows.some((flow) => flow.kind === "agentic-queued" && flow.to === "PWR"));
    assert.ok(!blob.includes("$35"));
    assert.ok(!blob.includes("27772"));
    assert.ok(!blob.includes("0.070066"));
  });

  it("rolls Hedera / XRPL stamps without leaking private amounts", () => {
    const attested: Decision[] = LOCKED_DECISIONS_2026_09_11.map((row) =>
      row.id === "D-2026-09-11-03"
        ? {
            ...row,
            attestationStatus: "hashgraph_attested",
            hederaMessageId: "0.0.555/1",
            fingerprint: "ab".repeat(32),
            attestedAt: "2026-09-13T00:00:00.000Z",
            xrplTxHash: "CD".repeat(32),
            xrplMemoAt: "2026-09-13T01:00:00.000Z",
            outcome: "PWR $35 FILLED — keep this off the overlay.",
          }
        : row,
    );
    const summary = stampSummaryForTicker("PWR", attested);
    assert.equal(summary.decisionCount > 0, true);
    assert.equal(summary.hederaStatus, "hashgraph_attested");
    assert.equal(summary.hederaMessageId, "0.0.555/1");
    assert.equal(summary.xrplTxHash, "CD".repeat(32));
    const blob = publicSafeStampBlob(summary);
    assert.ok(!blob.includes("$35"));
    assert.ok(!blob.includes("FILLED"));
    assert.ok(!/"outcome"/.test(blob));
    assert.ok(!/"quantity"/.test(blob));
  });

  it("walks altitude levels and leaves unpublished allocation unpublished", () => {
    assert.equal(nextAltitude("world", "in"), "node");
    assert.equal(nextAltitude("node", "in"), "guts");
    assert.equal(nextAltitude("guts", "in"), "guts");
    assert.equal(nextAltitude("world", "out"), "world");
    assert.equal(nextAltitude("guts", "out"), "node");
    assert.equal(allocationLabel(null), "Unpublished");
    assert.equal(allocationLabel(12.5), "12.5%");
    assert.ok(altitudeScale("guts") < 1.3);
    assert.equal(altitudeScale("world"), 1);
  });
});
