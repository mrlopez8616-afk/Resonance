import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { VRT_SLEEVES } from "@/data/vrt-sleeves";
import {
  assembleLiveFace,
  faceUnitWord,
  formatSleeveQuantity,
  formatTotalUnits,
} from "./live-face";

describe("live face units", () => {
  it("keeps post-trade equity share prints instead of rounding to 0.002", () => {
    assert.equal(formatSleeveQuantity("0.003917"), "0.003917");
    assert.equal(formatTotalUnits(0.003917), "0.003917");
    assert.equal(formatSleeveQuantity("0.005844"), "0.005844");
    assert.equal(formatSleeveQuantity("0.009991"), "0.009991");
    assert.equal(formatSleeveQuantity("0"), "0");
    assert.equal(formatSleeveQuantity("8.931"), "8.931");
    assert.equal(formatSleeveQuantity("33.7"), "33.7");
  });

  it("labels PWR ETN VRT shares and crypto tokens", () => {
    assert.equal(faceUnitWord("PWR"), "shares");
    assert.equal(faceUnitWord("ETN"), "shares");
    assert.equal(faceUnitWord("VRT"), "shares");
    assert.equal(faceUnitWord("XRP"), "tokens");
    assert.equal(faceUnitWord("SUI"), "tokens");

    const face = assembleLiveFace("PWR", PWR_SLEEVES, {
      usd: 636.5,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "shares");
    assert.equal(face.totalUnitsLabel, "0.003917");
    assert.equal(face.sleeves[0]?.quantity, "0.003917");
    assert.equal(face.sleeves.length, 1);
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
  });

  it("locks ETN Agentic at the 2026-09-21 hub print instead of TBD", () => {
    const face = assembleLiveFace("ETN", ETN_SLEEVES, {
      usd: 400,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "shares");
    assert.equal(face.totalUnitsLabel, "0.005844");
    assert.equal(face.sleeves[0]?.quantity, "0.005844");
    assert.equal(face.sleeves[0]?.quantityLabel, "0.005844");
    assert.equal(face.sleeves.length, 1);
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
    assert.equal(face.priceLabel, "$400.000");
  });

  it("locks VRT Agentic at 0.009991 shares", () => {
    const face = assembleLiveFace("VRT", VRT_SLEEVES, {
      usd: 150,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "shares");
    assert.equal(face.totalUnitsLabel, "0.009991");
    assert.equal(face.sleeves[0]?.quantity, "0.009991");
    assert.equal(face.sleeves.length, 1);
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
  });

  it("keeps SUI Agentic at 0 after the post-trade sell and Coinbase at 33.7", () => {
    const face = assembleLiveFace("SUI", SUI_SLEEVES, {
      usd: 3.5,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(face.unitsWord, "tokens");
    assert.equal(face.sleeves[0]?.id, "rh-agentic");
    assert.equal(face.sleeves[0]?.quantity, "0");
    assert.equal(face.sleeves[0]?.quantityLabel, "0");
    assert.equal(face.sleeves[1]?.id, "coinbase");
    assert.equal(face.sleeves[1]?.quantity, "33.7");
    assert.equal(face.totalUnitsLabel, "33.700");
  });
});
