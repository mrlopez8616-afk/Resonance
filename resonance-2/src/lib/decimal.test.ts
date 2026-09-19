import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDecimal, isDecimalString, subtractDecimal } from "./decimal";

describe("decimal-string math", () => {
  it("adds and subtracts without float drift", () => {
    assert.equal(addDecimal("8.931", "16.931"), "25.862");
    assert.equal(subtractDecimal("51.601", "10"), "41.601");
    assert.equal(addDecimal("778.178708", "0.000001"), "778.178709");
    assert.equal(subtractDecimal("33.7", "16.8"), "16.9");
  });

  it("strips trailing zeros", () => {
    assert.equal(addDecimal("1.50", "0.50"), "2");
    assert.equal(subtractDecimal("2.000", "0.001"), "1.999");
  });

  it("accepts integer and decimal strings only", () => {
    assert.equal(isDecimalString("8.931"), true);
    assert.equal(isDecimalString("10"), true);
    assert.equal(isDecimalString("REPLACE-WITH-FILLED-QTY"), false);
    assert.equal(isDecimalString(""), false);
  });
});
