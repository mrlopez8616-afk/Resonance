import { NextResponse } from "next/server";
import { CALENDAR_TIME_ZONE } from "@/data/calendar";
import {
  asCalendarWriteError,
  isCalendarStoreConfigured,
  loadCalendarStore,
  writeStoredCalendarEvent,
} from "@/lib/calendar-store";
import { occurrencesOnDay } from "@/lib/calendar-desk";
import { listCalendarEvents } from "@/lib/calendar-store-core";
import { isCivilDay } from "@/lib/calendar-time";
import { authorizeSyncRequest } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "Calendar store is not configured. In Vercel: Storage → Blob → connect resonance3 → redeploy. See cabinet/operating-calendar.md.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day")?.trim() ?? "";
  if (day && !isCivilDay(day)) {
    return NextResponse.json(
      { ok: false, error: "day must be YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const loaded = await loadCalendarStore();
    const events = listCalendarEvents(loaded.envelope.events);
    return NextResponse.json({
      ok: true,
      configured: loaded.configured,
      backend: loaded.backend,
      seeded: loaded.seeded,
      updatedAt: loaded.envelope.updatedAt,
      timeZone: CALENDAR_TIME_ZONE,
      events,
      ...(day ? { day, occurrences: occurrencesOnDay(events, day) } : {}),
    });
  } catch (error) {
    const mapped = asCalendarWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isCalendarStoreConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is required." },
      { status: 400 },
    );
  }

  try {
    const written = await writeStoredCalendarEvent(body);
    return NextResponse.json({
      ok: true,
      deduped: written.deduped,
      updated: written.updated,
      configured: true,
      backend: written.backend,
      seeded: written.seeded,
      event: written.event,
      updatedAt: written.envelope.updatedAt,
    });
  } catch (error) {
    const mapped = asCalendarWriteError(error);
    console.error("calendar write failed", mapped.message);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
