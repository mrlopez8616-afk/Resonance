import {
  DAILY_BRIEF_BACKFILL_DAYS,
  dailyBriefCalendarBody,
  dailyBriefEventId,
} from "../src/lib/calendar-writers";
import { postCalendarEvent } from "./post-calendar-event";

/**
 * Insert Sep 28 and Sep 29 2026 Daily Briefs when those ids are missing.
 * An existing row is skipped. This does not overwrite a hub post.
 *
 * The same bodies are inserted on the next calendar-store read after deploy.
 * This script is the POST form of that insert, for a hub run after merge.
 * It needs RESONANCE_SYNC_SECRET against resonance3. Do not send `sent`
 * to a host that has not deployed this status yet.
 *
 *   RESONANCE_SYNC_SECRET=... npm run calendar:brief:backfill
 */
function calendarReadUrl(): string {
  return (
    process.env.CALENDAR_URL?.trim() ||
    "https://resonance3.vercel.app/api/calendar"
  );
}

function syncSecret(): string {
  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  if (!secret) {
    console.error(
      "Set RESONANCE_SYNC_SECRET. The calendar read uses the same Bearer as POST /api/calendar. Do not prefix it with NEXT_PUBLIC_.",
    );
    process.exit(1);
  }
  return secret;
}

async function main(): Promise<void> {
  const secret = syncSecret();
  const url = calendarReadUrl();
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(text);
    process.exit(1);
  }
  const payload = JSON.parse(text) as { events?: { id?: string }[] };
  const ids = new Set(
    (payload.events ?? [])
      .map((event) => event.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const now = new Date();
  for (const day of DAILY_BRIEF_BACKFILL_DAYS) {
    const id = dailyBriefEventId(day);
    if (ids.has(id)) {
      console.log(JSON.stringify({ id, skipped: true }));
      continue;
    }
    await postCalendarEvent(dailyBriefCalendarBody(day, { now }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
