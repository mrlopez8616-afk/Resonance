import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GATE_MAX_AGE_SECONDS,
  passwordsMatch,
  signGateToken,
  verifyGateToken,
} from "./app-gate-crypto";

describe("app password gate", () => {
  it("accepts the matching password", () => {
    assert.equal(passwordsMatch("correct-horse", "correct-horse"), true);
  });

  it("rejects a wrong password", () => {
    assert.equal(passwordsMatch("nope", "correct-horse"), false);
  });

  it("round-trips a signed cookie token", () => {
    const token = signGateToken("secret", 1_000_000);
    assert.equal(verifyGateToken("secret", token, 1_000_000), true);
  });

  it("rejects a token signed with another password", () => {
    const token = signGateToken("secret", 1_000_000);
    assert.equal(verifyGateToken("other", token, 1_000_000), false);
  });

  it("rejects an expired token", () => {
    const token = signGateToken("secret", 1_000_000);
    const later = 1_000_000 + (GATE_MAX_AGE_SECONDS + 1) * 1000;
    assert.equal(verifyGateToken("secret", token, later), false);
  });

  it("rejects garbage tokens", () => {
    assert.equal(verifyGateToken("secret", "not-a-token"), false);
    assert.equal(verifyGateToken("secret", undefined), false);
    assert.equal(verifyGateToken("secret", ""), false);
  });
});
