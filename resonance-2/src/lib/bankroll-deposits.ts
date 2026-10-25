import { money } from "@/lib/bets";
import { isDecimalString } from "@/lib/decimal";

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT = /^-?(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const NOTE_MAX = 500;

export class BankrollDepositError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BankrollDepositError";
    this.status = status;
  }
}

/** One stored row. amount is a signed two-decimal string. A void keeps the row. */
export type StoredBankrollDeposit = {
  id: string;
  date: string;
  amount: string;
  note: string | null;
  createdAt: string;
  /** True once the row has been voided. The amount stays. */
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
};

export type BankrollDepositWrite = {
  id: string;
  date: string;
  amount: string;
  note: string | null;
};

export type BankrollDepositVoid = {
  id: string;
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function civilDate(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function canonicalAmount(value: string): string {
  const printed = money(value);
  return printed === "-0.00" ? "0.00" : printed;
}

/** Strict body: {id, date, amount, note}. A negative amount is a withdrawal. */
export function parseBankrollDeposit(body: unknown): BankrollDepositWrite {
  if (!isRecord(body)) throw new BankrollDepositError("JSON object is required.");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!ID.test(id)) throw new BankrollDepositError("id must be a lowercase slug.");
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!civilDate(date)) throw new BankrollDepositError("date must be YYYY-MM-DD.");
  if (typeof body.amount !== "string" || !AMOUNT.test(body.amount.trim()) || !isDecimalString(body.amount)) {
    throw new BankrollDepositError("amount must be a decimal string.");
  }
  const amount = canonicalAmount(body.amount);
  if (typeof body.note !== "string") throw new BankrollDepositError("note must be a string.");
  const note = body.note.trim();
  if (note.length > NOTE_MAX) throw new BankrollDepositError("note is too long.");
  return { id, date, amount, note: note || null };
}

/** `{ id, reason }`. Reason is required and is stored with the void. */
export function parseBankrollDepositVoid(body: unknown): BankrollDepositVoid {
  if (!isRecord(body)) throw new BankrollDepositError("JSON object is required.");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!ID.test(id)) throw new BankrollDepositError("id must be a lowercase slug.");
  if (typeof body.reason !== "string") throw new BankrollDepositError("reason must be a string.");
  const reason = body.reason.trim();
  if (!reason) throw new BankrollDepositError("reason is required.");
  if (reason.length > NOTE_MAX) throw new BankrollDepositError("reason is too long.");
  return { id, reason };
}
