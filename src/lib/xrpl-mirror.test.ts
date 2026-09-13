import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import { DEFAULT_XRPL_ACCOUNT, readXrplConfig } from "./xrpl-config";
import { buildR1Memo } from "./xrpl-memo";
import {
  applyXrplMirrorWitness,
  assertXrplMirrorEligible,
  mirrorDecisionOnXrpl,
  parseXrplMirrorRequestBody,
  XrplMirrorError,
} from "./xrpl-mirror";
import type { Decision } from "./types";

function attestedD04(): Decision {
  const row = LOCKED_DECISIONS_2026_09_11.find((item) => item.id === "D-2026-09-11-04");
  assert.ok(row);
  return {
    ...row,
    attestationStatus: "hashgraph_attested",
    hederaMessageId: "0.0.10513997/1",
    fingerprint: "ab".repeat(32),
    attestedAt: "2026-09-12T22:00:00.000Z",
  };
}

describe("xrpl mirror eligibility and transitions", () => {
  it("allows a hashgraph_attested row with witness ids", () => {
    assert.doesNotThrow(() => assertXrplMirrorEligible(attestedD04()));
  });

  it("blocks rows that are not yet Hedera-attested", () => {
    const locked = LOCKED_DECISIONS_2026_09_11.find((item) => item.id === "D-2026-09-11-04");
    assert.ok(locked);
    assert.throws(() => assertXrplMirrorEligible(locked), /after Hedera attest/);
    assert.throws(
      () =>
        assertXrplMirrorEligible({
          ...attestedD04(),
          attestationStatus: "pending_operator_ack",
        }),
      /operator acks/,
    );
  });

  it("applyXrplMirrorWitness stores the pointer and leaves Hedera fields alone", () => {
    const next = applyXrplMirrorWitness(attestedD04(), {
      xrplTxHash: "C".repeat(64),
      xrplMemoAt: "2026-09-13T03:00:00.000Z",
    });
    assert.equal(next.xrplTxHash, "C".repeat(64));
    assert.equal(next.xrplMemoAt, "2026-09-13T03:00:00.000Z");
    assert.equal(next.attestationStatus, "hashgraph_attested");
    assert.equal(next.hederaMessageId, "0.0.10513997/1");
    assert.equal(next.fingerprint, "ab".repeat(32));
    assert.match(next.outcome, /queued ≠ filled|Queued ≠ filled|QUEUED/);
  });
});

describe("xrpl mirror request + modes", () => {
  it("parses id aliases and rejects a bad xrplMemoAt", () => {
    assert.equal(
      parseXrplMirrorRequestBody({ decisionId: " D-2026-09-11-04 " }).id,
      "D-2026-09-11-04",
    );
    assert.throws(
      () => parseXrplMirrorRequestBody({ id: "D-1", xrplMemoAt: "not-a-date" }),
      /ISO date/,
    );
    assert.throws(() => parseXrplMirrorRequestBody({}), /id is required/);
  });

  it("manual mode records a hash without calling submit", async () => {
    let called = false;
    const result = await mirrorDecisionOnXrpl({
      decision: attestedD04(),
      request: {
        id: "D-2026-09-11-04",
        xrplTxHash: "B".repeat(64),
        xrplMemoAt: "2026-09-13T04:00:00.000Z",
      },
      config: readXrplConfig({}),
      submit: async () => {
        called = true;
        return { txHash: "should-not-use" };
      },
    });
    assert.equal(called, false);
    assert.equal(result.mode, "manual");
    assert.equal(result.decision.xrplTxHash, "B".repeat(64));
    assert.equal(result.decision.attestationStatus, "hashgraph_attested");
    assert.equal(
      result.memo,
      buildR1Memo({
        decisionId: "D-2026-09-11-04",
        hederaMessageId: "0.0.10513997/1",
        fingerprint: "ab".repeat(32),
      }),
    );
    assert.ok(!result.memo.includes("$"));
  });

  it("live mode uses a mocked self-payment submit", async () => {
    const result = await mirrorDecisionOnXrpl({
      decision: attestedD04(),
      request: { id: "D-2026-09-11-04" },
      config: readXrplConfig({
        XRPL_SEED: "not-a-real-seed",
        XRPL_ACCOUNT: DEFAULT_XRPL_ACCOUNT,
      }),
      now: "2026-09-13T05:00:00.000Z",
      submit: async (input) => {
        assert.equal(input.account, DEFAULT_XRPL_ACCOUNT);
        assert.equal(
          input.memo,
          "R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=abababababababab|net=testnet",
        );
        assert.ok(!input.memo.includes("$"));
        assert.ok(!input.memo.toLowerCase().includes("seed"));
        return { txHash: "D".repeat(64) };
      },
    });
    assert.equal(result.mode, "live");
    assert.equal(result.decision.xrplTxHash, "D".repeat(64));
    assert.equal(result.decision.xrplMemoAt, "2026-09-13T05:00:00.000Z");
    assert.equal(result.decision.hederaMessageId, "0.0.10513997/1");
  });

  it("returns 503 when live submit is requested without a seed", async () => {
    await assert.rejects(
      () =>
        mirrorDecisionOnXrpl({
          decision: attestedD04(),
          request: { id: "D-2026-09-11-04" },
          config: readXrplConfig({}),
        }),
      (error: unknown) => {
        assert.ok(error instanceof XrplMirrorError);
        assert.equal(error.status, 503);
        assert.match(error.message, /XRPL_SEED/);
        return true;
      },
    );
  });

  it("rejects a mainnet-configured live submit", async () => {
    await assert.rejects(
      () =>
        mirrorDecisionOnXrpl({
          decision: attestedD04(),
          request: { id: "D-2026-09-11-04" },
          config: readXrplConfig({
            XRPL_NETWORK: "mainnet",
            XRPL_SEED: "super-secret-family-seed-do-not-leak",
          }),
          submit: async () => ({ txHash: "nope" }),
        }),
      (error: unknown) => {
        assert.ok(error instanceof XrplMirrorError);
        assert.equal(error.status, 503);
        assert.match(error.message, /mainnet/i);
        assert.ok(!error.message.includes("super-secret"));
        return true;
      },
    );
  });
});
