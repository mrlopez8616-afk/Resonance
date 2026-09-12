import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DECISIONS_IMPORT_HELP,
  LOCKED_DECISIONS_2026_09_11,
  exportDecisionsJson,
  isLockedDecisionId,
  mergeDecisionsById,
  nextDecisionId,
  parseDecisionsImport,
  previewDecisionsMerge,
} from "./decisions";
import { createSeedState } from "./seed";
import { migrateState } from "./storage";
import type { Decision } from "./types";

const examplePath = path.join(
  process.cwd(),
  "public/examples/decisions-record-book.json",
);

function exampleImport() {
  return parseDecisionsImport(readFileSync(examplePath, "utf8"));
}

function localOnly(): Decision {
  return {
    id: "dec-local-keep",
    date: "2026-09-10",
    question: "Operator-only row that must survive merge.",
    proposal: "",
    options: "Keep · Drop",
    status: "pending",
    decision: "",
    rationale: "",
    authorizedBy: "",
    outcome: "",
    evidence: "",
    reviewTrigger: "",
    fingerprint: null,
    attestationStatus: "web2_only",
    hederaMessageId: null,
    attestedAt: null,
    createdAt: "2026-09-10T12:00:00.000Z",
  };
}

describe("decisions example + seed", () => {
  it("ships D-2026-09-11-01..04 in the public example", () => {
    const imported = exampleImport();
    assert.equal(imported.source, "resonance-hub");
    assert.equal(imported.asOf, "2026-09-11T23:30:00Z");
    const ids = imported.decisions.map((row) => row.id);
    assert.deepEqual(ids, [
      "D-2026-09-11-01",
      "D-2026-09-11-02",
      "D-2026-09-11-03",
      "D-2026-09-11-04",
    ]);
    assert.ok(ids.every(isLockedDecisionId));
    const flatten = imported.decisions.find((row) => row.id === "D-2026-09-11-01");
    assert.match(flatten?.decision ?? "", /KEEP Monday market sells/);
    const charter = imported.decisions.find((row) => row.id === "D-2026-09-11-02");
    assert.equal(charter?.status, "superseded");
    const buys = imported.decisions.find((row) => row.id === "D-2026-09-11-03");
    assert.match(buys?.decision ?? "", /PWR \$35/);
    assert.match(buys?.decision ?? "", /VRT \$17/);
    const autonomy = imported.decisions.find((row) => row.id === "D-2026-09-11-04");
    assert.match(autonomy?.decision ?? "", /Agentic account only/i);
    assert.match(autonomy?.decision ?? "", /off-limits/);
    assert.equal(flatten?.authorizedBy, "Andres López");
    assert.match(flatten?.outcome ?? "", /queued ≠ filled|Queued ≠ filled/);
    assert.equal(flatten?.fingerprint, null);
    assert.match(buys?.outcome ?? "", /QUEUED for Monday open/);
  });

  it("matches the in-memory locked records used by seed", () => {
    const imported = exampleImport();
    assert.equal(imported.decisions.length, LOCKED_DECISIONS_2026_09_11.length);
    for (const locked of LOCKED_DECISIONS_2026_09_11) {
      const row = imported.decisions.find((item) => item.id === locked.id);
      assert.ok(row, `missing ${locked.id}`);
      assert.equal(row?.question, locked.question);
      assert.equal(row?.decision, locked.decision);
      assert.equal(row?.status, locked.status);
      assert.equal(row?.proposal, locked.proposal);
      assert.equal(row?.rationale, locked.rationale);
      assert.equal(row?.authorizedBy, locked.authorizedBy);
      assert.equal(row?.outcome, locked.outcome);
      assert.equal(row?.evidence, locked.evidence);
      assert.equal(row?.reviewTrigger, locked.reviewTrigger);
      assert.equal(row?.fingerprint, locked.fingerprint);
    }
  });

  it("seeds the four locked IDs on a fresh board", () => {
    const seed = createSeedState();
    for (const id of [
      "D-2026-09-11-01",
      "D-2026-09-11-02",
      "D-2026-09-11-03",
      "D-2026-09-11-04",
    ]) {
      assert.ok(seed.decisions.some((row) => row.id === id), `seed missing ${id}`);
    }
    assert.ok(seed.decisions.some((row) => row.id === "dec-vault"));
  });

  it("parses the in-app schema help example", () => {
    const imported = parseDecisionsImport(DECISIONS_IMPORT_HELP);
    assert.equal(imported.decisions[0]?.id, "D-2026-09-11-01");
  });
});

describe("decisions merge by ID", () => {
  it("updates matching IDs and leaves unrelated local rows", () => {
    const existing = [localOnly(), { ...LOCKED_DECISIONS_2026_09_11[0] }];
    const incoming = exampleImport().decisions.map((row) =>
      row.id === "D-2026-09-11-01"
        ? { ...row, decision: "Revised founder call." }
        : row,
    );
    const merged = mergeDecisionsById(existing, incoming);
    const ids = merged.map((row) => row.id);
    assert.ok(ids.includes("dec-local-keep"));
    assert.equal(merged.find((row) => row.id === "dec-local-keep")?.question, localOnly().question);
    assert.equal(
      merged.find((row) => row.id === "D-2026-09-11-01")?.decision,
      "Revised founder call.",
    );
    assert.ok(merged.some((row) => row.id === "D-2026-09-11-04"));
    assert.equal(merged.length, 5);
  });

  it("previews add vs update vs untouched local", () => {
    const existing = [localOnly(), LOCKED_DECISIONS_2026_09_11[0]];
    const preview = previewDecisionsMerge(existing, exampleImport().decisions);
    assert.equal(preview.added, 3);
    assert.equal(preview.updated, 0);
    assert.equal(preview.unchanged, 1);
    assert.equal(preview.untouchedLocal, 1);
  });

  it("rejects a holdings snapshot", () => {
    assert.throws(
      () =>
        parseDecisionsImport(
          JSON.stringify({
            asOf: "2026-09-11T16:10:00Z",
            source: "robinhood",
            holdings: [{ symbol: "PWR", quantity: "1" }],
          }),
        ),
      /holdings snapshot/,
    );
  });

  it("accepts a bare decisions array", () => {
    const imported = parseDecisionsImport(
      JSON.stringify([
        {
          id: "D-2026-09-12-01",
          question: "Bare array works?",
          status: "pending",
        },
      ]),
    );
    assert.equal(imported.decisions[0]?.id, "D-2026-09-12-01");
    assert.equal(imported.decisions[0]?.rationale, "");
  });

  it("accepts founderDecision alias from hub payloads", () => {
    const imported = parseDecisionsImport(
      JSON.stringify({
        decisions: [
          {
            id: "D-2026-09-12-02",
            question: "Alias fields?",
            proposed: "Use aliases.",
            founderDecision: "Yes.",
            why: "Hub payloads vary.",
            authorized_by: "Andres López",
            receipt: "chat-lock-12",
            review_trigger: "If aliases disappear.",
          },
        ],
      }),
    );
    assert.equal(imported.decisions[0]?.proposal, "Use aliases.");
    assert.equal(imported.decisions[0]?.decision, "Yes.");
    assert.equal(imported.decisions[0]?.rationale, "Hub payloads vary.");
    assert.equal(imported.decisions[0]?.authorizedBy, "Andres López");
    assert.equal(imported.decisions[0]?.evidence, "chat-lock-12");
    assert.equal(imported.decisions[0]?.reviewTrigger, "If aliases disappear.");
    assert.equal(imported.decisions[0]?.fingerprint, null);
  });
});

describe("decisions persistence", () => {
  it("backfills missing locked IDs without wiping a local row", () => {
    const restored = migrateState({
      version: 1,
      decisions: [
        {
          id: "dec-vault",
          question: "Keep XRP principal in the Flare vault, or hold liquid on Xaman?",
          options: "Keep · Split",
          status: "decided",
          decision: "Keep principal.",
          date: "2026-08-20",
          createdAt: "2026-08-20T16:00:00.000Z",
        },
        {
          id: "dec-local-keep",
          question: "Typed after first load.",
          status: "pending",
          date: "2026-09-11",
        },
      ],
    });
    assert.ok(restored.decisions.some((row) => row.id === "dec-local-keep"));
    assert.equal(
      restored.decisions.find((row) => row.id === "dec-vault")?.decision,
      "Keep principal.",
    );
    assert.ok(restored.decisions.some((row) => row.id === "D-2026-09-11-03"));
    assert.equal(
      restored.decisions.find((row) => row.id === "dec-vault")?.rationale,
      "",
    );
  });

  it("round-trips rationale and superseded through migrateState", () => {
    const seed = createSeedState();
    const restored = migrateState(JSON.parse(JSON.stringify(seed)));
    const charter = restored.decisions.find((row) => row.id === "D-2026-09-11-02");
    assert.equal(charter?.status, "superseded");
    assert.ok(charter?.reviewTrigger.includes("D-2026-09-11-04"));
  });

  it("export JSON re-parses as a merge payload", () => {
    const seed = createSeedState();
    const exported = exportDecisionsJson(seed.decisions);
    const imported = parseDecisionsImport(exported);
    assert.equal(imported.source, "resonance-decisions");
    assert.equal(imported.decisions.length, seed.decisions.length);
  });

  it("suggests the next D-YYYY-MM-DD-NN after locked rows", () => {
    const seed = createSeedState();
    assert.equal(nextDecisionId(seed.decisions, "2026-09-11"), "D-2026-09-11-05");
    assert.equal(nextDecisionId(seed.decisions, "2026-09-12"), "D-2026-09-12-01");
  });
});
