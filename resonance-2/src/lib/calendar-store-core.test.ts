import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalystSeed } from "@/data/catalyst-seed";
import { calendarSeed } from "@/data/calendar";
import { fightCalendar } from "@/data/fight-calendar";
import { DAILY_BRIEF_BACKFILL_DAYS } from "@/lib/calendar-writers";
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
    assert.equal(
      seeded.envelope.events.length,
      calendarSeed.length +
        catalystSeed.length +
        fightCalendar.length +
        DAILY_BRIEF_BACKFILL_DAYS.length,
    );
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
    assert.equal(
      again.envelope.events.length,
      calendarCatalog().length + DAILY_BRIEF_BACKFILL_DAYS.length,
    );
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
    assert.equal(
      merged.envelope.events.length,
      calendarSeed.length +
        catalystSeed.length +
        fightCalendar.length +
        DAILY_BRIEF_BACKFILL_DAYS.length,
    );

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

  it("inserts missing Daily Briefs and does not overwrite an existing id", () => {
    const now = "2026-09-30T18:00:00.000Z";
    const seeded = ensureSeededCalendarEnvelope(createEmptyCalendarEnvelope(now), now);
    for (const day of DAILY_BRIEF_BACKFILL_DAYS) {
      const rows = seeded.envelope.events.filter(
        (event) => event.id === `cadence-daily-brief-${day}`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.lane, "cadence");
      assert.equal(rows[0]?.title, "Daily Brief");
      assert.equal(rows[0]?.status, "sent");
      assert.equal(rows[0]?.writer, "agent");
      assert.equal(rows[0]?.start, `${day}T07:02:00-05:00`);
    }

    const kept = {
      ...seeded.envelope,
      events: seeded.envelope.events.map((event) =>
        event.id === "cadence-daily-brief-2026-09-28"
          ? { ...event, title: "Hub brief", note: "already posted", status: "scheduled" as const }
          : event,
      ),
    };
    const again = ensureSeededCalendarEnvelope(kept, "2026-10-01T18:00:00.000Z");
    const row = again.envelope.events.find(
      (event) => event.id === "cadence-daily-brief-2026-09-28",
    );
    assert.equal(row?.title, "Hub brief");
    assert.equal(row?.note, "already posted");
    assert.equal(row?.status, "scheduled");
    assert.equal(
      again.envelope.events.filter((event) => event.id === "cadence-daily-brief-2026-09-28")
        .length,
      1,
    );
    assert.equal(again.seeded, false);
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

  it("stores a fights lane row and drops an unknown lane", () => {
    const posted = parseCalendarEvent({
      id: "ufc-326-early-prelims",
      lane: "fights",
      writer: "agent",
      start: "2027-02-06T15:00:00-06:00",
      title: "UFC 326 early prelims",
      status: "scheduled",
      eventSlug: "ufc-326",
      href: "/fights/ufc-326",
    });
    const written = writeCalendarEventIntoEnvelope(createEmptyCalendarEnvelope(), posted);
    assert.equal(written.deduped, false);
    assert.equal(written.event.lane, "fights");
    const roundTrip = parseCalendarEnvelope(JSON.parse(JSON.stringify(written.envelope)));
    assert.ok(roundTrip);
    assert.equal(roundTrip.events.length, 1);
    assert.equal(roundTrip.events[0]?.lane, "fights");
    assert.equal(roundTrip.events[0]?.eventSlug, "ufc-326");
    assert.equal(roundTrip.events[0]?.link, "/fights/ufc-326");
    assert.equal(roundTrip.events[0]?.writer, "agent");

    const again = writeCalendarEventIntoEnvelope(written.envelope, posted);
    assert.equal(again.deduped, true);

    const unknown = parseCalendarEnvelope({
      version: 1,
      updatedAt: "2026-10-03T12:00:00.000Z",
      seededAt: null,
      events: [
        {
          id: "not-a-lane",
          lane: "ufc",
          writer: "agent",
          start: "2026-10-03T19:00:00-05:00",
          title: "Unknown",
          status: "scheduled",
        },
        posted,
      ],
    });
    assert.ok(unknown);
    assert.deepEqual(
      unknown.events.map((event) => event.id),
      ["ufc-326-early-prelims"],
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
      detectCalendarBackend({
        DATABASE_URL: "postgres://local/db",
        BLOB_READ_WRITE_TOKEN: "token",
      }),
      "postgres",
    );
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
