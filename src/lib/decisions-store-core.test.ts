import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import { collectWriteItems } from "./decision-write";
import {
  createEmptyEnvelope,
  createSeededEnvelope,
  decisionsStoreHealth,
  detectDecisionsBackend,
  ensureSeededEnvelope,
  isDecisionsSyncConfigured,
  parseDecisionsEnvelope,
  writeAttestationIntoEnvelope,
  writeDecisionsIntoEnvelope,
} from "./decisions-store-core";

describe("decisions store core", () => {
  it("seeds D-2026-09-11-01..04 when the store is empty", () => {
    const empty = ensureSeededEnvelope(createEmptyEnvelope("2026-09-12T00:00:00.000Z"));
    assert.equal(empty.seeded, true);
    const ids = empty.envelope.decisions.map((row) => row.id);
    assert.deepEqual(ids, [
      "D-2026-09-11-01",
      "D-2026-09-11-02",
      "D-2026-09-11-03",
      "D-2026-09-11-04",
    ]);
    assert.equal(empty.envelope.seededAt, empty.envelope.updatedAt);
  });

  it("does not re-seed a store that already has rows", () => {
    const seeded = createSeededEnvelope("2026-09-12T00:00:00.000Z");
    const again = ensureSeededEnvelope(seeded, "2026-09-13T00:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.decisions.length, 4);
  });

  it("applies a queued→filled patch on the seeded book", () => {
    const { envelope } = ensureSeededEnvelope(null);
    const next = writeDecisionsIntoEnvelope(
      envelope,
      collectWriteItems({
        id: "D-2026-09-11-03",
        outcome: "PWR $35 and VRT $17 FILLED at Monday open.",
      }),
    );
    const row = next.decisions.find((item) => item.id === "D-2026-09-11-03");
    assert.match(row?.outcome ?? "", /FILLED/);
    assert.match(
      LOCKED_DECISIONS_2026_09_11.find((item) => item.id === "D-2026-09-11-03")
        ?.outcome ?? "",
      /QUEUED/,
    );
  });

  it("parses a persisted envelope", () => {
    const parsed = parseDecisionsEnvelope({
      version: 1,
      updatedAt: "2026-09-12T01:00:00.000Z",
      seededAt: "2026-09-12T00:00:00.000Z",
      decisions: [
        {
          id: "D-2026-09-11-01",
          question: "Keep the Monday sells?",
          status: "decided",
        },
      ],
    });
    assert.equal(parsed?.decisions[0]?.id, "D-2026-09-11-01");
    assert.equal(parsed?.decisions[0]?.outcome, "");
  });

  it("picks blob when the token exists, else file locally, else none on Vercel", () => {
    assert.equal(
      detectDecisionsBackend({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }),
      "blob",
    );
    assert.equal(
      detectDecisionsBackend({ RESONANCE_DECISIONS_FILE: "/tmp/decisions.json" }),
      "file",
    );
    assert.equal(detectDecisionsBackend({ VERCEL: "1" }), "none");
    assert.equal(detectDecisionsBackend({}), "file");
    assert.equal(
      isDecisionsSyncConfigured({ BLOB_READ_WRITE_TOKEN: "x" }),
      true,
    );
    assert.equal(isDecisionsSyncConfigured({ VERCEL: "1" }), false);
  });

  it("persists a Testnet topic id next to an attested row", () => {
    const { envelope } = ensureSeededEnvelope(null);
    const row = envelope.decisions[3];
    assert.ok(row);
    const attested = {
      ...row,
      attestationStatus: "hashgraph_attested" as const,
      hederaMessageId: "0.0.555/1",
      attestedAt: "2026-09-12T22:00:00.000Z",
      fingerprint: "abc",
    };
    const next = writeAttestationIntoEnvelope(envelope, attested, "0.0.555");
    assert.equal(next.hederaTopicId, "0.0.555");
    assert.equal(
      next.decisions.find((item) => item.id === row.id)?.attestationStatus,
      "hashgraph_attested",
    );
    const parsed = parseDecisionsEnvelope(JSON.parse(JSON.stringify(next)));
    assert.equal(parsed?.hederaTopicId, "0.0.555");
  });

  it("health payload has counts, not decision text", () => {
    const health = decisionsStoreHealth({
      configured: true,
      backend: "blob",
      writeProtection: "on",
      envelope: createSeededEnvelope(),
    });
    const blob = JSON.stringify(health);
    assert.equal(health.recordCount, 4);
    assert.equal(health.seeded, true);
    assert.ok(!blob.includes("$35"));
    assert.ok(!blob.includes("QUEUED"));
    assert.ok(!blob.includes("outcome"));
  });
});
