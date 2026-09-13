import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBinderSeedStub, fingerprintReportContent } from "./reports";
import {
  createEmptyReportsEnvelope,
  createSeededReportsEnvelope,
  deleteReportFromEnvelope,
  ensureSeededReportsEnvelope,
  findReportById,
  listReportsByDay,
  parseReportsEnvelope,
  reportsStoreHealth,
  writeReportsIntoEnvelope,
} from "./reports-store-core";

describe("reports store core", () => {
  it("seeds the binder stub when the store is empty", () => {
    const empty = ensureSeededReportsEnvelope(
      createEmptyReportsEnvelope("2026-09-13T16:00:00.000Z"),
      "2026-09-13T16:00:00.000Z",
    );
    assert.equal(empty.seeded, true);
    assert.equal(empty.envelope.reports.length, 1);
    assert.equal(empty.envelope.reports[0]?.id, "R-2026-09-13-01");
    assert.equal(empty.envelope.seededAt, empty.envelope.updatedAt);
  });

  it("does not re-seed a store that already has rows", () => {
    const seeded = createSeededReportsEnvelope("2026-09-13T16:00:00.000Z");
    const again = ensureSeededReportsEnvelope(seeded, "2026-09-14T16:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.reports.length, 1);
  });

  it("files a paste brief and lists it by Chicago day", () => {
    const { envelope } = ensureSeededReportsEnvelope(null);
    const next = writeReportsIntoEnvelope(
      envelope,
      [
        {
          title: "Daily Resonance Brief",
          kind: "brief",
          body: "Manual file. No auto-routine in this brick.",
          createdAt: "2026-09-13",
        },
      ],
      "2026-09-13T18:00:00.000Z",
    );
    assert.equal(next.reports.length, 2);
    const filed = next.reports.find((row) => row.title === "Daily Resonance Brief");
    assert.ok(filed);
    assert.equal(filed.createdAt, "2026-09-13");
    assert.equal(filed.attestationStatus, "not_yet_attested");
    assert.equal(
      filed.fingerprint,
      fingerprintReportContent({
        title: filed.title,
        kind: filed.kind,
        createdAt: filed.createdAt,
        body: filed.body,
      }),
    );
    assert.equal(listReportsByDay(next, "2026-09-13").length, 2);
    assert.equal(findReportById(next, filed.id)?.id, filed.id);
  });

  it("parses a persisted envelope and skips junk", () => {
    const parsed = parseReportsEnvelope({
      version: 1,
      updatedAt: "2026-09-13T16:00:00.000Z",
      seededAt: "2026-09-13T16:00:00.000Z",
      reports: [
        createBinderSeedStub(),
        { id: "bad", title: "  ", kind: "brief", body: "x", createdAt: "2026-09-13" },
        { not: "a report" },
      ],
    });
    assert.equal(parsed?.reports.length, 1);
    assert.equal(parsed?.reports[0]?.id, "R-2026-09-13-01");
  });

  it("round-trips a hashgraph_attested witness", () => {
    const seed = createBinderSeedStub();
    const parsed = parseReportsEnvelope({
      version: 1,
      updatedAt: "2026-09-13T16:00:00.000Z",
      seededAt: "2026-09-13T16:00:00.000Z",
      reports: [
        {
          ...seed,
          attestationStatus: "hashgraph_attested",
          hederaMessageId: "0.0.555/2",
          attestedAt: "2026-09-13T17:00:00.000Z",
          attestLink: "https://hashscan.io/testnet/topic/0.0.555/2",
        },
      ],
    });
    assert.equal(parsed?.reports[0]?.attestationStatus, "hashgraph_attested");
    assert.equal(parsed?.reports[0]?.hederaMessageId, "0.0.555/2");
    assert.equal(
      parsed?.reports[0]?.attestLink,
      "https://hashscan.io/testnet/topic/0.0.555/2",
    );
  });

  it("assigns distinct day ids when filing two reports in one write", () => {
    const next = writeReportsIntoEnvelope(createEmptyReportsEnvelope(), [
      { title: "First", kind: "brief", body: "one", createdAt: "2026-09-13" },
      { title: "Second", kind: "build", body: "two", createdAt: "2026-09-13" },
    ]);
    assert.deepEqual(
      next.reports.map((row) => row.id).sort(),
      ["R-2026-09-13-01", "R-2026-09-13-02"],
    );
  });

  it("deletes by id and keeps the rest", () => {
    const envelope = writeReportsIntoEnvelope(createEmptyReportsEnvelope(), [
      { id: "R-2026-09-13-01", title: "Keep", kind: "build", body: "keep", createdAt: "2026-09-13" },
      { id: "R-2026-09-13-02", title: "Drop", kind: "other", body: "drop", createdAt: "2026-09-13" },
    ]);
    const next = deleteReportFromEnvelope(envelope, "R-2026-09-13-02");
    assert.deepEqual(
      next.reports.map((row) => row.id),
      ["R-2026-09-13-01"],
    );
  });

  it("merges the same day + title instead of duplicating", () => {
    const first = writeReportsIntoEnvelope(createEmptyReportsEnvelope(), [
      {
        title: "Daily Resonance Brief",
        kind: "brief",
        body: "First draft.",
        dayKey: "2026-09-13",
      },
    ]);
    assert.equal(first.reports.length, 1);
    const firstId = first.reports[0]?.id;
    const second = writeReportsIntoEnvelope(first, [
      {
        title: "Daily Resonance Brief",
        kind: "brief",
        body: "Revised 7am brief.",
        dayKey: "2026-09-13",
      },
    ]);
    assert.equal(second.reports.length, 1);
    assert.equal(second.reports[0]?.id, firstId);
    assert.equal(second.reports[0]?.body, "Revised 7am brief.");
    assert.equal(second.reports[0]?.attestationStatus, "not_yet_attested");
  });

  it("keeps a Hedera attest when the re-file fingerprint is unchanged", () => {
    const filed = writeReportsIntoEnvelope(createEmptyReportsEnvelope(), [
      {
        id: "R-2026-09-13-01",
        title: "Daily Resonance Brief",
        kind: "brief",
        body: "Stable brief.",
        createdAt: "2026-09-13",
      },
    ]);
    const row = filed.reports[0]!;
    const attested = {
      ...filed,
      reports: [
        {
          ...row,
          attestationStatus: "hashgraph_attested" as const,
          hederaMessageId: "0.0.555/2",
          attestedAt: "2026-09-13T18:00:00.000Z",
          attestLink: "https://hashscan.io/testnet/topic/0.0.555/2",
        },
      ],
    };
    const again = writeReportsIntoEnvelope(attested, [
      {
        title: "Daily Resonance Brief",
        kind: "brief",
        body: "Stable brief.",
        dayKey: "2026-09-13",
      },
    ]);
    assert.equal(again.reports.length, 1);
    assert.equal(again.reports[0]?.attestationStatus, "hashgraph_attested");
    assert.equal(again.reports[0]?.hederaMessageId, "0.0.555/2");
  });

  it("health payload has counts, not report body", () => {
    const envelope = writeReportsIntoEnvelope(createEmptyReportsEnvelope(), [
      {
        title: "Secret operator brief about a fill",
        kind: "brief",
        body: "Do not leak this sentence.",
        createdAt: "2026-09-13",
      },
    ]);
    const health = reportsStoreHealth({
      configured: true,
      backend: "blob",
      envelope,
    });
    const blob = JSON.stringify(health);
    assert.equal(health.itemCount, 1);
    assert.ok(!blob.includes("Secret"));
    assert.ok(!blob.includes("leak"));
    assert.ok(!blob.includes("brief"));
  });
});
