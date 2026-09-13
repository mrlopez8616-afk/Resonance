import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  applyAttestationWitness,
  assertAttestationEligible,
  AttestationError,
  attestDecision,
  parseAttestRequestBody,
} from "./hedera-attest";
import { DEFAULT_HEDERA_OPERATOR_ID, readHederaConfig } from "./hedera-config";
import { hederaExplorerUrl } from "./hedera-explorer";
import type { Decision } from "./types";

function locked(id: string): Decision {
  const row = LOCKED_DECISIONS_2026_09_11.find((item) => item.id === id);
  assert.ok(row, id);
  return row;
}

describe("hedera attestation eligibility and transitions", () => {
  it("allows decided and superseded chain-class rows", () => {
    assert.doesNotThrow(() => assertAttestationEligible(locked("D-2026-09-11-04")));
    assert.doesNotThrow(() => assertAttestationEligible(locked("D-2026-09-11-02")));
  });

  it("blocks pending rows", () => {
    const pending: Decision = { ...locked("D-2026-09-11-04"), status: "pending" };
    assert.throws(() => assertAttestationEligible(pending), /decided or superseded/);
  });

  it("blocks sensor beeps until operator ack", () => {
    const beep: Decision = {
      ...locked("D-2026-09-11-04"),
      attestationStatus: "pending_operator_ack",
    };
    assert.throws(() => assertAttestationEligible(beep), /operator views and acks/);
  });

  it("applyAttestationWitness sets hashgraph_attested and ids", () => {
    const next = applyAttestationWitness(locked("D-2026-09-11-01"), {
      fingerprint: "abc",
      hederaMessageId: "0.0.123/1",
      attestedAt: "2026-09-12T20:00:00.000Z",
    });
    assert.equal(next.attestationStatus, "hashgraph_attested");
    assert.equal(next.hederaMessageId, "0.0.123/1");
    assert.equal(next.attestedAt, "2026-09-12T20:00:00.000Z");
    assert.equal(next.fingerprint, "abc");
    assert.equal(next.id, "D-2026-09-11-01");
    assert.match(next.outcome, /queued ≠ filled|Queued ≠ filled/);
  });
});

describe("hedera attest request + modes", () => {
  it("parses id aliases and rejects a bad attestedAt", () => {
    assert.equal(parseAttestRequestBody({ decisionId: " D-2026-09-11-04 " }).id, "D-2026-09-11-04");
    assert.throws(
      () => parseAttestRequestBody({ id: "D-1", attestedAt: "not-a-date" }),
      /ISO date/,
    );
    assert.throws(() => parseAttestRequestBody({}), /id is required/);
  });

  it("manual mode marks attested without calling submit", async () => {
    let called = false;
    const result = await attestDecision({
      decision: locked("D-2026-09-11-04"),
      request: {
        id: "D-2026-09-11-04",
        hederaMessageId: "0.0.999/3",
        attestedAt: "2026-09-12T21:00:00.000Z",
      },
      config: readHederaConfig({}),
      submit: async () => {
        called = true;
        return {
          topicId: "0.0.1",
          topicCreated: false,
          messageId: "should-not-use",
          transactionId: "nope",
        };
      },
    });
    assert.equal(called, false);
    assert.equal(result.mode, "manual");
    assert.equal(result.decision.attestationStatus, "hashgraph_attested");
    assert.equal(result.decision.hederaMessageId, "0.0.999/3");
    assert.match(result.decision.fingerprint ?? "", /^[a-f0-9]{64}$/);
  });

  it("live mode uses a mocked HCS submit and creates a topic when missing", async () => {
    const result = await attestDecision({
      decision: locked("D-2026-09-11-01"),
      request: { id: "D-2026-09-11-01" },
      config: readHederaConfig({
        HEDERA_OPERATOR_KEY: "not-a-real-key",
        HEDERA_OPERATOR_ID: DEFAULT_HEDERA_OPERATOR_ID,
      }),
      now: "2026-09-12T22:00:00.000Z",
      submit: async (input) => {
        assert.equal(input.topicId, null);
        const parsed = JSON.parse(input.message) as {
          v: number;
          decisionId: string;
          fingerprint: string;
        };
        assert.equal(parsed.v, 1);
        assert.equal(parsed.decisionId, "D-2026-09-11-01");
        assert.ok(!input.message.includes("$"));
        return {
          topicId: "0.0.555",
          topicCreated: true,
          messageId: "0.0.555/1",
          transactionId: "0.0.10506907@1.2",
        };
      },
    });
    assert.equal(result.mode, "live");
    assert.equal(result.topicCreated, true);
    assert.equal(result.topicId, "0.0.555");
    assert.equal(result.decision.attestationStatus, "hashgraph_attested");
    assert.equal(result.decision.hederaMessageId, "0.0.555/1");
    assert.equal(result.decision.attestedAt, "2026-09-12T22:00:00.000Z");
  });

  it("returns 503 when live submit is requested without a key", async () => {
    await assert.rejects(
      () =>
        attestDecision({
          decision: locked("D-2026-09-11-04"),
          request: { id: "D-2026-09-11-04" },
          config: readHederaConfig({}),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttestationError);
        assert.equal(error.status, 503);
        assert.match(error.message, /HEDERA_OPERATOR_KEY/);
        return true;
      },
    );
  });
});

describe("hedera explorer urls", () => {
  it("builds HashScan links for topic messages and transaction ids", () => {
    assert.equal(
      hederaExplorerUrl("testnet", "0.0.555/1"),
      "https://hashscan.io/testnet/topic/0.0.555/1",
    );
    assert.equal(
      hederaExplorerUrl("testnet", "0.0.10506907@1757700000.123456789"),
      "https://hashscan.io/testnet/transaction/0.0.10506907-1757700000-123456789",
    );
  });
});
