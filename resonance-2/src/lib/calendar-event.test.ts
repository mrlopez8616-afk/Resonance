import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CalendarWriteError, parseCalendarEvent } from "./calendar-event";

describe("calendar event parse", () => {
  it("accepts an agent capital row and derives an id", () => {
    const event = parseCalendarEvent({
      lane: "capital",
      writer: "agent",
      start: "2026-09-21T08:30:00-05:00",
      title: "Agentic SUI→6 AI",
      status: "history",
      link: "/log?ticker=SUI&from=2026-09-21&to=2026-09-21",
    });
    assert.equal(event.lane, "capital");
    assert.equal(event.id, "capital-2026-09-21t08-30-00-05-00-agentic-sui-6-ai");
    assert.equal(event.link, "/log?ticker=SUI&from=2026-09-21&to=2026-09-21");
  });

  it("accepts a wrapped event object and an explicit id", () => {
    const event = parseCalendarEvent({
      event: {
        id: "build-resonance-calendar",
        lane: "build",
        writer: "agent",
        start: "2026-09-24T09:00:00-05:00",
        title: "Operating calendar",
        status: "awaiting",
        link: "https://github.com/mrlopez8616-afk/Resonance/pull/1",
      },
    });
    assert.equal(event.id, "build-resonance-calendar");
    assert.equal(event.status, "awaiting");
  });

  it("accepts a founder gate and refuses an agent gate", () => {
    const gate = parseCalendarEvent({
      id: "gates-carla",
      lane: "gates",
      writer: "founder",
      start: "2026-09-24T15:00:00-05:00",
      title: "Carla approval",
      status: "open",
    });
    assert.equal(gate.writer, "founder");

    assert.throws(
      () =>
        parseCalendarEvent({
          lane: "gates",
          writer: "agent",
          start: "2026-09-24T15:00:00-05:00",
          title: "Auto gate",
          status: "open",
        }),
      (error: unknown) =>
        error instanceof CalendarWriteError &&
        error.message.includes("human approvals"),
    );
  });

  it("accepts a catalyst and refuses an invented node", () => {
    const event = parseCalendarEvent({
      id: "xrpl-batchv1-1-activation-2026",
      kind: "catalyst",
      node: "xrp",
      writer: "agent",
      start: "2026-09-29T09:06:00-05:00",
      title: "XRPL BatchV1_1 amendment earliest activation",
      status: "tentative",
      source_url: "https://xrpscan.com/amendment/BatchV1_1",
      end: "2026-09-29",
      date_precision: "day",
    });
    assert.equal(event.kind, "catalyst");
    assert.equal(event.node, "XRP");
    assert.equal(event.lane, undefined);
    assert.equal(event.sourceUrl, "https://xrpscan.com/amendment/BatchV1_1");
    assert.equal(event.status, "tentative");

    assert.throws(
      () =>
        parseCalendarEvent({
          kind: "catalyst",
          node: "DOGE",
          writer: "agent",
          start: "2026-09-29T09:06:00-05:00",
          title: "Invented",
          status: "confirmed",
          source_url: "https://example.com/nope",
        }),
      (error: unknown) =>
        error instanceof CalendarWriteError && error.message.includes("node"),
    );

    assert.throws(
      () =>
        parseCalendarEvent({
          kind: "catalyst",
          node: "XRP",
          writer: "agent",
          start: "2026-09-29T09:06:00-05:00",
          title: "Missing source",
          status: "confirmed",
        }),
      (error: unknown) => error instanceof CalendarWriteError,
    );
  });

  it("refuses recurrence outside cadence and unsafe links", () => {
    assert.throws(
      () =>
        parseCalendarEvent({
          lane: "capital",
          writer: "agent",
          start: "2026-09-21T08:30:00-05:00",
          title: "Repeat money",
          status: "scheduled",
          recurrence: {
            freq: "weekdays",
            timeZone: "America/Chicago",
            time: "08:30",
          },
        }),
      (error: unknown) => error instanceof CalendarWriteError,
    );

    assert.throws(
      () =>
        parseCalendarEvent({
          lane: "build",
          writer: "agent",
          start: "2026-09-24T09:00:00Z",
          title: "Bad link",
          status: "pending",
          link: "javascript:alert(1)",
        }),
      (error: unknown) => error instanceof CalendarWriteError,
    );
  });

  it("accepts a fights lane POST and still rejects an unknown lane", () => {
    const event = parseCalendarEvent({
      id: "ufc-325-main-card",
      lane: "fights",
      writer: "agent",
      start: "2027-01-16T19:00:00-06:00",
      title: "UFC 325 main card",
      status: "scheduled",
      eventSlug: "ufc-325",
      href: "/fights/ufc-325",
    });
    assert.equal(event.lane, "fights");
    assert.equal(event.kind, undefined);
    assert.equal(event.writer, "agent");
    assert.equal(event.eventSlug, "ufc-325");
    assert.equal(event.link, "/fights/ufc-325");

    const aliased = parseCalendarEvent({
      id: "ufc-332-hub-prelims",
      lane: "fights",
      writer: "agent",
      start: "2026-10-03T17:00:00-05:00",
      title: "UFC 332 prelims",
      status: "scheduled",
      event_slug: "ufc-332",
    });
    assert.equal(aliased.eventSlug, "ufc-332");
    assert.equal(aliased.link, undefined);

    assert.throws(
      () =>
        parseCalendarEvent({
          lane: "ufc",
          writer: "agent",
          start: "2026-10-03T19:00:00-05:00",
          title: "Unknown lane",
          status: "scheduled",
        }),
      (error: unknown) =>
        error instanceof CalendarWriteError &&
        error.status === 400 &&
        error.message === "lane must be cadence, capital, build, gates, or fights.",
    );

    assert.throws(
      () =>
        parseCalendarEvent({
          lane: "gates",
          writer: "agent",
          start: "2026-10-03T19:00:00-05:00",
          title: "Agent gate",
          status: "open",
        }),
      (error: unknown) =>
        error instanceof CalendarWriteError && error.message.includes("human approvals"),
    );
  });
});
