import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarSeed } from "@/data/calendar";
import { CalendarWriteError, parseCalendarEvent } from "./calendar-event";
import {
  createEmptyCalendarEnvelope,
  createSeededCalendarEnvelope,
  detectCalendarBackend,
  ensureSeededCalendarEnvelope,
  parseCalendarEnvelope,
  writeCalendarEventIntoEnvelope,
} from "./calendar-store-core";

describe("calendar store core", () => {
  it("seeds cadence and the Monday capital history only", () => {
    const seeded = ensureSeededCalendarEnvelope(createEmptyCalendarEnvelope());
    assert.equal(seeded.seeded, true);
    assert.deepEqual(
      seeded.envelope.events.map((event) => event.lane),
      ["cadence", "capital"],
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
    assert.equal(again.envelope.events.length, calendarSeed.length);
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
    assert.equal(first.envelope.events.length, calendarSeed.length + 1);

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
