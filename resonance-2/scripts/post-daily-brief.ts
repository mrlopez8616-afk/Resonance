import { chicagoToday } from "../src/lib/calendar-time";
import { dailyBriefCalendarBody } from "../src/lib/calendar-writers";
import { postCalendarEvent } from "./post-calendar-event";

/**
 * Cadence writer for the external Daily Brief.
 *
 *   RESONANCE_SYNC_SECRET=... npm run calendar:brief -- 2026-09-25
 *   RESONANCE_SYNC_SECRET=... npm run calendar:brief -- 2026-09-25 --note "Desk note" --link https://example.com/brief
 *
 * Weekdays only. Id is cadence-daily-brief-YYYY-MM-DD. Repeat calls update that row.
 * Omit the date to use today in America/Chicago.
 */
function readArgs(argv: string[]): { day: string; note: string; link: string } {
  let day = "";
  let note = "";
  let link = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--note") {
      note = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--link") {
      link = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (!day) day = arg;
  }
  return { day: day || chicagoToday(), note, link };
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const event = dailyBriefCalendarBody(args.day, {
    note: args.note,
    link: args.link,
  });
  await postCalendarEvent(event);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
