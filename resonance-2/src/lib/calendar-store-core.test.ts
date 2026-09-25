import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalystSeed } from "@/data/catalyst-seed";
import { calendarSeed } from "@/data/calendar";
import { CalendarWriteError, parseCalendarEvent } from "./calendar-event";
import {
  calendarCatalog,
  createEmptyCalendarEnvelope,
  createSeededCalendarEnvelope,
  detectCalendarBackend,
  ensureSeededCalendarEnvelope,
  parseCalendarEnvelope,
  writeCalendarEventIntoEnvelope,
} from "./calendar-store-core";

describe("calendar store core", () => {
  it("seeds cadence, the Monday capital history, and the catalyst catalog once", () => {
    const seeded = ensureSeededCalendarEnvelope(createEmptyCalendarEnvelope());
    assert.equal(seeded.seeded, true);
    assert.equal(seeded.envelope.events.length, calendarSeed.length + catalystSeed.length);
    assert.equal(seeded.envelope.events[0]?.id, "cadence-daily-brief");
    assert.equal(seeded.envelope.events[1]?.id, "capital-monday-agentic-sui-6ai");
    assert.equal(
      seeded.envelope.events.filter((event) => event.kind === "catalyst").length,
      34,
    );
    assert.equal(
      seeded.envelope.events.some((event) => event.lane === "build"),
      false,
    );
    assert.equal(
      seeded.envelope.events.some((event) => event.lane === "gates"),
      false,
    );
    const again = ensureSeededCalendarEnvelope(seeded.envelope);
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.events.length, calendarCatalog().length);
  });

  it("re-seeds an existing store by id without duplicating cadence or capital", () => {
    const legacy = createEmptyCalendarEnvelope("2026-09-23T12:00:00.000Z");
    legacy.events = calendarSeed.map((row) => ({ ...row }));
    legacy.seededAt = "2026-09-23T12:00:00.000Z";
    const merged = ensureSeededCalendarEnvelope(legacy, "2026-09-25T12:00:00.000Z");
    assert.equal(merged.seeded, true);
    assert.equal(
      merged.envelope.events.filter((event) => event.id === "cadence-daily-brief").length,
      1,
    );
    assert.equal(
      merged.envelope.events.filter((event) => event.id === "capital-monday-agentic-sui-6ai")
        .length,
      1,
    );
    assert.equal(merged.envelope.events.length, calendarSeed.length + catalystSeed.length);

    const changed = {
      ...merged.envelope,
      events: merged.envelope.events.map((event) =>
        event.id === "xrpl-batchv1-1-activation-2026"
          ? { ...event, title: "Edited title" }
          : event,
      ),
    };
    const restored = ensureSeededCalendarEnvelope(changed, "2026-09-26T12:00:00.000Z");
    assert.equal(restored.seeded, true);
    assert.equal(restored.envelope.events.length, changed.events.length);
    assert.equal(
      restored.envelope.events.find((event) => event.id === "xrpl-batchv1-1-activation-2026")
        ?.title,
      "XRPL BatchV1_1 amendment earliest activation",
    );

    const roundTrip = parseCalendarEnvelope(JSON.parse(JSON.stringify(restored.envelope)));
    assert.ok(roundTrip);
    const held = ensureSeededCalendarEnvelope(roundTrip, "2026-09-26T12:00:00.000Z");
    assert.equal(held.seeded, false);
    assert.equal(held.envelope.events.length, roundTrip.events.length);
  });

  it("appends a build event, dedupes the same body, and updates status", () => {
    const seeded = createSeededCalendarEnvelope("2026-09-23T12:00:00.000Z");
    const pending = parseCalendarEvent({
      id: "build-operating-calendar",
      lane: "build",
      writer: "agent",
      start: "2026-09-24T09:00:00-05:00",
      title: "Operating calendar",
      status: "pending",
    });
    const first = writeCalendarEventIntoEnvelope(seeded, pending);
    assert.equal(first.deduped, false);
    assert.equal(first.updated, false);
    assert.equal(first.envelope.events.length, calendarCatalog().length + 1);

    const retry = writeCalendarEventIntoEnvelope(first.envelope, pending);
    assert.equal(retry.deduped, true);
    assert.equal(retry.envelope.events.length, first.envelope.events.length);

    const awaiting = writeCalendarEventIntoEnvelope(first.envelope, {
      ...pending,
      status: "awaiting",
    });
    assert.equal(awaiting.updated, true);
    assert.equal(awaiting.deduped, false);
    assert.equal(
      awaiting.envelope.events.find((event) => event.id === pending.id)?.status,
      "awaiting",
    );
  });

  it("refuses to move an existing id onto another lane", () => {
    const seeded = createSeededCalendarEnvelope();
    assert.throws(
      () =>
        writeCalendarEventIntoEnvelope(
          seeded,
          parseCalendarEvent({
            id: "cadence-daily-brief",
            lane: "build",
            writer: "agent",
            start: "2026-09-21T07:00:00-05:00",
            title: "Daily Brief",
            status: "pending",
          }),
        ),
      (error: unknown) => error instanceof CalendarWriteError,
    );
  });

  it("drops a tampered agent gate and keeps the seed rows", () => {
    const parsed = parseCalendarEnvelope({
      version: 1,
      updatedAt: "2026-09-23T12:00:00.000Z",
      seededAt: "2026-09-23T12:00:00.000Z",
      events: [
        ...calendarSeed,
        {
          id: "gates-bot",
          lane: "gates",
          writer: "agent",
          start: "2026-09-24T15:00:00-05:00",
          title: "Bot gate",
          status: "open",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.events.length, calendarSeed.length);
  });

  it("picks blob, file, or none the same way fills does", () => {
    assert.equal(
      detectCalendarBackend({ BLOB_READ_WRITE_TOKEN: "token" }),
      "blob",
    );
    assert.equal(
      detectCalendarBackend({ RESONANCE_CALENDAR_FILE: ".data/calendar.json" }),
      "file",
    );
    assert.equal(detectCalendarBackend({ VERCEL: "1" }), "none");
    assert.equal(detectCalendarBackend({}), "file");
  });
});
