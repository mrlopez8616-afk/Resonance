import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import {
  assembleLiveFace,
  faceUnitWord,
  formatSleeveQuantity,
  formatTotalUnits,
} from "./live-face";

describe("live face units", () => {
  it("keeps the founder PWR share print instead of rounding to 0.002", () => {
    assert.equal(formatSleeveQuantity("0.001578"), "0.001578");
    assert.equal(formatTotalUnits(0.001578), "0.001578");
    assert.equal(formatSleeveQuantity("8.931"), "8.931");
    assert.equal(formatSleeveQuantity("33.7"), "33.7");
  });

  it("labels PWR shares and crypto tokens", () => {
    assert.equal(faceUnitWord("PWR"), "shares");
    assert.equal(faceUnitWord("XRP"), "tokens");
    assert.equal(faceUnitWord("SUI"), "tokens");

    const face = assembleLiveFace("PWR", PWR_SLEEVES, {
      usd: 636.5,
      source: "test",
      fetchedAt: "2026-09-19T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "shares");
    assert.equal(face.totalUnitsLabel, "0.001578");
    assert.equal(face.sleeves[0]?.quantity, "0.001578");
    assert.equal(face.sleeves.length, 1);
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
  });
});
