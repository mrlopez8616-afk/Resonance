import { formatCivilDate } from "@/lib/calendar-time";
import { civilDaysBetween, type FinanceSnapshot } from "@/lib/finance/schema";

export const FINANCE_STALE_MS = 48 * 60 * 60 * 1000;
export const FINANCE_FEE_CARD_DAYS = 30;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ASSET_TYPES = new Set(["checking", "savings", "brokerage"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export const FINANCE_NODES = [
  { id: "cash-flow", title: "Cash Flow" },
  { id: "bills", title: "Bills & Subscriptions" },
  { id: "debt", title: "Debt" },
  { id: "net-worth", title: "Net Worth" },
  { id: "fees", title: "Fees & Alerts" },
] as const;

export type FinanceNodeId = (typeof FINANCE_NODES)[number]["id"];

export function financeNode(id: string): (typeof FINANCE_NODES)[number] | null {
  return FINANCE_NODES.find((node) => node.id === id) ?? null;
}

export type FlowMonth = {
  label: string;
  income: number;
  spend: number;
};

export type AmountPoint = {
  label: string;
  amount: number;
};

export type FinanceCardModel = {
  id: FinanceNodeId;
  title: string;
  href: string;
  headline: string | null;
  lines: string[];
  bars: FlowMonth[] | null;
};

export type FinanceHomeFace = {
  headline: string;
  asOfLine: string;
};

export type FinanceTableModel = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type FinanceDetailModel = {
  title: string;
  headline: string | null;
  lines: string[];
  partial: boolean;
  missing: string[];
  alerts: { severity: string; message: string }[];
  flow: FlowMonth[] | null;
  amounts: AmountPoint[] | null;
  amountLabel: string | null;
  tables: FinanceTableModel[];
};

export type NetWorthPoint = {
  asOf: string;
  net: number;
};

export function formatFinanceUsd(amount: number): string | null {
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = abs % 100;
  const text = frac === 0 ? `$${dollars}` : `$${dollars}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

export function formatApr(apr: number | null): string {
  if (apr === null) return "APR unknown";
  return `${apr}% APR`;
}

export function financeAsOfStale(asOf: string, now: Date): boolean {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at > FINANCE_STALE_MS;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}

function keep(values: readonly (string | null | undefined)[], limit: number): string[] {
  const lines: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || /\b(?:undefined|NaN)\b/.test(trimmed)) continue;
    lines.push(trimmed);
    if (lines.length >= limit) break;
  }
  return lines;
}

function monthLabels(months: readonly string[]): Map<string, string> {
  const named = months.map((value) => {
    const index = Number(value.slice(5, 7)) - 1;
    const short = MONTHS[index] ?? value;
    return { value, short, year: value.slice(2, 4) };
  });
  const counts = new Map<string, number>();
  for (const item of named) counts.set(item.short, (counts.get(item.short) ?? 0) + 1);
  return new Map(
    named.map((item) => [
      item.value,
      (counts.get(item.short) ?? 0) > 1 ? `${item.short} ${item.year}` : item.short,
    ]),
  );
}

function flowMonths(snapshot: FinanceSnapshot, limit: number): FlowMonth[] {
  const rows = [...snapshot.cashFlow.months].sort((left, right) => left.month.localeCompare(right.month));
  const recent = rows.slice(-limit);
  const labels = monthLabels(recent.map((row) => row.month));
  return recent.map((row) => ({
    label: labels.get(row.month) ?? row.month,
    income: row.income,
    spend: row.spend,
  }));
}

export function linkedNetWorth(snapshot: FinanceSnapshot): number | null {
  if (snapshot.accounts.length === 0) return null;
  let cents = 0;
  let counted = 0;
  for (const account of snapshot.accounts) {
    const sign = ASSET_TYPES.has(account.type) ? 1 : LIABILITY_TYPES.has(account.type) ? -1 : 0;
    if (sign === 0) continue;
    cents += sign * Math.round(account.balance * 100);
    counted += 1;
  }
  return counted > 0 ? cents / 100 : null;
}

function linkedDebts(snapshot: FinanceSnapshot): FinanceSnapshot["debts"] {
  return snapshot.debts.filter((debt) => debt.linked);
}

export function notLinkedCount(snapshot: FinanceSnapshot): number {
  const names = new Set<string>();
  for (const debt of snapshot.debts) {
    if (debt.linked) continue;
    const name = (debt.name ?? debt.accountId ?? "").trim().toLowerCase();
    if (name) names.add(name);
  }
  for (const item of snapshot.unlinked) {
    const name = item.name.trim().toLowerCase();
    if (name) names.add(name);
  }
  return names.size;
}

function feesSince(snapshot: FinanceSnapshot, days: number): FinanceSnapshot["fees"] {
  return snapshot.fees.filter((fee) => {
    const age = civilDaysBetween(fee.date, snapshot.asOf);
    return age >= 0 && age <= days;
  });
}

function topAlert(snapshot: FinanceSnapshot): string | null {
  const rank = { critical: 0, warn: 1, info: 2 };
  const sorted = [...snapshot.alerts].sort((left, right) => rank[left.severity] - rank[right.severity]);
  const message = sorted[0]?.message.trim() ?? "";
  return message || null;
}

function dueLine(item: FinanceSnapshot["recurring"][number]): { when: string; line: string } | null {
  const when = item.nextDueEstimate;
  if (!when) return null;
  const pretty = formatCivilDate(when);
  if (!pretty.trim()) return null;
  return { when, line: `${item.item} · ${pretty}` };
}

function recurringLines(snapshot: FinanceSnapshot): string[] {
  return snapshot.recurring
    .flatMap((item) => {
      const due = dueLine(item);
      return due ? [due] : [];
    })
    .sort((left, right) => left.when.localeCompare(right.when))
    .slice(0, 3)
    .map((item) => item.line);
}

export function financeHomeForRole(
  role: "owner" | "operator" | null,
  snapshot: FinanceSnapshot | null,
): FinanceHomeFace | null {
  if (role !== "owner" || !snapshot) return null;
  return financeHomeFace(snapshot);
}

export function financeHomeFace(snapshot: FinanceSnapshot): FinanceHomeFace | null {
  const net = linkedNetWorth(snapshot);
  if (net === null) return null;
  const amount = formatFinanceUsd(net);
  if (!amount) return null;
  const partial = snapshot.coverage.missing.length > 0;
  return {
    headline: partial ? `${amount} partial` : amount,
    asOfLine: `as of ${formatCivilDate(snapshot.asOf)}`,
  };
}

export function financeCards(snapshot: FinanceSnapshot): FinanceCardModel[] {
  const net = linkedNetWorth(snapshot);
  const netLabel = net === null ? null : formatFinanceUsd(net);
  const owed = linkedDebts(snapshot);
  const owedSum = owed.length > 0 ? sum(owed.map((debt) => debt.balance)) : null;
  const knownMinimums = owed.filter((debt) => typeof debt.minPayment === "number");
  const minimumSum = knownMinimums.length > 0 ? sum(knownMinimums.map((debt) => debt.minPayment ?? 0)) : null;
  const unlinked = notLinkedCount(snapshot);
  const recurringSum = snapshot.recurring.length > 0 ? sum(snapshot.recurring.map((item) => item.medianAmount)) : null;
  const recentFees = feesSince(snapshot, FINANCE_FEE_CARD_DAYS);
  const feeSum = sum(recentFees.map((fee) => fee.amount));
  const income = formatFinanceUsd(snapshot.cashFlow.thisMonth.income);
  const spend = formatFinanceUsd(snapshot.cashFlow.thisMonth.spend);
  const netMonth = formatFinanceUsd(snapshot.cashFlow.thisMonth.net);
  const partial = snapshot.coverage.missing.length > 0;

  return [
    {
      id: "cash-flow",
      title: "Cash Flow",
      href: "/n/finance/cash-flow",
      headline: netMonth,
      lines: keep([income ? `Income ${income}` : null, spend ? `Spend ${spend}` : null], 2),
      bars: flowMonths(snapshot, 6),
    },
    {
      id: "bills",
      title: "Bills & Subscriptions",
      href: "/n/finance/bills",
      headline: recurringSum === null ? null : formatFinanceUsd(recurringSum),
      lines: keep(recurringLines(snapshot), 3),
      bars: null,
    },
    {
      id: "debt",
      title: "Debt",
      href: "/n/finance/debt",
      headline: owedSum === null ? null : formatFinanceUsd(owedSum),
      lines: keep(
        [
          minimumSum === null ? null : `${formatFinanceUsd(minimumSum)} minimums`,
          unlinked > 0 ? `${unlinked} not linked` : null,
        ],
        2,
      ),
      bars: null,
    },
    {
      id: "net-worth",
      title: "Net Worth",
      href: "/n/finance/net-worth",
      headline: netLabel,
      lines: keep([partial && netLabel ? "partial" : null], 2),
      bars: null,
    },
    {
      id: "fees",
      title: "Fees & Alerts",
      href: "/n/finance/fees",
      headline: formatFinanceUsd(feeSum),
      lines: keep([topAlert(snapshot)], 2),
      bars: null,
    },
  ];
}

function compactTable(columns: string[], rows: string[][]): FinanceTableModel | null {
  if (rows.length === 0) return null;
  const keepColumn = columns.map((_, index) => rows.some((row) => (row[index] ?? "").trim() !== ""));
  const nextColumns = columns.filter((_, index) => keepColumn[index]);
  if (nextColumns.length === 0) return null;
  return {
    title: "",
    columns: nextColumns,
    rows: rows.map((row) => row.filter((_, index) => keepColumn[index])),
  };
}

function table(title: string, columns: string[], rows: string[][]): FinanceTableModel | null {
  const packed = compactTable(columns, rows);
  if (!packed) return null;
  return { ...packed, title };
}

function cashTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const rows = [...snapshot.cashFlow.months]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((row) => [
      formatCivilDate(`${row.month}-01`).replace(/ \d{4}$/, "") || row.month,
      formatFinanceUsd(row.income) ?? "",
      formatFinanceUsd(row.spend) ?? "",
      formatFinanceUsd(row.net) ?? "",
      row.partial ? "partial" : "",
    ]);
  return table("Months", ["Month", "Income", "Spend", "Net", "Partial"], rows);
}

function categoryTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const rows = snapshot.categories.map((category) => [
    category.class,
    category.subcategory,
    formatFinanceUsd(category.avgFullMonths) ?? "",
    formatFinanceUsd(category.avgLast3) ?? "",
  ]);
  return table("Categories", ["Class", "Subcategory", "Avg full months", "Avg last 3"], rows);
}

function billTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const rows = [...snapshot.recurring]
    .sort((left, right) => (left.nextDueEstimate ?? "9999").localeCompare(right.nextDueEstimate ?? "9999"))
    .map((item) => [
      item.item,
      formatFinanceUsd(item.medianAmount) ?? "",
      formatFinanceUsd(item.min) ?? "",
      formatFinanceUsd(item.max) ?? "",
      String(item.medianDay),
      String(item.monthsSeen),
      formatCivilDate(item.lastSeen),
      item.nextDueEstimate ? formatCivilDate(item.nextDueEstimate) : "",
    ]);
  return table(
    "Recurring",
    ["Item", "Median", "Min", "Max", "Day", "Months", "Last seen", "Next due"],
    rows,
  );
}

function debtTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const notes = new Map(snapshot.unlinked.map((item) => [item.name.trim().toLowerCase(), item.note]));
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const debt of snapshot.debts) {
    const name = (debt.name ?? debt.accountId ?? "").trim();
    if (!name) continue;
    seen.add(name.toLowerCase());
    if (!debt.linked) {
      rows.push([name, "not linked", formatApr(debt.apr), "", notes.get(name.toLowerCase()) ?? ""]);
      continue;
    }
    rows.push([
      name,
      formatFinanceUsd(debt.balance) ?? "",
      formatApr(debt.apr),
      typeof debt.minPayment === "number" ? (formatFinanceUsd(debt.minPayment) ?? "") : "",
      "",
    ]);
  }
  for (const item of snapshot.unlinked) {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    rows.push([item.name, "not linked", "", "", item.note]);
  }
  return table("Debts", ["Name", "Owed", "APR", "Minimum", "Note"], rows);
}

function accountTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const rows = snapshot.accounts.map((account) => [
    account.name,
    account.institution,
    account.type,
    account.last4,
    formatFinanceUsd(account.balance) ?? "",
    typeof account.available === "number" ? (formatFinanceUsd(account.available) ?? "") : "",
    typeof account.limit === "number" ? (formatFinanceUsd(account.limit) ?? "") : "",
    account.apr === undefined ? "" : formatApr(account.apr),
  ]);
  return table(
    "Linked accounts",
    ["Name", "Institution", "Type", "Last 4", "Balance", "Available", "Limit", "APR"],
    rows,
  );
}

function feeTable(snapshot: FinanceSnapshot): FinanceTableModel | null {
  const rows = [...snapshot.fees]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((fee) => [
      formatCivilDate(fee.date),
      fee.account,
      formatFinanceUsd(fee.amount) ?? "",
      fee.kind,
      fee.name,
    ]);
  return table("Fees", ["Date", "Account", "Amount", "Kind", "Name"], rows);
}

function feeAmounts(snapshot: FinanceSnapshot): AmountPoint[] {
  const totals = new Map<string, number>();
  for (const fee of snapshot.fees) {
    const month = fee.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + fee.amount);
  }
  const months = [...totals.keys()].sort();
  const labels = monthLabels(months);
  return months.map((month) => ({
    label: labels.get(month) ?? month,
    amount: totals.get(month) ?? 0,
  }));
}

function detailLines(snapshot: FinanceSnapshot, id: FinanceNodeId): string[] {
  if (id === "cash-flow") {
    const income = formatFinanceUsd(snapshot.cashFlow.thisMonth.income);
    const spend = formatFinanceUsd(snapshot.cashFlow.thisMonth.spend);
    const avg3 = formatFinanceUsd(snapshot.cashFlow.avgNet3);
    const avg12 = formatFinanceUsd(snapshot.cashFlow.avgNet12);
    return keep(
      [
        income ? `Income ${income}` : null,
        spend ? `Spend ${spend}` : null,
        avg3 ? `Avg net 3 months ${avg3}` : null,
        avg12 ? `Avg net 12 months ${avg12}` : null,
        `${snapshot.cashFlow.thisMonth.daysElapsed} days in`,
      ],
      5,
    );
  }
  if (id === "bills") return keep(recurringLines(snapshot), 3);
  if (id === "debt") {
    const card = financeCards(snapshot).find((item) => item.id === "debt");
    return card?.lines ?? [];
  }
  if (id === "fees") return keep([topAlert(snapshot)], 1);
  return [];
}

export function financeDetail(
  snapshot: FinanceSnapshot,
  nodeId: string,
  series: readonly NetWorthPoint[] = [],
): FinanceDetailModel | null {
  const node = financeNode(nodeId);
  if (!node) return null;
  const cards = financeCards(snapshot);
  const card = cards.find((item) => item.id === node.id);
  const partial = snapshot.coverage.missing.length > 0 && node.id === "net-worth" && card?.headline !== null;
  const tables =
    node.id === "cash-flow"
      ? [cashTable(snapshot), categoryTable(snapshot)]
      : node.id === "bills"
        ? [billTable(snapshot)]
        : node.id === "debt"
          ? [debtTable(snapshot)]
          : node.id === "net-worth"
            ? [accountTable(snapshot)]
            : [feeTable(snapshot)];
  const history =
    node.id === "net-worth" && series.length >= 2
      ? series.map((point) => ({
          label: formatCivilDate(point.asOf),
          amount: point.net,
        }))
      : null;
  return {
    title: node.title,
    headline: card?.headline ?? null,
    lines: detailLines(snapshot, node.id),
    partial,
    missing: node.id === "net-worth" ? [...snapshot.coverage.missing] : [],
    alerts: node.id === "fees" ? snapshot.alerts.map((alert) => ({ severity: alert.severity, message: alert.message })) : [],
    flow: node.id === "cash-flow" ? flowMonths(snapshot, 12) : null,
    amounts: node.id === "fees" ? feeAmounts(snapshot) : history,
    amountLabel: node.id === "fees" ? "Fees by month" : node.id === "net-worth" ? "Net worth" : null,
    tables: tables.flatMap((item) => (item ? [item] : [])),
  };
}
