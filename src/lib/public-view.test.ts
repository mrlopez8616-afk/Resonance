import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeedState } from "./seed";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  publishedAllocationSum,
  redactPublicMemoText,
  toPublicDecisions,
  toPublicSkeleton,
} from "./public-view";

describe("public skeleton", () => {
  it("strips dollars, exact XRP, and Robinhood quantities", () => {
    const seed = createSeedState();
    const pub = toPublicSkeleton(seed);
    const blob = JSON.stringify(pub);
    assert.equal(pub.omitDryPowder, true);
    assert.equal(pub.nodes.length, 12);
    assert.ok(!blob.includes("27772"));
    assert.ok(!blob.includes("0.070066"));
    assert.ok(!("quantity" in pub.nodes[0]));
    assert.ok(!("venue" in pub.nodes[0]));
    assert.ok(!/"outcome"/.test(blob));
    assert.ok(!/"evidence"/.test(blob));
    const pwr = pub.nodes.find((node) => node.ticker === "PWR");
    assert.equal(pwr?.publicAllocationPct, null);
  });

  it("exposes Hedera attestation fields as web2_only until later", () => {
    const pub = toPublicSkeleton(createSeedState());
    const d04 = pub.decisions.find((row) => row.id === "D-2026-09-11-04");
    assert.equal(d04?.attestationStatus, "web2_only");
    assert.equal(d04?.hederaMessageId, null);
    assert.equal(d04?.fingerprint, null);
    assert.equal(d04?.memoHash, null);
    assert.equal(d04?.memoAt, null);
    assert.equal(publishedAllocationSum(pub.nodes), 0);
    const d03 = pub.decisions.find((row) => row.id === "D-2026-09-11-03");
    assert.match(d03?.question ?? "", /\[size omitted\]/);
    assert.ok(!/\$35/.test(d03?.question ?? ""));
    assert.equal(
      redactPublicMemoText("Approve PWR $35 and 27,772 XRP"),
      "Approve PWR [size omitted] and [units omitted]",
    );
  });

  it("public API shape never includes outcomes, evidence, or dollar sizes", () => {
    const filled = LOCKED_DECISIONS_2026_09_11.map((row) =>
      row.id === "D-2026-09-11-03"
        ? { ...row, outcome: "PWR $35 and VRT $17 FILLED at Monday open." }
        : row,
    );
    const pub = toPublicDecisions(filled);
    const blob = JSON.stringify(pub);
    assert.ok(!blob.includes("$35"));
    assert.ok(!blob.includes("FILLED"));
    assert.ok(!/"outcome"/.test(blob));
    assert.ok(!/"evidence"/.test(blob));
    const d03 = pub.find((row) => row.id === "D-2026-09-11-03");
    assert.match(d03?.question ?? "", /\[size omitted\]/);
  });
});
