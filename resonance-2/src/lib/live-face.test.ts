import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
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

  it("labels PWR and ETN shares and crypto tokens", () => {
    assert.equal(faceUnitWord("PWR"), "shares");
    assert.equal(faceUnitWord("ETN"), "shares");
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

  it("keeps ETN Agentic qty as TBD instead of inventing a lot", () => {
    assert.equal(formatSleeveQuantity("TBD"), "TBD");

    const face = assembleLiveFace("ETN", ETN_SLEEVES, {
      usd: 400,
      source: "test",
      fetchedAt: "2026-09-20T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "shares");
    assert.equal(face.totalUnitsLabel, "TBD");
    assert.equal(face.totalUsdLabel, "—");
    assert.equal(face.sleeves[0]?.quantity, "TBD");
    assert.equal(face.sleeves[0]?.quantityLabel, "TBD");
    assert.equal(face.sleeves.length, 1);
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
    assert.equal(face.priceLabel, "$400.000");
  });
});
