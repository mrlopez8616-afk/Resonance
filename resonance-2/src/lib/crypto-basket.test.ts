import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cryptoBasketValues,
  dailyCloses,
  heldCryptoQuantities,
  marketChartPoints,
  type DailyClose,
} from "@/lib/crypto-basket";

function close(day: string, usd: number): DailyClose {
  return { day, usd };
}

describe("crypto basket history", () => {
  it("drops a day when any held asset is missing a close", () => {
    const values = cryptoBasketValues([
      {
        quantity: 2,
        closes: [close("2026-10-01", 1), close("2026-10-02", 2), close("2026-10-03", 3)],
      },
      {
        quantity: 4,
        closes: [close("2026-10-01", 10), close("2026-10-03", 30)],
      },
    ]);
    assert.deepEqual(values, [42, 126]);
  });

  it("does not fill a gap from the previous close", () => {
    const values = cryptoBasketValues([
      {
        quantity: 1,
        closes: [close("2026-10-01", 1), close("2026-10-03", 3)],
      },
      {
        quantity: 1,
        closes: [close("2026-10-01", 5), close("2026-10-02", 5), close("2026-10-03", 5)],
      },
    ]);
    assert.deepEqual(values, [6, 8]);
  });

  it("hides the chart when history is empty or too short to draw", () => {
    assert.equal(cryptoBasketValues([]), null);
    assert.equal(cryptoBasketValues([{ quantity: 2, closes: [] }]), null);
    assert.equal(cryptoBasketValues([{ quantity: 2, closes: [close("2026-10-01", 1)] }]), null);
    assert.equal(
      cryptoBasketValues([
        { quantity: 2, closes: [close("2026-10-01", 1), close("2026-10-02", 2)] },
        { quantity: 4, closes: [] },
      ]),
      null,
    );
    assert.equal(
      cryptoBasketValues([
        { quantity: 0, closes: [close("2026-10-01", 1), close("2026-10-02", 2)] },
        { quantity: Number.NaN, closes: [close("2026-10-01", 1), close("2026-10-02", 2)] },
      ]),
      null,
    );
  });

  it("ignores a flat or unheld leg when deciding which days exist", () => {
    const values = cryptoBasketValues([
      {
        quantity: 2,
        closes: [close("2026-10-01", 1), close("2026-10-02", 3)],
      },
      {
        quantity: 0,
        closes: [close("2026-10-01", 9)],
      },
    ]);
    assert.deepEqual(values, [2, 6]);
  });

  it("keeps the last real print of a UTC day and skips invalid rows", () => {
    const points = marketChartPoints({
      prices: [
        [Date.parse("2026-10-01T01:00:00.000Z"), 1],
        [Date.parse("2026-10-01T23:00:00.000Z"), 2],
        [Date.parse("2026-10-02T00:30:00.000Z"), 4],
        [Date.parse("2026-10-02T05:00:00.000Z"), 0],
        [Date.parse("2026-10-03T00:00:00.000Z"), Number.NaN],
      ],
    });
    assert.deepEqual(dailyCloses(points), [
      { day: "2026-10-01", usd: 2 },
      { day: "2026-10-02", usd: 4 },
    ]);
    assert.deepEqual(dailyCloses([]), []);
  });

  it("uses the card quantity and does not add a second vault principal", () => {
    const cardQuantity = 51.601 + 28281;
    assert.deepEqual(
      heldCryptoQuantities([
        { id: "xrp", ticker: "XRP", quantity: cardQuantity, totalUsd: cardQuantity * 1.4 },
        { id: "sui", ticker: "SUI", quantity: 0.0001, totalUsd: 0 },
        { id: "hbar", ticker: "HBAR", quantity: Number.NaN, totalUsd: null },
        { id: "pwr", ticker: "PWR", quantity: 3, totalUsd: 100 },
      ]),
      [{ id: "xrp", ticker: "XRP", quantity: cardQuantity }],
    );
    assert.deepEqual(
      heldCryptoQuantities([{ id: "hbar", ticker: "HBAR", quantity: 10, totalUsd: null }]),
      [{ id: "hbar", ticker: "HBAR", quantity: 10 }],
    );
  });
});
