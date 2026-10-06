import { BETS_BLOB_PATH, parseBetsEnvelope } from "@/lib/bets-store-core";
import { CALENDAR_BLOB_PATH, parseCalendarEnvelope } from "@/lib/calendar-store-core";
import { FILLS_BLOB_PATH, parseFillsEnvelope } from "@/lib/fills-store-core";
import {
  saveBetsEnvelope,
  saveCalendarEnvelope,
  saveFillsEnvelope,
  type WriteCounts,
} from "@/lib/pg/envelopes";
import { migrate } from "@/lib/pg/migrate";

export type BlobReadResult =
  | { status: "ok"; text: string }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export type ImportReport = {
  dryRun: boolean;
  bets: WriteCounts;
  settlements: WriteCounts;
  fills: WriteCounts;
  calendar: WriteCounts;
};

export class ImportError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "ImportError";
    this.status = status;
  }
}

const ZERO: WriteCounts = { read: 0, inserted: 0, updated: 0, unchanged: 0 };

function suspended(domain: string, reason: string): ImportError {
  return new ImportError(
    `Blob store is suspended or unreadable (${domain}): ${reason}. Import refused so Postgres is not filled from a failed read. Restore the resonance3-fills store, or replay a local outage file with npm run db:replay.`,
    503,
  );
}

function parseText<T>(domain: string, text: string, parse: (raw: unknown) => T | null): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError(`${domain} blob is not valid JSON. Import refused.`);
  }
  const parsed = parse(raw);
  if (!parsed) {
    throw new ImportError(
      `${domain} blob JSON does not match the store envelope. Import refused.`,
    );
  }
  return parsed;
}

/**
 * Read the three private blobs and upsert them into Postgres.
 * A suspended store (403) fails the whole run. A missing blob is an empty domain.
 * Re-running upserts the same rows and does not delete rows that are only in Postgres.
 */
export async function importBlobDocuments(options: {
  dryRun: boolean;
  read: (pathname: string) => Promise<BlobReadResult>;
}): Promise<ImportReport> {
  const reads = await Promise.all(
    [
      ["bets", BETS_BLOB_PATH],
      ["fills", FILLS_BLOB_PATH],
      ["calendar", CALENDAR_BLOB_PATH],
    ].map(async ([domain, pathname]) => {
      const body = await options.read(pathname);
      if (body.status === "unavailable") throw suspended(domain, body.reason);
      return [domain, body] as const;
    }),
  );
  const byDomain = new Map(reads);

  await migrate();

  const betsBody = byDomain.get("bets");
  const fillsBody = byDomain.get("fills");
  const calendarBody = byDomain.get("calendar");

  let bets = ZERO;
  let settlements = ZERO;
  if (betsBody?.status === "ok") {
    const envelope = parseText("bets", betsBody.text, parseBetsEnvelope);
    const written = await saveBetsEnvelope(envelope, {
      dryRun: options.dryRun,
      settlementSource: "import",
    });
    bets = written.bets;
    settlements = written.settlements;
  }

  let fills = ZERO;
  if (fillsBody?.status === "ok") {
    const envelope = parseText("fills", fillsBody.text, parseFillsEnvelope);
    fills = await saveFillsEnvelope(envelope, { dryRun: options.dryRun });
  }

  let calendar = ZERO;
  if (calendarBody?.status === "ok") {
    const envelope = parseText("calendar", calendarBody.text, parseCalendarEnvelope);
    calendar = await saveCalendarEnvelope(envelope, { dryRun: options.dryRun });
  }

  return { dryRun: options.dryRun, bets, settlements, fills, calendar };
}
