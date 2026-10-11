import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { YOUTUBE_GEAR } from "@/data/youtube-gear";
import { phoneTrail } from "@/lib/phone-nav";
import { hasMoneyText } from "@/lib/public-mode";
import {
  NOT_CONNECTED,
  NOT_RECORDED,
  channelStatRows,
  findGear,
  gearFields,
  gearHref,
  isYouTubeChild,
  youtubeHomeLines,
  youtubeParentCards,
} from "@/lib/youtube-node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function appPage(rel: string): boolean {
  return existsSync(path.join(root, "src/app", rel, "page.tsx"));
}

describe("YouTube node", () => {
  it("drills down: parent page, Channel and Gear children, one page per device", () => {
    assert.equal(appPage("n/youtube"), true);
    assert.equal(appPage("n/youtube/channel"), true);
    assert.equal(appPage("n/youtube/gear"), true);
    assert.equal(appPage("n/youtube/gear/[device]"), true);
    const cards = youtubeParentCards();
    assert.deepEqual(
      cards.map((card) => [card.id, card.href]),
      [
        ["channel", "/n/youtube/channel"],
        ["gear", "/n/youtube/gear"],
      ],
    );
    assert.equal(isYouTubeChild("gear"), true);
    assert.equal(isYouTubeChild("analytics"), false);
  });

  it("shows channel stats as not connected and invents no number", () => {
    const rows = channelStatRows();
    assert.equal(rows.length > 0, true);
    for (const row of rows) assert.equal(row.value, NOT_CONNECTED);
    const channel = youtubeParentCards().find((card) => card.id === "channel");
    assert.equal(channel?.live, false);
    assert.match(channel?.figure ?? "", /not connected/);
    assert.deepEqual(youtubeHomeLines(), ["Channel not connected", "Gear: 10 devices"]);
    for (const line of youtubeHomeLines()) assert.equal(/\d/.test(line.replace("10 devices", "")), false);
  });

  it("lists the gear map from the launch plan with nothing filled in by guess", () => {
    assert.equal(YOUTUBE_GEAR.length, 10);
    assert.equal(new Set(YOUTUBE_GEAR.map((item) => item.id)).size, YOUTUBE_GEAR.length);
    assert.deepEqual(
      YOUTUBE_GEAR.filter((item) => item.isNew).map((item) => item.id),
      ["rode-wireless-go-3", "whiteboard"],
    );
    for (const item of YOUTUBE_GEAR) {
      assert.equal(item.acquired, null, item.id);
      assert.equal(item.costUsd, null, item.id);
      assert.equal(item.usage, null, item.id);
    }
    const gear = youtubeParentCards().find((card) => card.id === "gear");
    assert.equal(gear?.figure, "10 devices");
    assert.deepEqual(gear?.lines, ["2 new"]);
    assert.equal(youtubeParentCards([]).find((card) => card.id === "gear")?.figure, "No gear listed");
  });

  it("keeps cost owner-only and never shows a dollar amount in Public mode", () => {
    const mevo = findGear("mevo-start");
    assert.ok(mevo);
    const owner = gearFields(mevo, false);
    assert.equal(owner.find((field) => field.label === "Cost")?.value, NOT_RECORDED);
    assert.equal(owner.find((field) => field.label === "Acquired")?.value, NOT_RECORDED);
    const priced = { ...mevo, costUsd: 199, acquired: "2026-09-01", usage: "every build episode" };
    assert.equal(gearFields(priced, false).find((field) => field.label === "Cost")?.value, "$199");
    assert.equal(gearFields(priced, false).find((field) => field.label === "Acquired")?.value, "Sep 1, 2026");
    const shared = gearFields(priced, true);
    assert.equal(shared.some((field) => field.label === "Cost"), false);
    for (const field of shared) assert.equal(hasMoneyText(field.value), false, field.label);
    assert.equal(findGear("MEVO-START")?.id, "mevo-start");
    assert.equal(findGear("nope"), null);
  });

  it("gives phone nav a back button and breadcrumbs at every level", () => {
    assert.deepEqual(phoneTrail("/n/youtube"), {
      back: { href: "/", label: "Floor" },
      crumbs: [
        { href: "/", label: "Home" },
        { href: "/n/youtube", label: "YouTube" },
      ],
    });
    const gear = phoneTrail("/n/youtube/gear");
    assert.deepEqual(gear.back, { href: "/n/youtube", label: "YouTube" });
    assert.deepEqual(
      gear.crumbs.map((crumb) => crumb.label),
      ["Home", "YouTube", "Gear"],
    );
    const device = phoneTrail(gearHref("whiteboard"));
    assert.deepEqual(device.back, { href: "/n/youtube/gear", label: "Gear" });
    assert.deepEqual(
      device.crumbs.map((crumb) => crumb.label),
      ["Home", "YouTube", "Gear", "Whiteboard"],
    );
    assert.deepEqual(phoneTrail("/n/youtube/channel").back, { href: "/n/youtube", label: "YouTube" });
    assert.deepEqual(phoneTrail("/n/youtube/nope").crumbs.map((crumb) => crumb.label), ["Home"]);
    assert.deepEqual(phoneTrail("/n/youtube/gear/nope").crumbs.map((crumb) => crumb.label), ["Home"]);
  });
});
