import "server-only";

import { money } from "@/lib/bets";
import { BLOB_TAGS, cachedBlobRead, revalidateBlobTag } from "@/lib/blob-read";
import {
  BankrollDepositError,
  type StoredBankrollDeposit,
  type BankrollDepositVoid,
  type BankrollDepositWrite,
} from "@/lib/bankroll-deposits";
import { isDecimalString } from "@/lib/decimal";
import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { BANKROLL_DEPOSIT_VOIDS_SQL, BANKROLL_DEPOSITS_SQL } from "@/lib/pg/embedded-migrations";
import { splitSqlStatements } from "@/lib/pg/migrate";
import { isStorageUnavailable, StorageUnavailableError } from "@/lib/storage-unavailable";

export type DepositAvailability = "live" | "unavailable" | "unconfigured";

export type DepositRead = {
  rows: StoredBankrollDeposit[];
  availability: DepositAvailability;
  /** True when these rows are the previous successful read. */
  stale?: boolean;
};

type DepositRow = {
  id: string;
  date: unknown;
  amount: string;
  note: string | null;
  created_at: unknown;
  voided_at: unknown;
  void_reason: string | null;
};

const DEPOSIT_COLUMNS = `id,
       "date",
       amount::text AS amount,
       note,
       created_at,
       voided_at,
       void_reason`;

const LIST_SQL = `SELECT ${DEPOSIT_COLUMNS}
     FROM bankroll_deposits
     ORDER BY "date" ASC, id ASC`;

const INSERT_SQL = `INSERT INTO bankroll_deposits (id, "date", amount, note)
     VALUES ($1, $2::date, $3::numeric, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${DEPOSIT_COLUMNS}`;

const ONE_SQL = `SELECT ${DEPOSIT_COLUMNS}
     FROM bankroll_deposits
     WHERE id = $1`;

const VOID_SQL = `UPDATE bankroll_deposits
     SET voided_at = now(),
         void_reason = $2
     WHERE id = $1
       AND voided_at IS NULL
     RETURNING ${DEPOSIT_COLUMNS}`;

function failureText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return postgresFailureReason(error);
}

function missingTable(error: unknown): boolean {
  const reason = failureText(error);
  return /bankroll_deposits/i.test(reason) && /does not exist|no such/i.test(reason);
}

function missingVoidColumn(error: unknown): boolean {
  const reason = failureText(error);
  return /voided_at/i.test(reason) && /does not exist|no such/i.test(reason);
}

function dayText(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new BankrollDepositError("Deposit date could not be read.");
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? "").slice(0, 10);
}

function instantText(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new BankrollDepositError("Deposit time could not be read.");
    return value.toISOString();
  }
  const text = String(value ?? "");
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amountText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  return String(value ?? "").trim();
}

function mapRow(row: DepositRow): StoredBankrollDeposit {
  const printed = amountText(row.amount);
  if (!isDecimalString(printed)) throw new BankrollDepositError("Deposit amount could not be read.");
  const voidedAt = row.voided_at == null || row.voided_at === "" ? null : instantText(row.voided_at);
  const voidReason = optionalText(row.void_reason);
  return {
    id: String(row.id),
    date: dayText(row.date),
    amount: money(printed),
    note: optionalText(row.note),
    createdAt: instantText(row.created_at),
    voided: voidedAt !== null,
    voidedAt,
    voidReason: voidedAt ? voidReason : null,
  };
}

async function applyDepositVoids(): Promise<void> {
  for (const statement of splitSqlStatements(BANKROLL_DEPOSIT_VOIDS_SQL)) {
    await sqlQuery(statement);
  }
}

async function ensureDepositTable(): Promise<void> {
  try {
    await sqlQuery(`SELECT voided_at FROM bankroll_deposits LIMIT 1`);
    return;
  } catch (error) {
    if (!missingTable(error) && !missingVoidColumn(error)) throw error;
    if (missingTable(error)) {
      for (const statement of splitSqlStatements(BANKROLL_DEPOSITS_SQL)) {
        await sqlQuery(statement);
      }
    }
    await applyDepositVoids();
  }
}

async function readDepositsOk(): Promise<{
  status: "ok";
  rows: StoredBankrollDeposit[];
  stale?: boolean;
}> {
  try {
    await ensureDepositTable();
    const rows = await sqlQuery<DepositRow>(LIST_SQL);
    return { status: "ok", rows: rows.map(mapRow) };
  } catch (error) {
    if (isStorageUnavailable(error)) throw error;
    throw new StorageUnavailableError("bankroll-deposits", failureText(error));
  }
}

/** Every stored deposit. An empty list is unconfigured when Postgres is unset. */
export async function loadBankrollDeposits(): Promise<DepositRead> {
  if (!process.env.DATABASE_URL?.trim()) {
    return { rows: [], availability: "unconfigured" };
  }
  try {
    const loaded = await cachedBlobRead(BLOB_TAGS.bankrollDeposits, () => readDepositsOk());
    return {
      rows: loaded.rows,
      availability: "live",
      ...(loaded.stale ? { stale: true as const } : {}),
    };
  } catch (error) {
    console.error("bankroll deposit read failed", failureText(error));
    return { rows: [], availability: "unavailable" };
  }
}

/**
 * Insert one deposit. A repeat id returns the stored row and does not change it.
 */
export async function postBankrollDeposit(
  input: BankrollDepositWrite,
): Promise<{ deposit: StoredBankrollDeposit; deduped: boolean }> {
  await ensureDepositTable();
  const existing = await sqlQuery<DepositRow>(ONE_SQL, [input.id]);
  const stored = existing[0];
  if (stored) return { deposit: mapRow(stored), deduped: true };
  const inserted = await sqlQuery<DepositRow>(INSERT_SQL, [input.id, input.date, input.amount, input.note]);
  const created = inserted[0];
  if (created) {
    revalidateBlobTag(BLOB_TAGS.bankrollDeposits);
    return { deposit: mapRow(created), deduped: false };
  }
  const raced = await sqlQuery<DepositRow>(ONE_SQL, [input.id]);
  const row = raced[0];
  if (!row) throw new BankrollDepositError("Deposit could not be stored.", 500);
  revalidateBlobTag(BLOB_TAGS.bankrollDeposits);
  return { deposit: mapRow(row), deduped: true };
}

/**
 * Soft-void one deposit. The row stays. A second call returns that row
 * and does not change the timestamp or the reason.
 */
export async function voidBankrollDeposit(
  input: BankrollDepositVoid,
): Promise<{ deposit: StoredBankrollDeposit; deduped: boolean }> {
  await ensureDepositTable();
  const voided = await sqlQuery<DepositRow>(VOID_SQL, [input.id, input.reason]);
  const created = voided[0];
  if (created) {
    revalidateBlobTag(BLOB_TAGS.bankrollDeposits);
    return { deposit: mapRow(created), deduped: false };
  }
  const existing = await sqlQuery<DepositRow>(ONE_SQL, [input.id]);
  const stored = existing[0];
  if (!stored) throw new BankrollDepositError(`Unknown deposit id ${input.id}.`, 404);
  revalidateBlobTag(BLOB_TAGS.bankrollDeposits);
  return { deposit: mapRow(stored), deduped: true };
}
