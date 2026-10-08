import { z } from "zod";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const day = z.string().regex(DAY);
const month = z.string().regex(MONTH);
const money = z.number().finite();
const label = z.string().min(1).max(80);
const note = z.string().min(1).max(240);

export const FINANCE_SCHEMA_VERSION = 1;
export const FINANCE_FEE_WINDOW_DAYS = 90;

const accountSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: label,
  institution: label,
  type: z.enum(["checking", "savings", "credit", "loan", "brokerage"]),
  last4: z.string().regex(/^\d{4}$/),
  balance: money,
  available: money.optional(),
  limit: money.optional(),
  apr: money.nullable().optional(),
  linked: z.literal(true),
});

const unlinkedSchema = z.strictObject({
  name: label,
  type: z.string().min(1).max(40),
  note: note,
});

const cashMonthSchema = z.strictObject({
  month,
  income: money,
  spend: money,
  net: money,
  partial: z.boolean().optional(),
});

const cashFlowSchema = z.strictObject({
  months: z.array(cashMonthSchema).max(36),
  thisMonth: z.strictObject({
    income: money,
    spend: money,
    net: money,
    daysElapsed: z.number().int().min(0).max(31),
  }),
  avgNet3: money,
  avgNet12: money,
});

const categorySchema = z.strictObject({
  class: label,
  subcategory: label,
  months: z.record(month, money),
  avgFullMonths: money,
  avgLast3: money,
});

const recurringSchema = z.strictObject({
  item: label,
  medianAmount: money,
  min: money,
  max: money,
  medianDay: z.number().int().min(1).max(31),
  monthsSeen: z.number().int().min(0).max(240),
  lastSeen: day,
  nextDueEstimate: day.optional(),
});

const debtSchema = z.strictObject({
  accountId: z.string().min(1).max(64).optional(),
  name: label.optional(),
  balance: money,
  apr: money.nullable(),
  minPayment: money.nullable().optional(),
  linked: z.boolean(),
});

const feeSchema = z.strictObject({
  date: day,
  account: label,
  amount: money,
  kind: z.enum(["overdraft", "nsf", "transfer", "interest", "other"]),
  name: label,
});

const alertSchema = z.strictObject({
  kind: z.string().min(1).max(40),
  severity: z.enum(["info", "warn", "critical"]),
  message: z.string().min(1).max(280),
});

export const financeSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(FINANCE_SCHEMA_VERSION).optional(),
    asOf: day,
    accounts: z.array(accountSchema).max(40),
    unlinked: z.array(unlinkedSchema).max(40),
    cashFlow: cashFlowSchema,
    categories: z.array(categorySchema).max(200),
    recurring: z.array(recurringSchema).max(200),
    debts: z.array(debtSchema).max(80),
    fees: z.array(feeSchema).max(200),
    alerts: z.array(alertSchema).max(40),
    coverage: z.strictObject({
      missing: z.array(z.string().min(1).max(80)).max(40),
    }),
  })
  .superRefine((snapshot, ctx) => {
    const reject = (path: (string | number)[]) => {
      ctx.addIssue({ code: "custom", message: "rejected", path });
    };
    if (snapshot.cashFlow.thisMonth.income < 0) reject(["cashFlow", "thisMonth", "income"]);
    if (snapshot.cashFlow.thisMonth.spend < 0) reject(["cashFlow", "thisMonth", "spend"]);
    const seenMonths = new Set<string>();
    snapshot.cashFlow.months.forEach((row, index) => {
      if (seenMonths.has(row.month)) reject(["cashFlow", "months", index, "month"]);
      seenMonths.add(row.month);
      if (row.income < 0) reject(["cashFlow", "months", index, "income"]);
      if (row.spend < 0) reject(["cashFlow", "months", index, "spend"]);
    });
    snapshot.categories.forEach((category, index) => {
      if (category.avgFullMonths < 0) reject(["categories", index, "avgFullMonths"]);
      if (category.avgLast3 < 0) reject(["categories", index, "avgLast3"]);
      for (const [key, amount] of Object.entries(category.months)) {
        if (amount < 0) reject(["categories", index, "months", key]);
      }
    });
    snapshot.recurring.forEach((item, index) => {
      if (item.medianAmount < 0) reject(["recurring", index, "medianAmount"]);
      if (item.min < 0) reject(["recurring", index, "min"]);
      if (item.max < 0) reject(["recurring", index, "max"]);
    });
    snapshot.debts.forEach((debt, index) => {
      if (!debt.accountId && !debt.name) reject(["debts", index]);
    });
    snapshot.fees.forEach((fee, index) => {
      if (fee.amount <= 0) reject(["fees", index, "amount"]);
      const age = civilDaysBetween(fee.date, snapshot.asOf);
      if (age < 0 || age > FINANCE_FEE_WINDOW_DAYS) reject(["fees", index, "date"]);
    });
  });

export type FinanceSnapshot = z.infer<typeof financeSnapshotSchema>;

export function civilDaysBetween(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split("-").map(Number);
  const [ly, lm, ld] = later.split("-").map(Number);
  const start = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1);
  const end = Date.UTC(ly, (lm ?? 1) - 1, ld ?? 1);
  return Math.round((end - start) / 86_400_000);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

/** Stable JSON for the sha256 dedupe key. Key order does not matter. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function publicPath(path: readonly PropertyKey[]): string {
  const text = path.map((part) => String(part)).join(".");
  if (!text || text.length > 80 || !/^[A-Za-z0-9_.]+$/.test(text)) return "body";
  return text;
}

export function parseFinanceSnapshot(
  input: unknown,
): { ok: true; value: FinanceSnapshot; canonical: string } | { ok: false; error: string } {
  const result = financeSnapshotSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: `Snapshot field ${publicPath(result.error.issues[0]?.path ?? [])} was rejected.` };
  }
  return { ok: true, value: result.data, canonical: canonicalJson(result.data) };
}
