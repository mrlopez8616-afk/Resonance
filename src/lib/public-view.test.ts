import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeedState } from "./seed";
import { publishedAllocationSum, toPublicSkeleton } from "./public-view";

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
    assert.equal(publishedAllocationSum(pub.nodes), 0);
  });
});
