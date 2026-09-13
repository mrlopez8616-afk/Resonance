import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fingerprintPublicDecision } from "./hedera-fingerprint";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  buildR1Memo,
  encodeMemoDataHex,
  fingerprintPrefix16,
  XrplMemoError,
} from "./xrpl-memo";

const FINGERPRINT = "a".repeat(64);

describe("R1 XRPL memo builder", () => {
  it("builds the ASCII pointer and hex MemoData with a 16-char fingerprint prefix", () => {
    const memo = buildR1Memo({
      decisionId: "D-2026-09-11-04",
      hederaMessageId: "0.0.10513997/1",
      fingerprint: FINGERPRINT,
    });
    assert.equal(
      memo,
      `R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=${"a".repeat(16)}|net=testnet`,
    );
    assert.equal(fingerprintPrefix16(FINGERPRINT), "a".repeat(16));
    assert.equal(encodeMemoDataHex(memo), Buffer.from(memo, "ascii").toString("hex").toUpperCase());
    assert.ok(!memo.includes("$"));
    assert.ok(!memo.includes("outcome"));
    assert.ok(!memo.includes("evidence"));
    assert.ok(!memo.toLowerCase().includes("seed"));
    assert.ok(!memo.toLowerCase().includes("vault"));
    assert.ok(!memo.toLowerCase().includes("xaman"));
    assert.match(memo, /^[\x20-\x7E]+$/);
  });

  it("uses the public fingerprint prefix from an attested-shaped D-04 row", () => {
    const d04 = LOCKED_DECISIONS_2026_09_11.find((row) => row.id === "D-2026-09-11-04");
    assert.ok(d04);
    const { fingerprint } = fingerprintPublicDecision(d04);
    const memo = buildR1Memo({
      decisionId: d04.id,
      hederaMessageId: "0.0.555/1",
      fingerprint,
    });
    assert.equal(memo.includes(fingerprint.slice(0, 16)), true);
    assert.equal(memo.includes(fingerprint), false);
    assert.ok(!memo.includes("$"));
    assert.ok(!memo.includes("35"));
    assert.ok(!memo.includes("Xaman"));
  });

  it("rejects money leakage, unsafe tokens, and mainnet", () => {
    assert.throws(
      () =>
        buildR1Memo({
          decisionId: "D-$35",
          hederaMessageId: "0.0.1/1",
          fingerprint: FINGERPRINT,
        }),
      XrplMemoError,
    );
    assert.throws(
      () =>
        buildR1Memo({
          decisionId: "D-04|outcome=filled",
          hederaMessageId: "0.0.1/1",
          fingerprint: FINGERPRINT,
        }),
      /safe R1 token/,
    );
    assert.throws(
      () =>
        buildR1Memo({
          decisionId: "D-2026-09-11-04",
          hederaMessageId: "0.0.1/1",
          fingerprint: FINGERPRINT,
          network: "mainnet",
        }),
      /Testnet only/,
    );
    assert.throws(() => fingerprintPrefix16("not-hex"), /hex/);
  });
});
