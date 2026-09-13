import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReportAttestationWitness,
  chicagoDayKey,
  createBinderSeedStub,
  createReport,
  draftReportFromDecision,
  fingerprintReportContent,
  isReportAttested,
  isReportKind,
  nextReportId,
  normalizeReportDayKey,
  preserveReportAttestationIfUnchanged,
  REPORT_ATTESTATION_ATTESTED,
  REPORT_ATTESTATION_NOT_YET,
  REPORTS_SEED_DAY,
  reportsForDay,
  REPORTS_DAY_TZ,
} from "./reports";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";

describe("reports schema and day key", () => {
  it("derives America/Chicago day keys across the UTC midnight split", () => {
    assert.equal(REPORTS_DAY_TZ, "America/Chicago");
    // 2026-09-13 is CDT (UTC-5). 04:59Z is still the 12th in Chicago.
    assert.equal(chicagoDayKey("2026-09-13T04:59:00.000Z"), "2026-09-12");
    assert.equal(chicagoDayKey("2026-09-13T05:00:00.000Z"), "2026-09-13");
    assert.equal(chicagoDayKey("2026-09-13"), "2026-09-13");
    assert.equal(normalizeReportDayKey(undefined, new Date("2026-09-13T16:00:00.000Z")), "2026-09-13");
  });

  it("accepts the four locked kinds and rejects others", () => {
    assert.equal(isReportKind("brief"), true);
    assert.equal(isReportKind("rh-ops"), true);
    assert.equal(isReportKind("build"), true);
    assert.equal(isReportKind("other"), true);
    assert.equal(isReportKind("doctrine"), false);
    assert.throws(
      () => createReport({ title: "X", kind: "doctrine", body: "n" }),
      /kind must be/,
    );
  });

  it("requires title and body (or a blob pointer)", () => {
    assert.throws(() => createReport({ title: "  ", body: "hello" }), /title/);
    assert.throws(() => createReport({ title: "Brief", body: "  " }), /body or blobPointer/);
    const viaPointer = createReport({
      title: "Pointer only",
      kind: "other",
      blobPointer: "resonance/reports/r-1.md",
      createdAt: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
      id: "R-2026-09-13-99",
    });
    assert.equal(viaPointer.body, "");
    assert.equal(viaPointer.blobPointer, "resonance/reports/r-1.md");
  });

  it("fingerprints the canonical filed record and stays stable", () => {
    const input = {
      title: "Daily Resonance Brief",
      kind: "brief" as const,
      createdAt: "2026-09-13",
      body: "Morning check. No fills to file.",
    };
    const first = fingerprintReportContent(input);
    const second = fingerprintReportContent(input);
    const nodeSha = createHash("sha256")
      .update(JSON.stringify(input), "utf8")
      .digest("hex");
    assert.equal(first, second);
    assert.equal(first, nodeSha);
    assert.match(first, /^[a-f0-9]{64}$/);
    const changed = fingerprintReportContent({ ...input, body: "Afternoon revision." });
    assert.notEqual(first, changed);
  });

  it("files a report with fingerprint and not-yet-attested stub", () => {
    const report = createReport({
      title: "Daily Resonance Brief",
      kind: "brief",
      body: "Paste brief for 2026-09-13.",
      createdAt: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
      existing: [],
    });
    assert.equal(report.id, "R-2026-09-13-01");
    assert.equal(report.createdAt, "2026-09-13");
    assert.equal(report.attestationStatus, REPORT_ATTESTATION_NOT_YET);
    assert.equal(report.attestLink, null);
    assert.equal(
      report.fingerprint,
      fingerprintReportContent({
        title: report.title,
        kind: report.kind,
        createdAt: report.createdAt,
        body: report.body,
      }),
    );
  });

  it("increments the day sequence and filters by Chicago day", () => {
    const first = createReport({
      title: "One",
      body: "a",
      createdAt: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
    });
    assert.equal(nextReportId([first], "2026-09-13"), "R-2026-09-13-02");
    const otherDay = createReport({
      title: "Two",
      body: "b",
      createdAt: "2026-09-12",
      now: "2026-09-12T16:00:00.000Z",
    });
    assert.equal(reportsForDay([first, otherDay], "2026-09-13").map((row) => row.id).join(), first.id);
  });

  it("seed stub is a brief on the locked Chicago day", () => {
    const seed = createBinderSeedStub();
    assert.equal(seed.kind, "brief");
    assert.equal(seed.createdAt, REPORTS_SEED_DAY);
    assert.equal(seed.id, "R-2026-09-13-01");
    assert.equal(seed.attestationStatus, "not_yet_attested");
    assert.match(seed.fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(!/\$\s?\d/.test(seed.body));
  });

  it("drafts a brief from an existing Decision without extra doctrine", () => {
    const decision = LOCKED_DECISIONS_2026_09_11.find(
      (row) => row.id === "D-2026-09-11-04",
    );
    assert.ok(decision);
    const draft = draftReportFromDecision(decision, {
      dayKey: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
    });
    assert.equal(draft.title, "Decision D-2026-09-11-04");
    assert.equal(draft.kind, "brief");
    assert.equal(draft.createdAt, "2026-09-13");
    assert.match(draft.body, /Decision D-2026-09-11-04/);
    assert.match(draft.body, /Question:/);
    assert.ok(!draft.body.includes("The OS should"));
  });

  it("apply + preserve attestation witness around a same-fingerprint rewrite", () => {
    const report = createReport({
      title: "Daily Resonance Brief",
      kind: "brief",
      body: "Morning check.",
      createdAt: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
    });
    const attested = applyReportAttestationWitness(report, {
      fingerprint: report.fingerprint,
      hederaMessageId: "0.0.555/2",
      attestedAt: "2026-09-13T17:00:00.000Z",
      attestLink: "https://hashscan.io/testnet/topic/0.0.555/2",
    });
    assert.equal(attested.attestationStatus, REPORT_ATTESTATION_ATTESTED);
    assert.equal(isReportAttested(attested), true);
    const rewrite = createReport({
      title: report.title,
      kind: report.kind,
      body: report.body,
      createdAt: report.createdAt,
      now: "2026-09-13T18:00:00.000Z",
      id: report.id,
    });
    const kept = preserveReportAttestationIfUnchanged(attested, rewrite);
    assert.equal(kept.attestationStatus, REPORT_ATTESTATION_ATTESTED);
    assert.equal(kept.hederaMessageId, "0.0.555/2");
    const changed = createReport({
      title: report.title,
      kind: report.kind,
      body: "Afternoon revision.",
      createdAt: report.createdAt,
      now: "2026-09-13T18:00:00.000Z",
      id: report.id,
    });
    const reset = preserveReportAttestationIfUnchanged(attested, changed);
    assert.equal(reset.attestationStatus, REPORT_ATTESTATION_NOT_YET);
    assert.equal(reset.hederaMessageId, null);
  });
});
