import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  decisionArchiveStatus,
  decisionDetailHref,
  decisionFolderKey,
  decisionsArchiveHref,
  findDateFolder,
  folderSummary,
  groupDecisionsByArchiveStatus,
  groupDecisionsByDate,
  UNDATED_FOLDER_KEY,
} from "./decision-browser";
import type { Decision } from "./types";

function withDate(date: string, extra: Partial<Decision> = {}): Decision {
  return {
    ...LOCKED_DECISIONS_2026_09_11[0],
    id: extra.id ?? `D-${date}-99`,
    date,
    ...extra,
  };
}

describe("decision archive grouping", () => {
  it("puts D-01…04 in one YYYY-MM-DD folder", () => {
    const folders = groupDecisionsByDate(LOCKED_DECISIONS_2026_09_11);
    assert.equal(folders.length, 1);
    assert.equal(folders[0]?.key, "2026-09-11");
    assert.equal(folders[0]?.count, 4);
    assert.deepEqual(
      folders[0]?.items.map((row) => row.id).sort(),
      [
        "D-2026-09-11-01",
        "D-2026-09-11-02",
        "D-2026-09-11-03",
        "D-2026-09-11-04",
      ],
    );
  });

  it("groups files inside a date by call status", () => {
    const folder = findDateFolder(LOCKED_DECISIONS_2026_09_11, "2026-09-11");
    assert.ok(folder);
    const labels = folder.groups.map((group) => group.status);
    assert.deepEqual(labels, ["decided", "superseded"]);
    assert.equal(
      folder.groups.find((group) => group.status === "decided")?.items.length,
      3,
    );
    assert.equal(
      folder.groups.find((group) => group.status === "superseded")?.items[0]
        ?.id,
      "D-2026-09-11-02",
    );
    assert.match(folderSummary(folder), /3 decided/);
    assert.match(folderSummary(folder), /1 superseded/);
  });

  it("lifts operator-acked rows into attested", () => {
    const attested: Decision = {
      ...LOCKED_DECISIONS_2026_09_11[0],
      attestationStatus: "pending_operator_ack",
      attestedAt: "2026-09-12T00:00:00.000Z",
    };
    assert.equal(decisionArchiveStatus(attested), "attested");
    const groups = groupDecisionsByArchiveStatus([
      attested,
      LOCKED_DECISIONS_2026_09_11[1],
    ]);
    assert.equal(groups.find((group) => group.status === "attested")?.items[0]?.id, attested.id);
    assert.equal(groups.find((group) => group.status === "decided"), undefined);
  });

  it("uses an undated folder and newest dates first", () => {
    const rows = [
      withDate("2026-09-10", { id: "D-2026-09-10-01" }),
      withDate("", { id: "dec-undated" }),
      withDate("not-a-date", { id: "dec-bad-date" }),
      withDate("2026-09-12", { id: "D-2026-09-12-01" }),
    ];
    const folders = groupDecisionsByDate(rows);
    assert.deepEqual(
      folders.map((folder) => folder.key),
      ["2026-09-12", "2026-09-10", UNDATED_FOLDER_KEY],
    );
    assert.equal(decisionFolderKey(rows[1]!), UNDATED_FOLDER_KEY);
    assert.equal(findDateFolder(rows, "missing"), null);
    assert.equal(findDateFolder(rows, UNDATED_FOLDER_KEY)?.count, 2);
  });

  it("builds drill-down hrefs a founder can bookmark", () => {
    assert.equal(decisionDetailHref("D-2026-09-11-01"), "/decisions/D-2026-09-11-01");
    assert.equal(
      decisionsArchiveHref("2026-09-11"),
      "/decisions?folder=2026-09-11",
    );
    assert.equal(decisionsArchiveHref(), "/decisions");
  });
});
