import "server-only";

import {
  printerFeedStale,
  printerReadingAt,
  type PrinterLatest,
  type PrinterSnapshot,
  type PrinterSupply,
} from "@/lib/printer";
import { sqlQuery } from "@/lib/pg/client";

type LatestRow = {
  id: string;
  printer_model: string | null;
  read_at: string | Date | null;
  received_at: string | Date;
  version: string | null;
  supplies: unknown;
};

const INSERT_SQL = `INSERT INTO printer_snapshots (
  printer_model, read_at, received_at, version, supplies, payload
) VALUES (
  $1, $2::timestamptz, now(), $3, $4::jsonb, $5::jsonb
)`;

function asTime(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function asJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function supplies(value: unknown): PrinterSupply[] {
  const parsed = asJson(value);
  if (!Array.isArray(parsed)) return [];
  const rows: PrinterSupply[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<PrinterSupply>;
    if (record.supplyType !== "inkCartridge" && record.supplyType !== "printHead") continue;
    if (record.color !== "C" && record.color !== "M" && record.color !== "Y" && record.color !== "K" && record.color !== "CMYK") {
      continue;
    }
    const percent = typeof record.percent === "number" && Number.isFinite(record.percent) ? record.percent : null;
    const pages = typeof record.pagesRemaining === "number" && Number.isFinite(record.pagesRemaining) ? record.pagesRemaining : null;
    const state = record.state === "ok" || record.state === "low" || record.state === "depleted" ? record.state : null;
    rows.push({
      supplyType: record.supplyType,
      color: record.color,
      percent,
      state,
      buy: typeof record.buy === "string" && record.buy.trim() ? record.buy : null,
      pagesRemaining: pages,
    });
  }
  return rows;
}

function mapLatest(row: LatestRow): PrinterLatest | null {
  const receivedAt = asTime(row.received_at);
  if (!receivedAt) return null;
  const readAt = row.read_at ? asTime(row.read_at) : null;
  return {
    id: String(row.id),
    printerModel: row.printer_model?.trim() || null,
    readAt,
    receivedAt,
    shownAt: printerReadingAt(readAt, receivedAt),
    version: row.version?.trim() || null,
    supplies: supplies(row.supplies),
  };
}

export async function readPrinterTokenHash(): Promise<string | null> {
  const rows = await sqlQuery<{ token_hash: string }>(
    `SELECT token_hash FROM printer_tokens WHERE id = 1`,
  );
  const hash = rows[0]?.token_hash?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export async function printerTokenConfigured(): Promise<boolean> {
  return (await readPrinterTokenHash()) !== null;
}

/** Stores the digest only. The caller shows the plaintext once and does not log it. */
export async function savePrinterTokenHash(tokenHash: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("token hash must be 64 hex characters");
  await sqlQuery(
    `INSERT INTO printer_tokens (id, token_hash, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       updated_at = now()`,
    [tokenHash],
  );
}

export async function writePrinterSnapshot(snapshot: PrinterSnapshot, payload: unknown): Promise<void> {
  await sqlQuery(INSERT_SQL, [
    snapshot.printerModel,
    snapshot.readAt,
    snapshot.version,
    JSON.stringify(snapshot.supplies),
    JSON.stringify(payload),
  ]);
}

export async function readPrinterPage(now = Date.now()): Promise<{ latest: PrinterLatest | null; stale: boolean }> {
  const rows = await sqlQuery<LatestRow>(
    `SELECT id::text AS id, printer_model, read_at, received_at, version, supplies
     FROM printer_snapshots
     ORDER BY received_at DESC, id DESC
     LIMIT 1`,
  );
  const latest = rows[0] ? mapLatest(rows[0]) : null;
  return {
    latest,
    stale: latest ? printerFeedStale(latest.shownAt, now) : false,
  };
}

export async function loadPrinterFreshness(now = Date.now()): Promise<{
  receivedAt: string | null;
  stale: boolean;
}> {
  const page = await readPrinterPage(now);
  if (!page.latest) return { receivedAt: null, stale: false };
  return { receivedAt: page.latest.shownAt, stale: page.stale };
}
