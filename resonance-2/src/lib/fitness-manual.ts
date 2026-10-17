import { formatCivilDate } from "@/lib/calendar-time";
import {
  FITNESS_NOT_RECORDED,
  type FitnessCard,
  type FitnessNodeDetail,
  type FitnessRow,
} from "@/lib/fitness-board";
import { stripMoneyText } from "@/lib/public-mode";

/** One posted summary. Amounts stay decimal strings. Dates are YYYY-MM-DD. */
export type ManualSummaryWrite = {
  entryDate: string;
  periodStart: string;
  periodEnd: string;
  app: string;
  metric: string;
  value: string;
  unit: string;
  approx: boolean;
  note: string | null;
  source: string;
};

export type ManualSummary = ManualSummaryWrite & {
  id: string;
  createdAt: string;
};

export type ManualParse =
  | { ok: true; entries: ManualSummaryWrite[] }
  | { ok: false; status: 400; error: string };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_ENTRIES = 100;

function civilDay(value: unknown): string | null {
  if (typeof value !== "string" || !DAY.test(value)) return null;
  const [year, month, date] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== (month ?? 1) - 1 ||
    utc.getUTCDate() !== date
  ) {
    return null;
  }
  return value;
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f]/.test(trimmed)) return null;
  return trimmed;
}

function decimalValue(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = Object.is(value, -0) ? "0" : value.toString();
    return DECIMAL.test(text) ? text : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed) || trimmed.length > 40) return null;
  return trimmed;
}

function optionalNote(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 280 || /[\u0000-\u001f]/.test(trimmed)) return undefined;
  return trimmed;
}

function sourceValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "manual-import";
  return plainText(value, 64);
}

function prefix(index: number | null, message: string): string {
  return index === null ? message : `Entry ${index + 1}: ${message}`;
}

function parseEntry(value: unknown, index: number | null): ManualSummaryWrite | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix(index, "Each entry must be an object.");
  }
  const record = value as Record<string, unknown>;
  const entryDate = civilDay(record.entry_date);
  if (!entryDate) return prefix(index, "entry_date must be YYYY-MM-DD.");
  const periodStart = civilDay(record.period_start);
  if (!periodStart) return prefix(index, "period_start must be YYYY-MM-DD.");
  const periodEnd = civilDay(record.period_end);
  if (!periodEnd) return prefix(index, "period_end must be YYYY-MM-DD.");
  if (periodEnd < periodStart) return prefix(index, "period_end is before period_start.");
  const app = plainText(record.app, 64);
  if (!app) return prefix(index, "app is required.");
  const metric = plainText(record.metric, 64);
  if (!metric) return prefix(index, "metric is required.");
  const amount = decimalValue(record.value);
  if (!amount) return prefix(index, "value must be a number.");
  const unit = plainText(record.unit, 32);
  if (!unit) return prefix(index, "unit is required.");
  let approx = false;
  if (record.approx !== undefined && record.approx !== null) {
    if (typeof record.approx !== "boolean") return prefix(index, "approx must be true or false.");
    approx = record.approx;
  }
  const note = optionalNote(record.note);
  if (note === undefined) return prefix(index, "note must be text.");
  const source = sourceValue(record.source);
  if (!source) return prefix(index, "source must be text.");
  return {
    entryDate,
    periodStart,
    periodEnd,
    app,
    metric,
    value: amount,
    unit,
    approx,
    note,
    source,
  };
}

/** A single entry object or an array of entries. */
export function parseManualImport(body: unknown): ManualParse {
  if (Array.isArray(body)) {
    if (body.length === 0) return { ok: false, status: 400, error: "No entries in the body." };
    if (body.length > MAX_ENTRIES) {
      return { ok: false, status: 400, error: `At most ${MAX_ENTRIES} entries.` };
    }
    const entries: ManualSummaryWrite[] = [];
    for (let index = 0; index < body.length; index += 1) {
      const parsed = parseEntry(body[index], index);
      if (typeof parsed === "string") return { ok: false, status: 400, error: parsed };
      entries.push(parsed);
    }
    return { ok: true, entries };
  }
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "JSON body must be an entry or an array of entries." };
  }
  const parsed = parseEntry(body, null);
  if (typeof parsed === "string") return { ok: false, status: 400, error: parsed };
  return { ok: true, entries: [parsed] };
}

/** Decimal text without trailing zeros. No thousands separators. */
export function canonicalManualValue(value: string): string {
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, frac = ""] = raw.split(".");
  const digits = (whole ?? "0").replace(/^0+(?=\d)/, "") || "0";
  const cleaned = frac.replace(/0+$/, "");
  const body = cleaned ? `${digits}.${cleaned}` : digits;
  return negative && body !== "0" ? `-${body}` : body;
}

/** Display quantity. Thousands separators, trailing zeros dropped. */
export function formatManualQuantity(value: string): string {
  const canonical = canonicalManualValue(value);
  const negative = canonical.startsWith("-");
  const raw = negative ? canonical.slice(1) : canonical;
  const [whole, frac] = raw.split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${grouped}.${frac}` : grouped;
  return negative ? `-${body}` : body;
}

function shortDay(day: string): string {
  return formatCivilDate(day).replace(/ \d{4}$/, "");
}

export function manualPeriodLabel(start: string, end: string): string {
  if (start === end) return shortDay(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return `${formatCivilDate(start)}–${formatCivilDate(end)}`;
  }
  return `${shortDay(start)}–${shortDay(end)}`;
}

function periodLine(start: string, end: string): string {
  if (start === end) return formatCivilDate(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return `${formatCivilDate(start)}–${formatCivilDate(end)}`;
  }
  return `${shortDay(start)}–${formatCivilDate(end)}`;
}

/** Drop dollar amounts and any leftover $ so a shared screen stays free of them. */
export function hideManualMoney(value: string): string {
  return stripMoneyText(value).replaceAll("$", "").replace(/ {2,}/g, " ").trim();
}

function shown(value: string, publicMode: boolean): string {
  return publicMode ? hideManualMoney(value) : value;
}

/** Latest period is the greatest period_end, then the greatest period_start. */
export function latestManualPeriod(entries: readonly ManualSummary[]): ManualSummary[] {
  let bestStart = "";
  let bestEnd = "";
  for (const entry of entries) {
    if (entry.periodEnd > bestEnd || (entry.periodEnd === bestEnd && entry.periodStart > bestStart)) {
      bestEnd = entry.periodEnd;
      bestStart = entry.periodStart;
    }
  }
  if (!bestEnd) return [];
  return entries
    .filter((entry) => entry.periodStart === bestStart && entry.periodEnd === bestEnd)
    .sort((a, b) => a.app.localeCompare(b.app) || a.metric.localeCompare(b.metric) || a.id.localeCompare(b.id));
}

function quantityLabel(entry: ManualSummary, publicMode: boolean): string {
  const unit = shown(entry.unit, publicMode);
  const value = formatManualQuantity(entry.value);
  return unit ? `${value} ${unit}` : value;
}

function entryChip(entry: ManualSummary, publicMode: boolean): string {
  const qty = quantityLabel(entry, publicMode);
  const marked = entry.approx ? `${qty} approx` : qty;
  const app = shown(entry.app, publicMode);
  return [marked, app].filter((part) => part.length > 0).join(" · ");
}

function entryRow(entry: ManualSummary, publicMode: boolean): FitnessRow {
  const app = shown(entry.app, publicMode);
  const metric = shown(entry.metric, publicMode);
  const note = entry.note ? shown(entry.note, publicMode) : "";
  const secondary = [
    app,
    metric,
    periodLine(entry.periodStart, entry.periodEnd),
    "manual",
    entry.approx ? "approx" : null,
    note,
  ]
    .filter((part) => part && part.length > 0)
    .join(" · ");
  return {
    id: entry.id,
    primary: quantityLabel(entry, publicMode),
    secondary: secondary || "manual",
  };
}

function present(entries: readonly ManualSummary[], publicMode: boolean): {
  headline: string | null;
  detail: string;
  rows: FitnessRow[];
} {
  const latest = latestManualPeriod(entries);
  if (latest.length === 0) {
    return { headline: null, detail: FITNESS_NOT_RECORDED, rows: [] };
  }
  const first = latest[0]!;
  return {
    headline: manualPeriodLabel(first.periodStart, first.periodEnd),
    detail: `manual · ${latest.map((entry) => entryChip(entry, publicMode)).join(", ")}`,
    rows: latest.map((entry) => entryRow(entry, publicMode)),
  };
}

export function manualImportCard(
  entries: readonly ManualSummary[],
  options: { publicMode: boolean },
): FitnessCard {
  const view = present(entries, options.publicMode);
  return {
    id: "manual",
    title: "Manual import",
    href: "/n/fitness/manual",
    headline: view.headline,
    detail: view.detail,
    bars: [],
    heart: [],
  };
}

export function manualImportDetail(
  entries: readonly ManualSummary[],
  options: { publicMode: boolean },
): FitnessNodeDetail {
  const view = present(entries, options.publicMode);
  return {
    id: "manual",
    title: "Manual import",
    headline: view.headline,
    detail: view.detail,
    rows: view.rows,
    weeks: [],
    months: [],
    pace: [],
    bars: [],
    heart: [],
  };
}

export function withManualImportCard(
  cards: readonly FitnessCard[],
  entries: readonly ManualSummary[],
  options: { publicMode: boolean },
): FitnessCard[] {
  const manual = manualImportCard(entries, options);
  if (!cards.some((card) => card.id === "manual")) return [...cards, manual];
  return cards.map((card) => (card.id === "manual" ? manual : card));
}

export function manualEntryJson(entry: ManualSummary, publicMode: boolean): Record<string, unknown> {
  return {
    id: entry.id,
    entry_date: entry.entryDate,
    period_start: entry.periodStart,
    period_end: entry.periodEnd,
    app: shown(entry.app, publicMode),
    metric: shown(entry.metric, publicMode),
    value: canonicalManualValue(entry.value),
    unit: shown(entry.unit, publicMode),
    approx: entry.approx,
    note: entry.note ? shown(entry.note, publicMode) || null : null,
    source: shown(entry.source, publicMode),
    created_at: entry.createdAt,
  };
}
