import "server-only";

import {
  canonicalManualValue,
  type ManualSummary,
  type ManualSummaryWrite,
} from "@/lib/fitness-manual";
import { FITNESS_MANUAL_SUMMARIES_SQL } from "@/lib/pg/embedded-migrations";
import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { splitSqlStatements } from "@/lib/pg/migrate";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type ManualAvailability = "live" | "unavailable" | "unconfigured";

export type ManualRead = {
  entries: ManualSummary[];
  availability: ManualAvailability;
};

type ManualRow = {
  id: string;
  entry_date: unknown;
  period_start: unknown;
  period_end: unknown;
  app: string;
  metric: string;
  value: string;
  unit: string;
  approx: unknown;
  note: string | null;
  source: string;
  created_at: unknown;
};

const LIST_SQL = `SELECT id::text AS id,
       entry_date,
       period_start,
       period_end,
       app,
       metric,
       value::text AS value,
       unit,
       approx,
       note,
       source,
       created_at
     FROM fitness_manual_summaries
     ORDER BY period_end DESC, period_start DESC, entry_date DESC, app ASC, metric ASC`;

const UPSERT_SQL = `INSERT INTO fitness_manual_summaries (
       entry_date, period_start, period_end, app, metric, value, unit, approx, note, source
     ) VALUES (
       $1::date, $2::date, $3::date, $4, $5, $6::numeric, $7, $8, $9, $10
     )
     ON CONFLICT (period_start, period_end, app, metric) DO UPDATE SET
       entry_date = EXCLUDED.entry_date,
       value = EXCLUDED.value,
       unit = EXCLUDED.unit,
       approx = EXCLUDED.approx,
       note = EXCLUDED.note,
       source = EXCLUDED.source
     RETURNING id::text AS id,
       entry_date,
       period_start,
       period_end,
       app,
       metric,
       value::text AS value,
       unit,
       approx,
       note,
       source,
       created_at`;

function failureText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return postgresFailureReason(error);
}

function missingManualTable(error: unknown): boolean {
  const reason = failureText(error);
  return /fitness_manual_summaries/i.test(reason) && /does not exist|no such/i.test(reason);
}

function dayText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function instantText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "");
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function mapRow(row: ManualRow): ManualSummary {
  return {
    id: String(row.id),
    entryDate: dayText(row.entry_date),
    periodStart: dayText(row.period_start),
    periodEnd: dayText(row.period_end),
    app: row.app,
    metric: row.metric,
    value: canonicalManualValue(String(row.value)),
    unit: row.unit,
    approx: asBool(row.approx),
    note: row.note?.trim() ? row.note.trim() : null,
    source: row.source,
    createdAt: instantText(row.created_at),
  };
}

async function ensureManualTable(): Promise<void> {
  try {
    await sqlQuery(`SELECT 1 AS ok FROM fitness_manual_summaries LIMIT 1`);
  } catch (error) {
    if (!missingManualTable(error)) throw error;
    for (const statement of splitSqlStatements(FITNESS_MANUAL_SUMMARIES_SQL)) {
      await sqlQuery(statement);
    }
  }
}

/** Read every stored summary. Daily and run tables are not queried. */
export async function loadFitnessManual(): Promise<ManualRead> {
  if (!process.env.DATABASE_URL?.trim()) {
    return { entries: [], availability: "unconfigured" };
  }
  try {
    await ensureManualTable();
    const rows = await sqlQuery<ManualRow>(LIST_SQL);
    return { entries: rows.map(mapRow), availability: "live" };
  } catch (error) {
    console.error("fitness manual read failed", failureText(error));
    return { entries: [], availability: "unavailable" };
  }
}

export async function upsertManualSummaries(entries: readonly ManualSummaryWrite[]): Promise<ManualSummary[]> {
  await ensureManualTable();
  const written: ManualSummary[] = [];
  for (const entry of entries) {
    const rows = await sqlQuery<ManualRow>(UPSERT_SQL, [
      entry.entryDate,
      entry.periodStart,
      entry.periodEnd,
      entry.app,
      entry.metric,
      entry.value,
      entry.unit,
      entry.approx,
      entry.note,
      entry.source,
    ]);
    const row = rows[0];
    if (!row) throw new Error("Fitness manual upsert did not return a row.");
    written.push(mapRow(row));
  }
  return written;
}
