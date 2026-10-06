import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleLiveFace } from "./live-face";
import { valueCardFromFace } from "./value-card";

const quote = {
  usd: 1.234,
  source: "test",
  fetchedAt: "2026-10-06T00:00:00.000Z",
};

describe("value card", () => {
  it("puts position value on top and the live price under it", () => {
    const face = assembleLiveFace(
      "XRP",
      [{ id: "book", label: "Book", quantity: "10", source: "robinhood-config", manual: false }],
      quote,
    );
    assert.equal(face.totalUsd, 12.34);
    assert.deepEqual(valueCardFromFace(face), {
      headline: face.totalUsdLabel,
      priceLine: "$1.234 live",
      label: null,
    });
  });

  it("prints a real zero quantity as value, not as no position", () => {
    const face = assembleLiveFace(
      "SUI",
      [{ id: "book", label: "Book", quantity: "0", source: "robinhood-config", manual: false }],
      quote,
    );
    assert.equal(face.totalUsd, 0);
    const card = valueCardFromFace(face);
    assert.equal(card.headline, face.totalUsdLabel);
    assert.equal(card.priceLine, "$1.234 live");
    assert.equal(card.label, null);
  });

  it("does not invent a value when the sleeve list is empty", () => {
    const face = assembleLiveFace("XRP", [], quote);
    assert.equal(face.totalUsd, null);
    assert.deepEqual(valueCardFromFace(face), {
      headline: null,
      priceLine: "$1.234 live",
      label: "no position",
    });
  });

  it("does not invent a value when a quantity cannot be read", () => {
    const face = assembleLiveFace(
      "XRP",
      [{ id: "book", label: "Book", quantity: "TBD", source: "manual", manual: true }],
      quote,
    );
    assert.equal(face.totalUsd, null);
    assert.deepEqual(valueCardFromFace(face), {
      headline: null,
      priceLine: "$1.234 live",
      label: "not connected",
    });
  });

  it("does not call a known quantity with no live price a position gap", () => {
    const face = assembleLiveFace("PWR", [
      { id: "book", label: "Book", quantity: "2", source: "robinhood-config", manual: false },
    ]);
    assert.equal(face.totalUsd, null);
    assert.deepEqual(valueCardFromFace(face), {
      headline: null,
      priceLine: null,
      label: "not connected",
    });
  });

  it("says not connected when neither quantity nor price exists", () => {
    const face = assembleLiveFace("HBAR", []);
    assert.deepEqual(valueCardFromFace(face), {
      headline: null,
      priceLine: null,
      label: "not connected",
    });
  });
});
