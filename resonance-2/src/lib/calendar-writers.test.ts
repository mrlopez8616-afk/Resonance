import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALYST_NODES } from "@/data/calendar";
import { CATALYST_SEED_COUNT, catalystSeed } from "@/data/catalyst-seed";
import catalystFile from "@/data/catalyst-events.json";
import {
  buildPrCalendarBody,
  capitalCalendarBody,
  capitalFillEventId,
  dailyBriefCalendarBody,
  dailyBriefEventId,
} from "./calendar-writers";
import { parseCalendarEvent } from "./calendar-event";

describe("calendar writers", () => {
  it("keeps the committed catalyst file to the ten nodes", () => {
    assert.equal(catalystFile.length, CATALYST_SEED_COUNT);
    assert.equal(catalystSeed.length, 34);
    assert.deepEqual(
      catalystSeed.map((event) => event.id),
      catalystFile.map((event) => event.id),
    );
    for (const event of catalystSeed) {
      assert.equal(event.kind, "catalyst");
      assert.ok(event.node && (CATALYST_NODES as readonly string[]).includes(event.node));
      assert.match(event.sourceUrl ?? "", /^https:\/\//);
      assert.equal(event.lane, undefined);
    }
  });

  it("builds a stable capital row that opens the filtered log", () => {
    const body = capitalCalendarBody({
      time: "2026-09-21T08:30:00-05:00",
      symbol: "SUI",
      side: "buy",
      quantity: "8.931",
      price: "1.10",
      orderId: "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
      result: "filled",
      venue: "robinhood",
      sleeve: "rh-agentic",
      idempotencyKey: "robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d",
    });
    assert.equal(
      body.id,
      capitalFillEventId("robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d"),
    );
    assert.equal(body.lane, "capital");
    assert.equal(body.status, "history");
    assert.equal(body.link, "/log?ticker=SUI&from=2026-09-21&to=2026-09-21");
    const parsed = parseCalendarEvent(body);
    assert.equal(parsed.id, body.id);
    const again = capitalCalendarBody({
      time: "2026-09-21T08:30:00-05:00",
      symbol: "SUI",
      side: "buy",
      quantity: "8.931",
      price: "1.10",
      orderId: "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
      result: "filled",
      venue: "robinhood",
      sleeve: "rh-agentic",
      idempotencyKey: "robinhood:6aad6b8e-f2a6-4be3-a803-65940a748d8d",
    });
    assert.equal(again.id, body.id);
    assert.equal(again.title, body.title);
  });

  it("posts one weekday Daily Brief id and refuses Saturday", () => {
    const body = dailyBriefCalendarBody("2026-09-25", { note: "Filed." });
    assert.equal(body.id, dailyBriefEventId("2026-09-25"));
    assert.equal(body.id, "cadence-daily-brief-2026-09-25");
    assert.equal(body.start, "2026-09-25T07:00:00-05:00");
    assert.equal(body.lane, "cadence");
    assert.doesNotThrow(() => parseCalendarEvent(body));
    assert.throws(() => dailyBriefCalendarBody("2026-09-26"), /weekdays/);
  });

  it("updates build status on the same pull request id", () => {
    const opened = buildPrCalendarBody({
      number: 40,
      title: "Calendar upgrade",
      htmlUrl: "https://github.com/mrlopez8616-afk/Resonance/pull/40",
      createdAt: "2026-09-25T15:04:00Z",
      action: "opened",
      merged: false,
    });
    const ready = buildPrCalendarBody({
      number: 40,
      title: "Calendar upgrade",
      htmlUrl: "https://github.com/mrlopez8616-afk/Resonance/pull/40",
      createdAt: "2026-09-25T15:04:00Z",
      action: "ready_for_review",
      merged: false,
    });
    const merged = buildPrCalendarBody({
      number: 40,
      title: "Calendar upgrade",
      htmlUrl: "https://github.com/mrlopez8616-afk/Resonance/pull/40",
      createdAt: "2026-09-25T15:04:00Z",
      action: "closed",
      merged: true,
    });
    assert.equal(opened.id, "build-pr-40");
    assert.equal(ready.id, opened.id);
    assert.equal(merged.id, opened.id);
    assert.equal(opened.status, "pending");
    assert.equal(ready.status, "awaiting");
    assert.equal(merged.status, "merged");
    assert.equal(opened.writer, "agent");
    assert.equal(opened.lane, "build");
    assert.doesNotThrow(() => parseCalendarEvent(merged));
  });
});
