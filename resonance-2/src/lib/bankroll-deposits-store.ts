import "server-only";

import { money } from "@/lib/bets";
import {
  BankrollDepositError,
  type StoredBankrollDeposit,
  type BankrollDepositWrite,
} from "@/lib/bankroll-deposits";
import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { BANKROLL_DEPOSITS_SQL } from "@/lib/pg/embedded-migrations";
import { splitSqlStatements } from "@/lib/pg/migrate";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type DepositAvailability = "live" | "unavailable" | "unconfigured";

export type DepositRead = {
  rows: StoredBankrollDeposit[];
  availability: DepositAvailability;
};

type DepositRow = {
  id: string;
  date: unknown;
  amount: string;
  note: string | null;
  created_at: unknown;
};

const LIST_SQL = `SELECT id,
       "date",
       amount::text AS amount,
       note,
       created_at
     FROM bankroll_deposits
     ORDER BY "date" ASC, id ASC`;

const INSERT_SQL = `INSERT INTO bankroll_deposits (id, "date", amount, note)
     VALUES ($1, $2::date, $3::numeric, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, "date", amount::text AS amount, note, created_at`;

const ONE_SQL = `SELECT id,
       "date",
       amount::text AS amount,
       note,
       created_at
     FROM bankroll_deposits
     WHERE id = $1`;

function failureText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return postgresFailureReason(error);
}

function missingTable(error: unknown): boolean {
  const reason = failureText(error);
  return /bankroll_deposits/i.test(reason) && /does not exist|no such/i.test(reason);
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

function mapRow(row: DepositRow): StoredBankrollDeposit {
  return {
    id: String(row.id),
    date: dayText(row.date),
    amount: money(String(row.amount)),
    note: row.note?.trim() ? row.note.trim() : null,
    createdAt: instantText(row.created_at),
  };
}

async function ensureDepositTable(): Promise<void> {
  try {
    await sqlQuery(`SELECT 1 AS ok FROM bankroll_deposits LIMIT 1`);
  } catch (error) {
    if (!missingTable(error)) throw error;
    for (const statement of splitSqlStatements(BANKROLL_DEPOSITS_SQL)) {
      await sqlQuery(statement);
    }
  }
}

/** Every stored deposit. An empty list is unconfigured when Postgres is unset. */
export async function loadBankrollDeposits(): Promise<DepositRead> {
  if (!process.env.DATABASE_URL?.trim()) {
    return { rows: [], availability: "unconfigured" };
  }
  try {
    await ensureDepositTable();
    const rows = await sqlQuery<DepositRow>(LIST_SQL);
    return { rows: rows.map(mapRow), availability: "live" };
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
  if (created) return { deposit: mapRow(created), deduped: false };
  const raced = await sqlQuery<DepositRow>(ONE_SQL, [input.id]);
  const row = raced[0];
  if (!row) throw new BankrollDepositError("Deposit could not be stored.", 500);
  return { deposit: mapRow(row), deduped: true };
}
