import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { FillIngestError, parseFillEvent } from "./fill-event";
import {
  applyFillToSleevePrints,
  applyQuantityDelta,
  mergeSleeveBook,
  sanitizeSleevePrints,
} from "./sleeve-apply";

function event(overrides: Record<string, unknown> = {}) {
  return parseFillEvent({
    venue: "robinhood",
    orderId: "order-1",
    ticker: "SUI",
    side: "buy",
    qty: "2",
    price: "1.10",
    sleeve: "rh-agentic",
    filledAt: "2026-09-21T08:30:00-05:00",
    ...overrides,
  });
}

describe("sleeve apply", () => {
  it("buy increases and sell decreases the named print", () => {
    assert.equal(applyQuantityDelta("8.931", "buy", "2"), "10.931");
    assert.equal(applyQuantityDelta("51.601", "sell", "10"), "41.601");

    const bought = applyFillToSleevePrints({}, event());
    assert.equal(bought.applied, true);
    assert.equal(bought.nextQuantity, "2");
    assert.equal(bought.prints.SUI?.["rh-agentic"], "2");

    const sold = applyFillToSleevePrints(bought.prints, event({
      orderId: "order-2",
      side: "sell",
      qty: "1",
    }));
    assert.equal(sold.nextQuantity, "1");
  });

  it("refuses a Coinbase fill on XRP after that lot was removed", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "XRP",
            qty: "1",
          }),
        ),
      /sleeve coinbase is not on the XRP face/,
    );
    const cleaned = sanitizeSleevePrints({
      XRP: { coinbase: "778.178708", "rh-agentic": "51.601" },
    });
    assert.equal(cleaned.XRP?.coinbase, undefined);
    assert.equal(cleaned.XRP?.["rh-agentic"], "51.601");
  });

  it("refuses an RH Main fill on XRP after that lot was removed", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            ticker: "XRP",
            sleeve: "rh-main",
            qty: "1",
          }),
        ),
      /sleeve rh-main is not on the XRP face/,
    );
    const cleaned = sanitizeSleevePrints({
      XRP: { "rh-main": "587.718", "rh-agentic": "51.601" },
    });
    assert.equal(cleaned.XRP?.["rh-main"], undefined);
    assert.equal(cleaned.XRP?.["rh-agentic"], "51.601");
  });

  it("updates Coinbase from a Coinbase fill", () => {
    const result = applyFillToSleevePrints(
      {},
      event({
        venue: "coinbase",
        sleeve: "coinbase",
        ticker: "SUI",
        qty: "1.3",
      }),
    );
    assert.equal(result.prints.SUI?.coinbase, "35");
  });

  it("refuses flare-vault and other manual sleeves at apply time", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          {
            ...event(),
            sleeve: "flare-vault" as never,
            ticker: "XRP",
          },
        ),
      (error: unknown) =>
        error instanceof FillIngestError && /flare-vault/.test(error.message),
    );
  });

  it("refuses inventing rh-main on SUI", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          {
            ...event(),
            sleeve: "rh-main",
            ticker: "SUI",
          },
        ),
      /not on the SUI face/,
    );
  });

  it("applies RH Agentic fills to the live PWR equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "PWR", sleeve: "rh-agentic", qty: "0.0001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.004017");
    assert.equal(result.prints.PWR?.["rh-agentic"], "0.004017");
  });

  it("refuses inventing coinbase on PWR", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "PWR",
          }),
        ),
      /not on the PWR face/,
    );
  });

  it("applies RH Agentic fills to ETN from the 2026-09-21 seed", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "ETN", sleeve: "rh-agentic", qty: "0.001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.006844");
    assert.equal(result.prints.ETN?.["rh-agentic"], "0.006844");
  });

  it("applies RH Agentic fills to the live VRT equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "VRT", sleeve: "rh-agentic", qty: "0.0001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.010091");
    assert.equal(result.prints.VRT?.["rh-agentic"], "0.010091");
  });

  it("refuses inventing coinbase on VRT", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "VRT",
          }),
        ),
      /not on the VRT face/,
    );
  });

  it("refuses inventing rh-main on VRT", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "VRT", sleeve: "rh-main" }),
        ),
      /not on the VRT face/,
    );
  });

  it("applies RH Agentic fills to the live GEV equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "GEV", sleeve: "rh-agentic", qty: "0.0001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.00274");
    assert.equal(result.prints.GEV?.["rh-agentic"], "0.00274");
  });

  it("refuses inventing coinbase on GEV", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "GEV",
          }),
        ),
      /not on the GEV face/,
    );
  });

  it("refuses inventing rh-main on GEV", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "GEV", sleeve: "rh-main" }),
        ),
      /not on the GEV face/,
    );
  });

  it("applies RH Agentic fills to the live CEG equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "CEG", sleeve: "rh-agentic", qty: "0.0001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.009717");
    assert.equal(result.prints.CEG?.["rh-agentic"], "0.009717");
  });

  it("refuses inventing coinbase on CEG", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "CEG",
          }),
        ),
      /not on the CEG face/,
    );
  });

  it("refuses inventing rh-main on CEG", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "CEG", sleeve: "rh-main" }),
        ),
      /not on the CEG face/,
    );
  });

  it("applies RH Agentic fills to the live HUBB equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "HUBB", sleeve: "rh-agentic", qty: "0.0001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.005666");
    assert.equal(result.prints.HUBB?.["rh-agentic"], "0.005666");
  });

  it("refuses inventing coinbase on HUBB", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "HUBB",
          }),
        ),
      /not on the HUBB face/,
    );
  });

  it("applies RH Agentic fills to the live HBAR book", () => {
    const hbar = applyFillToSleevePrints(
      {},
      event({ ticker: "HBAR", sleeve: "rh-agentic", qty: "0.01" }),
    );
    assert.equal(hbar.applied, true);
    assert.equal(hbar.prints.HBAR?.["rh-agentic"], "7847.92");
  });

  it("refuses inventing rh-main on HBAR and does not invent an XLM book", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "HBAR", sleeve: "rh-main" }),
        ),
      /not on the HBAR face/,
    );
    assert.throws(
      () =>
        event({
          orderId: "new-xlm-order",
          ticker: "XLM",
          sleeve: "rh-agentic",
        }),
      /locked nodes/,
    );
    const retained = applyFillToSleevePrints(
      {},
      event({
        orderId: "6abbe0e4-575c-4abe-a90e-90368b43a1b6",
        ticker: "XLM",
        sleeve: "rh-agentic",
        qty: "1891.36",
      }),
    );
    assert.equal(retained.applied, false);
    assert.equal(retained.prints.XLM, undefined);
  });

  it("refuses inventing rh-main on HUBB", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "HUBB", sleeve: "rh-main" }),
        ),
      /not on the HUBB face/,
    );
  });

  it("refuses inventing coinbase on ETN", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({
            venue: "coinbase",
            sleeve: "coinbase",
            ticker: "ETN",
          }),
        ),
      /not on the ETN face/,
    );
  });

  it("refuses inventing rh-main on ETN", () => {
    assert.throws(
      () =>
        applyFillToSleevePrints(
          {},
          event({ ticker: "ETN", sleeve: "rh-main" }),
        ),
      /not on the ETN face/,
    );
  });

  it("skips sleeve apply for an offline locked ticker", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "BTC", sleeve: "rh-agentic" }),
    );
    assert.equal(result.applied, false);
    assert.deepEqual(result.prints, {});
  });

  it("never lets a stored flare-vault override reach the face", () => {
    const merged = mergeSleeveBook(
      "XRP",
      {
        XRP: {
          "flare-vault": "1",
          "rh-agentic": "60",
        },
      },
      XRP_SLEEVES,
    );
    const vault = merged.find((row) => row.id === "flare-vault");
    const agentic = merged.find((row) => row.id === "rh-agentic");
    assert.equal(vault?.quantity, "28281");
    assert.equal(vault?.manual, true);
    assert.equal(agentic?.quantity, "60");

    const cleaned = sanitizeSleevePrints({
      XRP: { "flare-vault": "1", "rh-main": "100", "rh-agentic": "51.601" },
    });
    assert.equal(cleaned.XRP?.["flare-vault"], undefined);
    assert.equal(cleaned.XRP?.["rh-main"], undefined);
    assert.equal(cleaned.XRP?.["rh-agentic"], "51.601");
  });
});
