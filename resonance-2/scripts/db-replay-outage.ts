/**
 * Replay rows saved while Blob was suspended. Idempotent.
 *
 * File shape:
 *   { "bets": [ ... ], "settlements": [ ... ], "calendar": [ ... ] }
 *
 * Direct Postgres upsert (default):
 *   DATABASE_URL=postgres://... npm run db:replay -- --file outage.json
 *   DATABASE_URL=postgres://... npm run db:replay -- --file outage.json --dry-run
 *
 * POST to the live routes instead (same Bearer, same idempotency):
 *   RESONANCE_SYNC_SECRET=... npm run db:replay -- --file outage.json --post
 *   RESONANCE_BASE_URL defaults to https://resonance3.vercel.app
 */
import { readFileSync } from "node:fs";
import { replayOutage, type ReplayFile, type ReplayReport } from "../src/lib/pg/replay";
import { isStorageUnavailable } from "../src/lib/storage-unavailable";

function usage(): void {
  console.error(
    "Usage: npm run db:replay -- --file <outage.json> [--dry-run] [--post]",
  );
}

function readArgs(argv: string[]): { file: string; dryRun: boolean; post: boolean } {
  let file = "";
  let dryRun = false;
  let post = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--post") post = true;
    else if (arg === "--file") {
      file = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--file=")) file = arg.slice("--file=".length);
    else if (!arg.startsWith("--") && !file) file = arg;
  }
  return { file, dryRun, post };
}

async function postJson(url: string, secret: string, body: unknown): Promise<{ deduped: boolean }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { deduped?: boolean; error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `POST ${url} returned ${response.status}.`);
  }
  return { deduped: payload?.deduped === true };
}

async function replayByPost(file: ReplayFile, dryRun: boolean): Promise<ReplayReport> {
  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  if (!secret) throw new Error("RESONANCE_SYNC_SECRET is not set.");
  const base = (process.env.RESONANCE_BASE_URL?.trim() || "https://resonance3.vercel.app").replace(
    /\/$/,
    "",
  );
  const report: ReplayReport = {
    dryRun,
    bets: { read: 0, inserted: 0, updated: 0, deduped: 0, failed: 0 },
    settlements: { read: 0, inserted: 0, updated: 0, deduped: 0, failed: 0 },
    calendar: { read: 0, inserted: 0, updated: 0, deduped: 0, failed: 0 },
    failures: [],
  };
  const bets = Array.isArray(file.bets) ? file.bets : file.bets ? [file.bets] : [];
  const settlements = Array.isArray(file.settlements)
    ? file.settlements
    : file.settlements
      ? [file.settlements]
      : [];
  const calendar = Array.isArray(file.calendar)
    ? file.calendar
    : file.calendar
      ? [file.calendar]
      : Array.isArray(file.calendarEntries)
        ? file.calendarEntries
        : file.calendarEntries
          ? [file.calendarEntries]
          : [];
  report.bets.read = bets.length;
  report.settlements.read = settlements.length;
  report.calendar.read = calendar.length;

  async function send(
    domain: "bets" | "settlements" | "calendar",
    url: string,
    body: unknown,
    index: number,
  ): Promise<void> {
    if (dryRun) return;
    try {
      const result = await postJson(url, secret, body);
      if (result.deduped) report[domain].deduped += 1;
      else report[domain].inserted += 1;
    } catch (error) {
      report[domain].failed += 1;
      report.failures.push({
        domain,
        index,
        message: error instanceof Error ? error.message : "POST failed.",
      });
    }
  }

  for (const [index, row] of bets.entries()) {
    await send("bets", `${base}/api/bets`, row, index);
  }
  for (const [index, row] of settlements.entries()) {
    await send("settlements", `${base}/api/bets/settle`, row, index);
  }
  for (const [index, row] of calendar.entries()) {
    await send("calendar", `${base}/api/calendar`, row, index);
  }
  return report;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = readArgs(argv);
  if (!args.file) {
    usage();
    process.exit(1);
  }
  let file: ReplayFile;
  try {
    file = JSON.parse(readFileSync(args.file, "utf8")) as ReplayFile;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not read the outage file.");
    process.exit(1);
  }
  try {
    const report = args.post
      ? await replayByPost(file, args.dryRun)
      : await replayOutage(file, { dryRun: args.dryRun });
    console.log(JSON.stringify(report, null, 2));
    if (report.failures.length > 0) process.exit(1);
  } catch (error) {
    const reason = isStorageUnavailable(error)
      ? error.reason
      : error instanceof Error
        ? error.message
        : "replay failed";
    console.error(reason);
    process.exit(1);
  }
}

void main();
