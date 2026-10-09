import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { CalendarEvent } from "@/data/calendar";
import { catalystSeed } from "@/data/catalyst-seed";
import { chicagoDay } from "@/lib/calendar-time";
import { proxy } from "@/proxy";
import {
  catalystBucketId,
  catalystBuckets,
  catalystEntryLine,
  catalystNodeChips,
  catalystTimeLabel,
  catalystUpcomingCount,
} from "./catalyst-calendar";

const FRIDAY = new Date("2026-10-09T15:00:00.000Z");

function row(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title">): CalendarEvent {
  return {
    kind: "catalyst",
    node: "PWR",
    start: "2026-10-09T12:00:00-05:00",
    status: "confirmed",
    writer: "agent",
    sourceUrl: "https://example.com/catalyst",
    allDay: true,
    ...overrides,
  };
}

describe("catalyst week buckets", () => {
  it("uses America/Chicago Monday–Sunday, including the Sunday night boundary", () => {
    const sundayNight = new Date("2026-10-12T04:30:00.000Z");
    const mondayMorning = new Date("2026-10-12T05:30:00.000Z");
    const nextMonday = row({
      id: "monday",
      title: "Monday print",
      start: "2026-10-12T00:30:00-05:00",
    });
    assert.equal(chicagoDay(nextMonday.start), "2026-10-12");
    assert.equal(catalystBucketId(nextMonday, sundayNight), "next-week");
    assert.equal(catalystBucketId(nextMonday, mondayMorning), "this-week");

    const thisSunday = row({
      id: "sunday",
      title: "Sunday print",
      start: "2026-10-11T23:00:00-05:00",
    });
    assert.equal(catalystBucketId(thisSunday, sundayNight), "this-week");
    assert.equal(catalystBucketId(thisSunday, mondayMorning), null);

    const later = row({
      id: "later",
      title: "After next Sunday",
      start: "2026-10-19T09:00:00-05:00",
      allDay: false,
    });
    assert.equal(catalystBucketId(later, FRIDAY), "later");
    assert.equal(catalystBucketId(later, sundayNight), "later");

    const nextSunday = row({
      id: "next-sunday",
      title: "End of next week",
      start: "2026-10-18T12:00:00-05:00",
      allDay: false,
    });
    assert.equal(catalystBucketId(nextSunday, FRIDAY), "next-week");
  });

  it("keeps an open multi-day row in this week and drops a finished day", () => {
    const open = row({
      id: "open",
      title: "Still open",
      node: "MACRO",
      start: "2026-10-01T00:00:00-05:00",
      end: "2026-12-31",
      datePrecision: "window",
    });
    const finished = row({
      id: "finished",
      title: "Already over",
      start: "2026-10-05T00:00:00-05:00",
    });
    assert.equal(catalystBucketId(open, FRIDAY), "this-week");
    assert.equal(catalystBucketId(finished, FRIDAY), null);
  });

  it("hides retired ETN and HUBB from upcoming and keeps the seed rows", () => {
    assert.equal(
      catalystSeed.some((event) => event.id === "etn-q3-2026-earnings"),
      true,
    );
    assert.equal(
      catalystSeed.some((event) => event.id === "hubb-q3-2026-earnings"),
      true,
    );
    const upcoming = catalystBuckets(catalystSeed, FRIDAY).flatMap((bucket) => bucket.events);
    assert.equal(
      upcoming.some((event) => event.id === "etn-q3-2026-earnings" || event.id === "hubb-q3-2026-earnings"),
      false,
    );
    assert.equal(catalystUpcomingCount(catalystSeed, FRIDAY) > 0, true);
    const tsm = catalystSeed.find((event) => event.id === "tsm-q3-2026-earnings");
    const tsla = catalystSeed.find((event) => event.id === "tsla-q3-2026-earnings");
    assert.equal(tsm?.node, "TSM");
    assert.equal(tsm?.status, "confirmed");
    assert.equal(tsm?.sourceUrl, "https://investor.tsmc.com/english/quarterly-results/2026/q3");
    assert.equal(chicagoDay(tsm?.start ?? ""), "2026-10-15");
    assert.equal(catalystBucketId(tsm!, FRIDAY), "next-week");
    assert.equal(tsla?.sourceUrl?.startsWith("https://www.sec.gov/"), true);
    assert.equal(chicagoDay(tsla?.start ?? ""), "2026-10-21");
    assert.equal(catalystBucketId(tsla!, FRIDAY), "later");
    assert.equal(catalystTimeLabel(tsla!), "4:30 PM CT");
    assert.equal(catalystTimeLabel(tsm!), "1:00 AM CT");
    assert.equal(
      catalystSeed.some((event) => event.node === "NVDA" || event.node === "SPCX"),
      false,
    );
    const line = catalystEntryLine(catalystSeed, FRIDAY);
    assert.match(line ?? "", /Teucrium|XRP/);
  });
});

describe("catalyst node chips", () => {
  it("links live AI and crypto nodes and leaves macro, locked, and retired names as text", () => {
    assert.deepEqual(
      catalystNodeChips(row({ id: "pwr", title: "Quanta", node: "PWR" })),
      [{ label: "PWR", href: "/n/ai-stocks/pwr" }],
    );
    assert.deepEqual(
      catalystNodeChips(row({ id: "tsm", title: "TSMC", node: "TSM" })),
      [{ label: "TSM", href: "/n/ai-stocks/tsm" }],
    );
    assert.deepEqual(
      catalystNodeChips(row({ id: "xrp", title: "XRP", node: "XRP" })),
      [{ label: "XRP", href: "/n/crypto/xrp" }],
    );
    assert.deepEqual(
      catalystNodeChips(row({ id: "macro", title: "Fed", node: "MACRO" })),
      [{ label: "Macro", href: null }],
    );
    assert.deepEqual(
      catalystNodeChips(row({ id: "flr", title: "Flare", node: "FLR" })),
      [{ label: "FLR", href: null }],
    );
    assert.deepEqual(
      catalystNodeChips(row({ id: "etn", title: "Eaton", node: "ETN" })),
      [{ label: "ETN", href: null }],
    );
  });
});

describe("catalyst calendar route auth", { concurrency: false }, () => {
  it("sends a signed-out calendar to login and lets a session cookie through", async () => {
    const previous = {
      AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
      AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
      AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    };
    process.env.AUTH_PASSWORD_HASH = "hash-sentinel-value-not-real";
    process.env.AUTH_TOTP_SECRET = "totp-sentinel-value-not-real";
    process.env.AUTH_SESSION_SECRET = "session-sentinel-value-not-real";
    try {
      const paths = [
        "/n/ai-stocks/catalysts",
        "/n/ai-stocks/catalysts/this-week",
        "/n/ai-stocks/catalysts/next-week/tsm-q3-2026-earnings",
      ];
      for (const path of paths) {
        const page = await proxy(new NextRequest(`https://resonance.test${path}`));
        assert.equal(page.status, 307, path);
        assert.equal(new URL(page.headers.get("location") ?? "").pathname, "/login");
        assert.equal(new URL(page.headers.get("location") ?? "").searchParams.get("next"), path);
      }
      const token = "a".repeat(43);
      const authed = await proxy(
        new NextRequest("https://resonance.test/n/ai-stocks/catalysts", {
          headers: { cookie: `__Host-resonance_session=${token}` },
        }),
      );
      assert.equal(authed.headers.get("x-middleware-next"), "1");
      assert.equal(authed.status, 200);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
