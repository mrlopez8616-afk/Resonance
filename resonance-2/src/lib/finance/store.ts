import "server-only";

import { getFinanceIngestToken } from "@/lib/finance/auth";
import {
  decryptFinancePayload,
  encryptFinancePayload,
  financeKeyFromEnv,
  snapshotSha256,
} from "@/lib/finance/crypto";
import { FINANCE_SCHEMA_VERSION, parseFinanceSnapshot, type FinanceSnapshot } from "@/lib/finance/schema";
import { sqlQuery } from "@/lib/pg/client";
import { StorageUnavailableError } from "@/lib/storage-unavailable";
import { financeAsOfStale, linkedNetWorth, type NetWorthPoint } from "@/lib/finance/view";

const KEEP = 30;

type SnapshotRow = {
  as_of: unknown;
  schema_version: number | string;
  sha256: string;
  payload_enc: string;
  iv: string;
  tag: string;
  stored_at: unknown;
};

export type StoredFinanceSnapshot = {
  snapshot: FinanceSnapshot;
  storedAt: string;
};

export type FinanceWriteResult = {
  deduped: boolean;
  asOf: string;
  storedAt: string;
};

export type FinancePageData =
  | { status: "waiting" }
  | { status: "unavailable" }
  | { status: "live"; snapshot: FinanceSnapshot; storedAt: string; stale: boolean };

function asOfText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match?.[1] ?? "";
}

function storedAtText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function openRow(row: SnapshotRow, key: Buffer): StoredFinanceSnapshot {
  const asOf = asOfText(row.as_of);
  let plain = "";
  try {
    plain = decryptFinancePayload(
      { payloadEnc: row.payload_enc, iv: row.iv, tag: row.tag },
      key,
      asOf,
    );
  } catch {
    throw new StorageUnavailableError("finance", "Finance snapshot could not be read.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new StorageUnavailableError("finance", "Finance snapshot could not be read.");
  }
  const result = parseFinanceSnapshot(parsed);
  if (!result.ok) {
    throw new StorageUnavailableError("finance", "Finance snapshot could not be read.");
  }
  return { snapshot: result.value, storedAt: storedAtText(row.stored_at) };
}

async function pruneFinanceSnapshots(): Promise<void> {
  const rows = await sqlQuery<{ as_of: unknown }>(
    `SELECT as_of FROM finance_snapshots ORDER BY as_of DESC`,
  );
  for (const row of rows.slice(KEEP)) {
    const asOf = asOfText(row.as_of);
    if (!asOf) continue;
    await sqlQuery(`DELETE FROM finance_snapshots WHERE as_of = $1`, [asOf]);
  }
}

export async function writeFinanceSnapshot(
  snapshot: FinanceSnapshot,
  canonical: string,
): Promise<FinanceWriteResult> {
  const key = financeKeyFromEnv();
  if (!key) {
    throw new StorageUnavailableError("finance", "Finance encryption is not configured.");
  }
  const sha = snapshotSha256(canonical);
  const existing = await sqlQuery<{ as_of: unknown; stored_at: unknown }>(
    `SELECT as_of, stored_at FROM finance_snapshots WHERE sha256 = $1`,
    [sha],
  );
  const prior = existing[0];
  if (prior) {
    return { deduped: true, asOf: asOfText(prior.as_of), storedAt: storedAtText(prior.stored_at) };
  }

  const encrypted = encryptFinancePayload(canonical, key, snapshot.asOf);
  const storedAt = new Date().toISOString();
  try {
    await sqlQuery(
      `INSERT INTO finance_snapshots
         (as_of, schema_version, sha256, payload_enc, iv, tag, stored_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (as_of) DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         sha256 = EXCLUDED.sha256,
         payload_enc = EXCLUDED.payload_enc,
         iv = EXCLUDED.iv,
         tag = EXCLUDED.tag,
         stored_at = EXCLUDED.stored_at`,
      [
        snapshot.asOf,
        snapshot.schemaVersion ?? FINANCE_SCHEMA_VERSION,
        sha,
        encrypted.payloadEnc,
        encrypted.iv,
        encrypted.tag,
        storedAt,
      ],
    );
  } catch (error) {
    const again = await sqlQuery<{ as_of: unknown; stored_at: unknown }>(
      `SELECT as_of, stored_at FROM finance_snapshots WHERE sha256 = $1`,
      [sha],
    ).catch(() => []);
    const raced = again[0];
    if (raced) {
      return { deduped: true, asOf: asOfText(raced.as_of), storedAt: storedAtText(raced.stored_at) };
    }
    throw error;
  }
  await pruneFinanceSnapshots();
  return { deduped: false, asOf: snapshot.asOf, storedAt };
}

export async function readLatestFinanceSnapshot(): Promise<StoredFinanceSnapshot | null> {
  const key = financeKeyFromEnv();
  if (!key) {
    throw new StorageUnavailableError("finance", "Finance encryption is not configured.");
  }
  const rows = await sqlQuery<SnapshotRow>(
    `SELECT as_of, schema_version, sha256, payload_enc, iv, tag, stored_at
     FROM finance_snapshots
     ORDER BY as_of DESC
     LIMIT 1`,
  );
  const row = rows[0];
  return row ? openRow(row, key) : null;
}

export async function readFinanceNetWorthSeries(limit = 12): Promise<NetWorthPoint[]> {
  const key = financeKeyFromEnv();
  if (!key) return [];
  const rows = await sqlQuery<SnapshotRow>(
    `SELECT as_of, schema_version, sha256, payload_enc, iv, tag, stored_at
     FROM finance_snapshots
     ORDER BY as_of DESC
     LIMIT $1`,
    [limit],
  );
  const points: NetWorthPoint[] = [];
  for (const row of rows) {
    try {
      const opened = openRow(row, key);
      const net = linkedNetWorth(opened.snapshot);
      if (net === null) continue;
      points.push({ asOf: opened.snapshot.asOf, net });
    } catch {
      // A row that cannot be read is left off the chart.
    }
  }
  return points.reverse();
}

function financeConfigured(): { ok: true } | { ok: false; error: string } {
  if (!getFinanceIngestToken()) {
    return { ok: false, error: "Finance ingest is not configured." };
  }
  if (!financeKeyFromEnv()) {
    return { ok: false, error: "Finance encryption is not configured." };
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return { ok: false, error: "Postgres is not configured." };
  }
  return { ok: true };
}

/**
 * Owner read. Zero rows is `{ snapshot: null }` with status 200.
 * 503 is only a missing env var or a database that cannot be queried.
 */
export async function readOwnerFinanceSnapshot(): Promise<
  | { ok: true; snapshot: FinanceSnapshot | null }
  | { ok: false; status: 503; error: string }
> {
  const configured = financeConfigured();
  if (!configured.ok) return { ok: false, status: 503, error: configured.error };
  try {
    const latest = await readLatestFinanceSnapshot();
    return { ok: true, snapshot: latest?.snapshot ?? null };
  } catch {
    return { ok: false, status: 503, error: "Postgres is not configured." };
  }
}

export async function loadFinancePage(now = new Date()): Promise<FinancePageData> {
  if (!financeConfigured().ok) return { status: "unavailable" };
  try {
    const latest = await readLatestFinanceSnapshot();
    if (!latest) return { status: "waiting" };
    return {
      status: "live",
      snapshot: latest.snapshot,
      storedAt: latest.storedAt,
      stale: financeAsOfStale(latest.snapshot.asOf, now),
    };
  } catch {
    return { status: "unavailable" };
  }
}
