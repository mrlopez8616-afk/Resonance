import { chicagoDay, chicagoInstant, isCivilDay } from "@/lib/calendar-time";
import { decimalString, energyKcal, parseHealthExport, sanitizeFitnessSource } from "@/lib/fitness-parse";
import type { FitnessMetricWrite, FitnessOrigin, FitnessWrites } from "@/lib/fitness-types";

/**
 * Apple Shortcuts "Get Contents of URL" body.
 * One metric:
 *   {"source":"shortcuts","metric":"steps","values":[...],"starts":[...]}
 * Several in one call:
 *   {"source":"shortcuts","metrics":[{"metric":"steps","values":[...],"starts":[...]}, ...]}
 * values/starts may be arrays of numbers or strings, or one newline-joined string.
 * A missing timezone is America/Chicago. For source shortcuts, a Chicago day
 * keeps the larger stored total. A partial nightly window does not shrink a full day.
 * A later post with a higher total replaces it. Days the payload does not mention stay put.
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?$/;

const LOCALE_INSTANT =
  /^(?:[A-Za-z]+,\s+)?([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})(?:\s+at\s+|,\s+|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*(Z|[+-]\d{2}:?\d{2}|[A-Za-z]{2,5}))?\s*$/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

type Instant = { iso: string; day: string };

type MetricKind = {
  metric: string;
  convert: (qty: number, units: string | null) => { qty: number; units: string };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function field(record: Record<string, unknown>, ...names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(key.toLowerCase())) return value;
  }
  return undefined;
}

function normalizeDateText(value: string): string {
  return value
    .replace(/[\u202f\u00a0\u2007\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function civil(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const text = `${year}-${pad(month)}-${pad(day)}`;
  return isCivilDay(text) ? text : null;
}

function wallHour(hour: number, ampm: string | undefined): number | null {
  if (!Number.isInteger(hour)) return null;
  if (!ampm) return hour >= 0 && hour <= 23 ? hour : null;
  const marker = ampm.toUpperCase();
  if (hour < 1 || hour > 12) return null;
  if (marker === "AM") return hour === 12 ? 0 : hour;
  if (marker === "PM") return hour === 12 ? 12 : hour + 12;
  return null;
}

function clock(hour: number, minute: number, second: number): boolean {
  return minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function chicagoWall(day: string, hour: number, minute: number): Instant | null {
  const instant = chicagoInstant(day, `${pad(hour)}:${pad(minute)}`);
  const iso = instant.toISOString();
  const zoned = chicagoDay(iso);
  return zoned ? { iso, day: zoned } : null;
}

function offsetSuffix(zone: string): string {
  if (zone === "Z" || zone === "z") return "Z";
  if (zone.includes(":")) return zone;
  const sign = zone[0] === "-" ? "-" : "+";
  const digits = zone.replace(/^[+-]/, "");
  return `${sign}${digits.slice(0, 2)}:${digits.slice(2, 4) || "00"}`;
}

function zonedWall(day: string, hour: number, minute: number, second: number, zone: string): Instant | null {
  const parsed = new Date(`${day}T${pad(hour)}:${pad(minute)}:${pad(second)}${offsetSuffix(zone)}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  const zoned = chicagoDay(iso);
  return zoned ? { iso, day: zoned } : null;
}

function finish(day: string, hour: number, minute: number, second: number, ampm: string | undefined, zone: string | undefined): Instant | null {
  const wall = wallHour(hour, ampm);
  if (wall === null || !clock(wall, minute, second)) return null;
  if (!zone || zone.toUpperCase() === "CT" || zone.toUpperCase() === "CDT" || zone.toUpperCase() === "CST") {
    return chicagoWall(day, wall, minute);
  }
  const marker = zone.toUpperCase();
  if (marker === "Z" || marker === "UTC" || marker === "GMT") {
    return zonedWall(day, wall, minute, second, "Z");
  }
  if (/^[+-]\d{2}:?\d{2}$/.test(zone)) return zonedWall(day, wall, minute, second, zone);
  return chicagoWall(day, wall, minute);
}

function fromIso(match: RegExpExecArray): Instant | null {
  const day = civil(Number(match[1]), Number(match[2]), Number(match[3]));
  if (!day) return null;
  if (!match[4] || !match[5]) {
    const noon = chicagoInstant(day, "12:00").toISOString();
    return { iso: noon, day };
  }
  return finish(day, Number(match[4]), Number(match[5]), Number(match[6] ?? "0"), undefined, match[7]);
}

function fromLocale(match: RegExpExecArray): Instant | null {
  const month = MONTHS[match[1]?.toLowerCase() ?? ""];
  if (!month) return null;
  const day = civil(Number(match[3]), month, Number(match[2]));
  if (!day) return null;
  return finish(day, Number(match[4]), Number(match[5]), Number(match[6] ?? "0"), match[7], match[8]);
}

/** ISO, Health Auto Export, or Shortcuts locale time. No offset means America/Chicago. */
export function parseShortcutInstant(value: string): Instant | null {
  const text = normalizeDateText(value);
  if (!text) return null;
  const iso = ISO_INSTANT.exec(text);
  if (iso) return fromIso(iso);
  const locale = LOCALE_INSTANT.exec(text);
  if (locale) return fromLocale(locale);
  return null;
}

function seriesList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => seriesList(item));
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (typeof value !== "string") return [];
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (!normalized.includes("\n")) return [normalized];
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseQty(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "");
  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(cleaned);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function seriesFields(record: Record<string, unknown>): { values: unknown; starts: unknown } | null {
  const values = field(record, "values", "value");
  const starts = field(record, "starts", "startDates", "start_dates", "dates");
  if (values === undefined || starts === undefined) return null;
  return { values, starts };
}

function flattenSeries(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenSeries(item));
  const record = asRecord(value);
  if (!record || !seriesFields(record)) return [];
  return [record];
}

function collectSeries(root: Record<string, unknown>): Record<string, unknown>[] {
  const listed = flattenSeries(field(root, "metrics"));
  if (listed.length > 0) return listed;
  return seriesFields(root) ? [root] : [];
}

export function isShortcutsPayload(body: unknown): boolean {
  const root = asRecord(body);
  if (!root) return false;
  return collectSeries(root).length > 0;
}

/** Daily series, or a shortcuts post that only carries the workouts array. */
export function acceptsShortcutWorkouts(body: unknown): boolean {
  if (isShortcutsPayload(body)) return true;
  const root = asRecord(body);
  const source = root ? field(root, "source") : undefined;
  return typeof source === "string" && source.trim().toLowerCase() === "shortcuts";
}

function metricKind(name: string): MetricKind | null {
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "steps" || key === "step" || key === "step_count") {
    return { metric: "step_count", convert: (qty) => ({ qty, units: "count" }) };
  }
  if (
    key === "distance" ||
    key === "walking_running_distance" ||
    key === "walking_and_running_distance"
  ) {
    return {
      metric: "walking_running_distance",
      convert: (qty, units) => {
        const normalized = (units ?? "mi").trim().toLowerCase();
        if (normalized === "km" || normalized === "kilometer" || normalized === "kilometers") {
          return { qty: qty * 0.621371192, units: "mi" };
        }
        if (normalized === "m" || normalized === "meter" || normalized === "meters") {
          return { qty: qty * 0.000621371192, units: "mi" };
        }
        return { qty, units: "mi" };
      },
    };
  }
  if (key === "active_energy" || key === "active_energy_burned") {
    return {
      metric: "active_energy",
      convert: (qty, units) => {
        const normalized = (units ?? "kcal").trim().toLowerCase();
        const kcal = energyKcal(qty, normalized === "kj" ? "kJ" : normalized);
        return { qty: kcal ?? qty, units: "kcal" };
      },
    };
  }
  if (key === "workouts" || key === "workout") {
    return {
      metric: "workouts",
      convert: (qty, units) => {
        const normalized = (units ?? "min").trim().toLowerCase();
        if (["count", "counts", "workout", "workouts"].includes(normalized)) {
          return { qty, units: "count" };
        }
        if (["sec", "secs", "second", "seconds", "s"].includes(normalized)) {
          return { qty: qty / 60, units: "min" };
        }
        return { qty, units: "min" };
      },
    };
  }
  return null;
}

type Bucket = {
  metric: string;
  day: string;
  units: string;
  sum: number;
  count: number;
  recordedAt: string | null;
};

function parseShortcutsPayload(body: unknown): FitnessWrites {
  const root = asRecord(body);
  if (!root) return { metrics: [], workouts: [] };
  const source = sanitizeFitnessSource(typeof field(root, "source") === "string" ? String(field(root, "source")) : "shortcuts");
  const origin: FitnessOrigin = "shortcuts";
  const buckets = new Map<string, Bucket>();

  for (const series of collectSeries(root)) {
    const name = field(series, "metric", "name");
    if (typeof name !== "string") continue;
    const kind = metricKind(name);
    if (!kind) continue;
    const paired = seriesFields(series);
    if (!paired) continue;
    const units = typeof field(series, "units", "unit") === "string" ? String(field(series, "units", "unit")) : null;
    const values = seriesList(paired.values);
    const starts = seriesList(paired.starts);
    const count = Math.min(values.length, starts.length);
    for (let index = 0; index < count; index += 1) {
      const qty = parseQty(values[index] ?? "");
      const at = parseShortcutInstant(starts[index] ?? "");
      if (qty === null || qty < 0 || !at) continue;
      const converted = kind.convert(qty, units);
      if (!Number.isFinite(converted.qty) || converted.qty < 0) continue;
      const key = `${kind.metric}:${at.day}:${converted.units}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          metric: kind.metric,
          day: at.day,
          units: converted.units,
          sum: converted.qty,
          count: 1,
          recordedAt: at.iso,
        });
        continue;
      }
      existing.sum += converted.qty;
      existing.count += 1;
      if (!existing.recordedAt || at.iso > existing.recordedAt) existing.recordedAt = at.iso;
    }
  }

  const metrics: FitnessMetricWrite[] = [...buckets.values()].map((bucket) => ({
    source,
    externalId: `${bucket.metric}:${bucket.day}:${bucket.units}`,
    metric: bucket.metric,
    day: bucket.day,
    recordedAt: bucket.recordedAt,
    qty: decimalString(bucket.sum),
    units: bucket.units,
    qtyMin: null,
    qtyMax: null,
    origin,
    payload: {
      source: "shortcuts",
      metric: bucket.metric,
      day: bucket.day,
      units: bucket.units,
      points: bucket.count,
    },
  }));
  return { metrics, workouts: [] };
}

/** Health Auto Export keeps its parser. Shortcuts is detected by values + starts. */
export function parseFitnessIngest(
  body: unknown,
  options: { source?: string; origin?: FitnessOrigin } = {},
): FitnessWrites {
  if (isShortcutsPayload(body)) return parseShortcutsPayload(body);
  return parseHealthExport(body, options);
}
