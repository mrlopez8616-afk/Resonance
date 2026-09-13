import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReport } from "./reports";
import {
  findReportDateFolder,
  folderFileSummary,
  groupReportsByDate,
  reportDetailHref,
  reportsArchiveHref,
  reportsFolderHref,
} from "./reports-browser";

describe("reports archive grouping", () => {
  const reports = [
    createReport({
      title: "Brief 13",
      kind: "brief",
      body: "thirteen",
      createdAt: "2026-09-13",
      now: "2026-09-13T16:00:00.000Z",
      id: "R-2026-09-13-01",
    }),
    createReport({
      title: "Build 13",
      kind: "build",
      body: "build",
      createdAt: "2026-09-13",
      now: "2026-09-13T17:00:00.000Z",
      id: "R-2026-09-13-02",
    }),
    createReport({
      title: "Ops 12",
      kind: "rh-ops",
      body: "ops",
      createdAt: "2026-09-12",
      now: "2026-09-12T16:00:00.000Z",
      id: "R-2026-09-12-01",
    }),
  ];

  it("groups files into date folders newest first", () => {
    const folders = groupReportsByDate(reports);
    assert.deepEqual(
      folders.map((folder) => folder.key),
      ["2026-09-13", "2026-09-12"],
    );
    assert.equal(folders[0]?.count, 2);
    assert.match(folderFileSummary(folders[0]!), /brief/);
    assert.match(folderFileSummary(folders[0]!), /build/);
  });

  it("finds a day folder and builds archive hrefs", () => {
    const folder = findReportDateFolder(reports, "2026-09-12");
    assert.equal(folder?.items[0]?.id, "R-2026-09-12-01");
    assert.equal(reportsArchiveHref("2026-09-13"), "/archive/2026-09-13");
    assert.equal(reportsFolderHref("2026-09-13"), "/reports?folder=2026-09-13");
    assert.equal(reportDetailHref("R-2026-09-13-01"), "/reports/R-2026-09-13-01");
  });
});
