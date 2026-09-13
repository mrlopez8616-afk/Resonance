import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  assertNoMoneyLeak,
  buildHcsAttestationMemo,
  buildPublicAttestationRecord,
  fingerprintPublicDecision,
} from "./hedera-fingerprint";
import type { Decision } from "./types";

function locked(id: string): Decision {
  const row = LOCKED_DECISIONS_2026_09_11.find((item) => item.id === id);
  assert.ok(row, id);
  return row;
}

describe("hedera public fingerprint purity", () => {
  it("redacts dollar sizes from D-03 and omits outcome / evidence / rationale", () => {
    const d03 = locked("D-2026-09-11-03");
    assert.match(d03.question, /\$35/);
    assert.match(d03.decision, /\$35/);
    assert.match(d03.outcome, /\$35|\$17/);

    const record = buildPublicAttestationRecord(d03);
    const blob = JSON.stringify(record);
    assert.ok(!blob.includes("$"));
    assert.ok(!blob.includes("35"));
    assert.ok(!blob.includes("17"));
    assert.ok(!/"outcome"/.test(blob));
    assert.ok(!/"evidence"/.test(blob));
    assert.ok(!/"rationale"/.test(blob));
    assert.ok(!/"proposal"/.test(blob));
    assert.match(record.question, /\[size omitted\]/);
    assert.match(record.decision, /\[size omitted\]/);
    assert.equal(record.attestationLadder, "chain_class");
    assert.equal(record.id, "D-2026-09-11-03");
    assertNoMoneyLeak(blob);
  });

  it("HCS memo is only version, decision id, fingerprint, and timestamp", () => {
    const { fingerprint } = fingerprintPublicDecision(locked("D-2026-09-11-04"));
    const { memo, json } = buildHcsAttestationMemo({
      decisionId: "D-2026-09-11-04",
      fingerprint,
      attestedAt: "2026-09-12T20:00:00.000Z",
    });
    assert.deepEqual(Object.keys(memo), ["v", "decisionId", "fingerprint", "attestedAt"]);
    assert.equal(memo.v, 1);
    assert.equal(memo.decisionId, "D-2026-09-11-04");
    assert.match(memo.fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(!json.includes("$"));
    assert.ok(!json.includes("XRP"));
    assert.ok(!json.includes("outcome"));
    assert.ok(!json.includes("Xaman"));
  });

  it("fingerprint is stable for the same public record", () => {
    const d04 = locked("D-2026-09-11-04");
    const first = fingerprintPublicDecision(d04);
    const second = fingerprintPublicDecision({ ...d04, outcome: "PWR $35 FILLED." });
    assert.equal(first.fingerprint, second.fingerprint);
    assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  });

  it("rejects a record that still contains a dollar size", () => {
    assert.throws(() => assertNoMoneyLeak('{"decision":"Buy $35"}'), /dollar or unit/);
  });
});
