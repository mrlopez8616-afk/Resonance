import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CEG_SLEEVES } from "@/data/ceg-sleeves";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { GEV_SLEEVES } from "@/data/gev-sleeves";
import { HBAR_SLEEVES } from "@/data/hbar-sleeves";
import { HUBB_SLEEVES } from "@/data/hubb-sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { VRT_SLEEVES } from "@/data/vrt-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
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
    assert.equal(formatSleeveQuantity("0.002640"), "0.002640");
    assert.equal(formatSleeveQuantity("0.009617"), "0.009617");
    assert.equal(formatSleeveQuantity("0.005566"), "0.005566");
    assert.equal(formatSleeveQuantity("0"), "0");
    assert.equal(formatSleeveQuantity("8.931"), "8.931");
    assert.equal(formatSleeveQuantity("33.7"), "33.7");
    assert.equal(formatSleeveQuantity("51.601"), "51.601");
    assert.equal(formatTotalUnits(28332.601), "28,332.601");
    assert.equal(formatSleeveQuantity("28281"), "28,281");
    assert.equal(formatSleeveQuantity("3846.51"), "3,846.51");
    assert.equal(formatSleeveQuantity("1910.31"), "1,910.31");
    assert.equal(formatSleeveQuantity("7809.65"), "7,809.65");
    assert.equal(formatSleeveQuantity("7847.91"), "7,847.91");
    assert.equal(formatTotalUnits(3846.51), "3,846.51");
    assert.equal(formatTotalUnits(1910.31), "1,910.31");
    assert.equal(formatTotalUnits(7809.65), "7,809.65");
    assert.equal(formatTotalUnits(7847.91), "7,847.91");
    assert.equal(formatTotalUnits(0), "0");
  });

  it("labels equity faces shares and crypto tokens", () => {
    assert.equal(faceUnitWord("PWR"), "shares");
    assert.equal(faceUnitWord("ETN"), "shares");
    assert.equal(faceUnitWord("VRT"), "shares");
    assert.equal(faceUnitWord("GEV"), "shares");
    assert.equal(faceUnitWord("CEG"), "shares");
    assert.equal(faceUnitWord("HUBB"), "shares");
    assert.equal(faceUnitWord("NVDA"), "shares");
    assert.equal(faceUnitWord("TSM"), "shares");
    assert.equal(faceUnitWord("TSLA"), "shares");
    assert.equal(faceUnitWord("SPCX"), "shares");
    assert.equal(faceUnitWord("XRP"), "tokens");
    assert.equal(faceUnitWord("SUI"), "tokens");
    assert.equal(faceUnitWord("HBAR"), "tokens");

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

  it("locks GEV CEG HUBB Agentic at the 2026-09-21 hub prints", () => {
    const gev = assembleLiveFace("GEV", GEV_SLEEVES, {
      usd: 600,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(gev.unitsWord, "shares");
    assert.equal(gev.totalUnitsLabel, "0.002640");
    assert.equal(gev.sleeves[0]?.quantity, "0.002640");
    assert.equal(gev.sleeves[0]?.quantityLabel, "0.002640");
    assert.equal(gev.sleeves.length, 1);
    assert.equal(gev.sleeves[0]?.id, "rh-agentic");

    const ceg = assembleLiveFace("CEG", CEG_SLEEVES, {
      usd: 300,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(ceg.unitsWord, "shares");
    assert.equal(ceg.totalUnitsLabel, "0.009617");
    assert.equal(ceg.sleeves[0]?.quantity, "0.009617");
    assert.equal(ceg.sleeves.length, 1);
    assert.equal(ceg.sleeves[0]?.id, "rh-agentic");

    const hubb = assembleLiveFace("HUBB", HUBB_SLEEVES, {
      usd: 450,
      source: "test",
      fetchedAt: "2026-09-21T00:00:00.000Z",
    });
    assert.equal(hubb.unitsWord, "shares");
    assert.equal(hubb.totalUnitsLabel, "0.005566");
    assert.equal(hubb.sleeves[0]?.quantity, "0.005566");
    assert.equal(hubb.sleeves.length, 1);
    assert.equal(hubb.sleeves[0]?.id, "rh-agentic");
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

  it("paints the HBAR Agentic token print without rounding it away", () => {
    const hbar = assembleLiveFace("HBAR", HBAR_SLEEVES, {
      usd: 0.12,
      source: "test",
      fetchedAt: "2026-09-29T00:00:00.000Z",
    });
    assert.equal(hbar.unitsWord, "tokens");
    assert.equal(hbar.sleeves.length, 1);
    assert.equal(hbar.sleeves[0]?.id, "rh-agentic");
    assert.equal(hbar.sleeves[0]?.quantity, "0");
    assert.equal(hbar.sleeves[0]?.quantityLabel, "0");
    assert.equal(hbar.totalUnits, 0);
    assert.equal(hbar.totalUnitsLabel, "0");
    assert.equal(hbar.priceLabel, "$0.120");
    assert.equal(hbar.totalUnitsLabel.includes("NaN"), false);
  });

  it("keeps the XRP vault integer and the Agentic lot after Main and Coinbase closed", () => {
    const face = assembleLiveFace("XRP", XRP_SLEEVES, {
      usd: 1.2,
      source: "test",
      fetchedAt: "2026-09-30T00:00:00.000Z",
    });
    assert.deepEqual(
      face.sleeves.map((row) => row.id),
      ["rh-agentic", "flare-vault"],
    );
    assert.equal(
      face.sleeves.find((row) => row.id === "rh-agentic")?.quantity,
      "51.601",
    );
    assert.equal(
      face.sleeves.find((row) => row.id === "rh-agentic")?.quantityLabel,
      "51.601",
    );
    assert.equal(
      face.sleeves.find((row) => row.id === "flare-vault")?.quantity,
      "28281",
    );
    assert.equal(
      face.sleeves.find((row) => row.id === "flare-vault")?.quantityLabel,
      "28,281",
    );
    assert.equal(face.sleeves.some((row) => row.id === "rh-main"), false);
    assert.equal(face.sleeves.some((row) => row.id === "coinbase"), false);
    assert.equal(face.totalUnitsLabel, "28,332.601");
  });
});
