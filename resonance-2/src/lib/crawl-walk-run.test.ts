import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cwrBuildFace, cwrGroupCards, cwrItemCards } from "@/lib/crawl-walk-run-faces";
import { publicTextLeaks } from "@/lib/public-mode";
import {
  CRAWL_WALK_RUN,
  cwrDetail,
  cwrItem,
  cwrItems,
  openPhase,
} from "@/lib/crawl-walk-run";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = join(root, "..");

const REQUIRED = [
  ["youtube", "built", "crawl", true],
  ["site-health", "built", "walk", true],
  ["fitness", "built", "crawl", true],
  ["fight-desk", "built", "walk", true],
  ["finance", "built", "crawl", true],
  ["xrp-tracker", "built", "walk", true],
  ["sui-tracker", "built", "walk", true],
  ["driving-tracker", "recommended", "crawl", false],
  ["per-node-daily-buy", "planned", "crawl", false],
] as const;

describe("crawl walk run seed", () => {
  it("reads the versioned cabinet file and keeps every group", () => {
    const raw = readFileSync(join(root, "cabinet/crawl-walk-run-seed.json"), "utf8");
    const parsed = JSON.parse(raw) as { version: number; updated: string };
    assert.equal(parsed.version, CRAWL_WALK_RUN.version);
    assert.equal(parsed.updated, "2026-10-28");
    assert.deepEqual(
      CRAWL_WALK_RUN.groups.map((group) => group.id),
      ["built", "planned", "recommended"],
    );
    assert.equal(raw.includes("$"), false);
    assert.deepEqual(publicTextLeaks(raw), []);
    for (const item of CRAWL_WALK_RUN.items) {
      assert.notEqual(item.stage, "run", item.id);
      assert.ok(item.phases.length > 0, item.id);
      assert.ok(item.more.length > 0, item.id);
      for (const source of item.sources) {
        const found = existsSync(join(root, source)) || existsSync(join(repo, source));
        assert.equal(found, true, `${item.id} source ${source}`);
      }
    }
  });

  it("keeps the required bricks at the stage the repo supports", () => {
    for (const [id, group, stage, met] of REQUIRED) {
      const item = cwrItem(group, id);
      assert.ok(item, id);
      assert.equal(item?.stage, stage, id);
      assert.equal(item?.stageMet, met, id);
    }
    const youtube = cwrItem("built", "youtube");
    assert.equal(youtube?.crawl, "Channel and assets ready.");
    assert.equal(
      youtube?.walk,
      "Sophia trims videos from the founder's desktop file and they write metadata together.",
    );
    assert.equal(youtube?.run, "YouTube Analytics API node + upload API posting unlisted drafts.");
    assert.equal(youtube?.confidence, "conservative");
    const health = cwrItem("built", "site-health");
    assert.match(health?.crawl ?? "", /founder spots breaks/);
    assert.match(health?.walk ?? "", /3x-daily Architect sweep/);
    assert.match(health?.run ?? "", /Self-healing alerts/);
    assert.equal(health?.stageMet, true);
    assert.equal(openPhase(health!)?.to, "run");
    assert.equal(openPhase(youtube!)?.to, "walk");
    const backup = cwrItem("built", "backup");
    assert.equal(backup?.stage, "crawl");
    assert.equal(backup?.stageMet, true);
    assert.match(backup?.crawl ?? "", /private GitHub branch/);
    assert.match(backup?.run ?? "", /point-in-time/);
    assert.equal(backup?.statusLine.includes("$"), false);
    const buy = cwrItem("planned", "per-node-daily-buy");
    assert.equal(buy?.stageMet, false);
    assert.equal(openPhase(buy!)?.to, "crawl");
  });

  it("shows group cards on the parent and the stage text one level down", () => {
    const parent = cwrGroupCards();
    assert.deepEqual(
      parent.map((group) => group.face.name),
      ["Built", "Planned", "Recommended"],
    );
    const parentText = parent.map((group) => `${group.face.headline} ${group.face.status}`).join("\n");
    assert.equal(parentText.includes("Channel and assets ready"), false);
    assert.equal(parentText.includes("What more can be done"), false);
    assert.equal(parentText.includes("$"), false);
    assert.equal(parent.every((group) => group.face.href.startsWith("/n/crawl-walk-run/")), true);

    const built = cwrItemCards("built");
    const youtubeCard = built.cards.find((card) => card.id === "youtube");
    assert.equal(youtubeCard?.face.headline, "Crawl");
    assert.equal(youtubeCard?.face.href, "/n/crawl-walk-run/built/youtube");
    assert.equal(youtubeCard?.face.status.includes("Channel and assets ready"), false);
    assert.equal(built.cards.some((card) => card.face.name === "Site health"), true);
    assert.equal(built.cards.some((card) => card.face.name === "XRP tracker"), true);
    assert.equal(built.cards.some((card) => card.face.name === "SUI tracker"), true);
    const cardText = built.cards.map((card) => `${card.face.name} ${card.face.headline} ${card.face.status}`).join("\n");
    assert.equal(cardText.includes("Sophia trims"), false);
    assert.equal(cardText.includes("$"), false);

    const detail = cwrDetail("built", "youtube");
    assert.ok(detail);
    assert.equal(detail?.stages.find((stage) => stage.current)?.label, "Crawl");
    assert.equal(detail?.stages.map((stage) => stage.text).join(" "), [
      "Channel and assets ready.",
      "Sophia trims videos from the founder's desktop file and they write metadata together.",
      "YouTube Analytics API node + upload API posting unlisted drafts.",
    ].join(" "));
    assert.match(detail?.item.more ?? "", /Brick Tracker/);
    assert.equal(detail?.phases.some((phase) => phase.next && phase.to === "walk"), true);
    const floor = readFileSync(join(root, "src/components/crawl-walk-run-floor.tsx"), "utf8");
    assert.match(floor, /NodeFace/);
    assert.match(floor, /What more can be done/);
    assert.match(floor, /Phase lines/);
    assert.equal(/\$\d/.test(floor), false);

    const face = cwrBuildFace();
    assert.equal(face.name, "Crawl Walk Run");
    assert.equal(face.href, "/n/crawl-walk-run");
    assert.equal(face.headline, String(CRAWL_WALK_RUN.items.length));
    assert.match(face.status, new RegExp(`${cwrItems("built").length} built`));
    assert.match(face.status, new RegExp(`${cwrItems("planned").length} planned`));
    assert.match(face.status, new RegExp(`${cwrItems("recommended").length} recommended`));
    assert.equal(face.status.includes("$"), false);
  });
});
