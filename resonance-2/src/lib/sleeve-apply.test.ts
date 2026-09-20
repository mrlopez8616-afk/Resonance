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
    assert.equal(bought.nextQuantity, "10.931");
    assert.equal(bought.prints.SUI?.["rh-agentic"], "10.931");

    const sold = applyFillToSleevePrints(bought.prints, event({
      orderId: "order-2",
      side: "sell",
      qty: "1",
    }));
    assert.equal(sold.nextQuantity, "9.931");
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
    assert.equal(result.nextQuantity, "0.001678");
    assert.equal(result.prints.PWR?.["rh-agentic"], "0.001678");
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

  it("applies RH Agentic fills to the live ETN equity book", () => {
    const result = applyFillToSleevePrints(
      {},
      event({ ticker: "ETN", sleeve: "rh-agentic", qty: "0.001" }),
    );
    assert.equal(result.applied, true);
    assert.equal(result.nextQuantity, "0.003374");
    assert.equal(result.prints.ETN?.["rh-agentic"], "0.003374");
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
      event({ ticker: "VRT", sleeve: "rh-agentic" }),
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
    assert.equal(vault?.quantity, "28273");
    assert.equal(vault?.manual, true);
    assert.equal(agentic?.quantity, "60");

    const cleaned = sanitizeSleevePrints({
      XRP: { "flare-vault": "1", "rh-main": "100" },
    });
    assert.equal(cleaned.XRP?.["flare-vault"], undefined);
    assert.equal(cleaned.XRP?.["rh-main"], "100");
  });
});
