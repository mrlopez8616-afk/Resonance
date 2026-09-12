import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  collectWriteItems,
  DecisionWriteError,
  pickDecisionPatch,
  upsertDecisionsFromWrites,
} from "./decision-write";

describe("decision write / patch", () => {
  it("patches only provided fields so a fill update does not wipe the row", () => {
    const existing = [...LOCKED_DECISIONS_2026_09_11];
    const items = collectWriteItems({
      id: "D-2026-09-11-03",
      outcome: "PWR $35 and VRT $17 FILLED at Monday open.",
      evidence: "RH fills: order-pwr, order-vrt",
    });
    const { decisions, preview } = upsertDecisionsFromWrites(existing, items);
    const row = decisions.find((item) => item.id === "D-2026-09-11-03");
    assert.equal(row?.outcome, "PWR $35 and VRT $17 FILLED at Monday open.");
    assert.equal(row?.evidence, "RH fills: order-pwr, order-vrt");
    assert.match(row?.decision ?? "", /Approve Agentic PWR/);
    assert.equal(row?.question, existing[2]?.question);
    assert.equal(preview.updated, 1);
    assert.equal(preview.added, 0);
  });

  it("accepts hub aliases on a PATCH-shaped body", () => {
    const patch = pickDecisionPatch({
      id: "D-2026-09-11-01",
      founderDecision: "Keep the Monday sells.",
      why: "Still the call.",
      authorized_by: "Andres López",
      receipt: "chat-lock",
    });
    assert.equal(patch.decision, "Keep the Monday sells.");
    assert.equal(patch.rationale, "Still the call.");
    assert.equal(patch.authorizedBy, "Andres López");
    assert.equal(patch.evidence, "chat-lock");
    assert.equal(patch.outcome, undefined);
  });

  it("creates a new row when question is present", () => {
    const { decisions, preview } = upsertDecisionsFromWrites(
      LOCKED_DECISIONS_2026_09_11,
      collectWriteItems({
        id: "D-2026-09-15-01",
        question: "Record the Monday fills?",
        status: "decided",
        decision: "Yes.",
        outcome: "Filled.",
      }),
    );
    assert.equal(preview.added, 1);
    assert.ok(decisions.some((row) => row.id === "D-2026-09-15-01"));
  });

  it("rejects an unknown id without a question", () => {
    assert.throws(
      () =>
        upsertDecisionsFromWrites(
          LOCKED_DECISIONS_2026_09_11,
          collectWriteItems({ id: "D-missing", outcome: "Filled." }),
        ),
      DecisionWriteError,
    );
  });

  it("accepts a decisions array payload", () => {
    const items = collectWriteItems({
      decisions: [
        { id: "D-2026-09-11-01", outcome: "Still queued." },
        { id: "D-2026-09-11-04", outcome: "Autonomy still queued." },
      ],
    });
    assert.equal(items.length, 2);
    const { decisions } = upsertDecisionsFromWrites(
      LOCKED_DECISIONS_2026_09_11,
      items,
    );
    assert.match(
      decisions.find((row) => row.id === "D-2026-09-11-01")?.outcome ?? "",
      /Still queued/,
    );
  });
});
