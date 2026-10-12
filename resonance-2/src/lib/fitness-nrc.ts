import { chicagoDay, chicagoInstant } from "@/lib/calendar-time";
import { decimalString } from "@/lib/fitness-parse";
import { parseShortcutInstant } from "@/lib/fitness-shortcuts";
import type { FitnessMetricWrite, FitnessWorkoutWrite, NrcRunWrite } from "@/lib/fitness-types";

/** One nightly post. A backfill of runs stays under this. */
export const NRC_RUN_LIMIT = 400;
const HEART_SAMPLE_LIMIT = 20000;
const DURATION_MAX_SEC = 48 * 60 * 60;
const MILE_METERS = 1609.344;
const BPM_MIN = 25;
const BPM_MAX = 230;

const SECONDS = new Set(["s", "sec", "secs", "second", "seconds"]);
const MINUTES = new Set(["m", "min", "mins", "minute", "minutes"]);
const MILES = new Set(["mi", "mile", "miles"]);
const KILOMETERS = new Set(["km", "kilometer", "kilometers"]);
const METERS = new Set(["m", "meter", "meters"]);

export type NightlyFitness = {
  heart: FitnessMetricWrite[];
  runs: NrcRunWrite[];
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

/** Shortcuts joins a Health list with newlines, and sometimes wraps one extra list. */
export function splitShortcutList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => splitShortcutList(item));
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (typeof value !== "string") return [];
  const normalized = value.replace(/\r\n/g, "\n").replace(/[\u202f\u00a0]/g, " ");
  if (!normalized.includes("\n")) {
    const trimmed = normalized.trim();
    return trimmed ? [trimmed] : [];
  }
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * A comma is a decimal when it is the only separator and the fraction is not a
 * thousands group. "3,1 mi" is 3.1. "1,680" is 1680. "1.234,5" is 1234.5.
 */
export function parseLocaleNumber(value: string): number | null {
  let text = value.trim().replace(/[\u202f\u00a0]/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = text.split(",");
    const grouped = parts.every((part, index) => (index === 0 ? /^\d+$/.test(part) : part.length === 3));
    if (parts.length === 2 && parts[1] && parts[1].length !== 3) {
      text = `${parts[0]}.${parts[1]}`;
    } else if (grouped) {
      text = parts.join("");
    } else {
      text = text.replace(",", ".");
    }
  }
  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(text);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function singleAmount(value: string): { qty: number; unit: string } | null {
  const match = /^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*([A-Za-z/]+)?$/.exec(value.trim());
  if (!match?.[1]) return null;
  const qty = parseLocaleNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: (match[2] ?? "").trim().toLowerCase() };
}

/** Heart lists may be newline text or "58, 61, 63". "151,5" stays one number. */
function heartPieces(value: unknown): string[] {
  const pieces: string[] = [];
  for (const line of splitShortcutList(value)) {
    if (singleAmount(line)) {
      pieces.push(line);
      continue;
    }
    const split = line.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
    if (split.length > 1 && split.every((part) => singleAmount(part))) {
      pieces.push(...split);
      continue;
    }
    pieces.push(line);
  }
  return pieces.slice(0, HEART_SAMPLE_LIMIT);
}

function bpm(value: string): number | null {
  const amount = singleAmount(value.replace(/bpm$/i, "").trim());
  if (!amount) return null;
  if (amount.qty < BPM_MIN || amount.qty > BPM_MAX) return null;
  return amount.qty;
}

function dayOf(value: string): { day: string; iso: string | null } | null {
  const instant = parseShortcutInstant(value);
  if (!instant) return null;
  const timed = /[T ]\d{1,2}:\d{2}/.test(value) || /\bat\b/i.test(value);
  return { day: instant.day, iso: timed ? instant.iso : null };
}

type HeartSample = { metric: "resting_heart_rate" | "heart_rate"; day: string; bpm: number; iso: string | null };

function pushPaired(
  samples: HeartSample[],
  metric: HeartSample["metric"],
  values: unknown,
  starts: unknown,
  fallbackDate: unknown,
): void {
  const quantities = heartPieces(values).map(bpm).filter((qty): qty is number => qty !== null);
  const dates = splitShortcutList(starts);
  if (quantities.length === 0) return;
  if (dates.length === 1 && quantities.length >= 1) {
    const at = dayOf(dates[0] ?? "");
    if (!at) return;
    for (const qty of quantities) samples.push({ metric, day: at.day, bpm: qty, iso: at.iso });
    return;
  }
  if (dates.length === 0) {
    const fallback = typeof fallbackDate === "string" ? dayOf(fallbackDate) : null;
    if (!fallback) return;
    for (const qty of quantities) samples.push({ metric, day: fallback.day, bpm: qty, iso: fallback.iso });
    return;
  }
  const count = Math.min(quantities.length, dates.length);
  for (let index = 0; index < count; index += 1) {
    const at = dayOf(dates[index] ?? "");
    const qty = quantities[index];
    if (!at || qty === undefined) continue;
    samples.push({ metric, day: at.day, bpm: qty, iso: at.iso });
  }
}

function heartKind(name: string): HeartSample["metric"] | null {
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["resting_heart_rate", "resting_hr", "resting", "restingheartrate"].includes(key)) {
    return "resting_heart_rate";
  }
  if (["heart_rate", "avg_hr", "avg_heart_rate", "average_heart_rate", "heartrate"].includes(key)) {
    return "heart_rate";
  }
  return null;
}

function collectHeart(root: Record<string, unknown>): HeartSample[] {
  const samples: HeartSample[] = [];
  const heart = asRecord(field(root, "heart"));
  const resting = field(root, "restingHr", "restingHeartRate", "resting_hr") ?? (heart ? field(heart, "resting", "restingHr") : undefined);
  const avg = field(root, "avgHr", "avgHeartRate", "heartRate", "averageHeartRate") ?? (heart ? field(heart, "avg", "avgHr", "heartRate") : undefined);
  const restingStarts =
    field(root, "restingStarts", "resting_starts") ?? (heart ? field(heart, "restingStarts", "starts") : undefined);
  const avgStarts = field(root, "avgStarts", "avg_starts") ?? (heart ? field(heart, "avgStarts", "starts") : undefined);
  const fallback = field(root, "heartDate", "heart_date") ?? (heart ? field(heart, "date", "day") : undefined);
  if (resting !== undefined) pushPaired(samples, "resting_heart_rate", resting, restingStarts, fallback);
  if (avg !== undefined) pushPaired(samples, "heart_rate", avg, avgStarts, fallback);

  const listed = field(root, "metrics");
  const rows = Array.isArray(listed) ? listed.flat(2) : [];
  for (const item of rows) {
    const record = asRecord(item);
    if (!record) continue;
    const name = field(record, "metric", "name");
    if (typeof name !== "string") continue;
    const metric = heartKind(name);
    if (!metric) continue;
    const values = field(record, "values", "value");
    const starts = field(record, "starts", "startDates", "start_dates", "dates");
    if (values === undefined || starts === undefined) continue;
    pushPaired(samples, metric, values, starts, undefined);
  }
  return samples;
}

function heartMetrics(samples: readonly HeartSample[]): FitnessMetricWrite[] {
  const groups = new Map<string, { metric: HeartSample["metric"]; day: string; values: number[]; iso: string | null }>();
  for (const sample of samples) {
    const key = `${sample.metric}:${sample.day}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { metric: sample.metric, day: sample.day, values: [sample.bpm], iso: sample.iso });
      continue;
    }
    existing.values.push(sample.bpm);
    if (sample.iso && (!existing.iso || sample.iso > existing.iso)) existing.iso = sample.iso;
  }
  return [...groups.values()].map((group) => {
    const mean = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
    return {
      source: "shortcuts",
      externalId: `${group.metric}:${group.day}:bpm`,
      metric: group.metric,
      day: group.day,
      recordedAt: group.iso,
      qty: decimalString(mean),
      units: "bpm",
      qtyMin: null,
      qtyMax: null,
      origin: "shortcuts" as const,
      payload: { source: "shortcuts", metric: group.metric, day: group.day, samples: group.values.length },
    };
  });
}

function milesFrom(qty: number, unit: string): number | null {
  if (!unit) {
    if (qty > 100) return (qty * 0.000621371192);
    return qty;
  }
  if (MILES.has(unit)) return qty;
  if (KILOMETERS.has(unit)) return qty * 0.621371192;
  if (METERS.has(unit)) return qty / MILE_METERS;
  return null;
}

function parseMiles(value: unknown, unitHint: unknown): number | null {
  const record = asRecord(value);
  if (record) {
    const qty = parseLocaleNumber(String(field(record, "qty", "value", "magnitude") ?? ""));
    const unit = String(field(record, "units", "unit") ?? unitHint ?? "").trim().toLowerCase();
    if (qty === null) return null;
    return milesFrom(qty, unit);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return milesFrom(value, String(unitHint ?? "").trim().toLowerCase());
  }
  if (typeof value !== "string") return null;
  const amount = singleAmount(value);
  if (!amount) return null;
  const unit = (amount.unit || String(unitHint ?? "")).trim().toLowerCase().replace(/\/mi$/, "");
  return milesFrom(amount.qty, unit);
}

function durationFrom(qty: number, unit: string): number | null {
  if (SECONDS.has(unit)) return qty;
  if (MINUTES.has(unit)) return qty * 60;
  if (!unit) {
    if (qty > 240) return qty;
    return qty * 60;
  }
  return null;
}

function parseDurationSec(value: unknown, unitHint: unknown): number | null {
  const hint = String(unitHint ?? "").trim().toLowerCase();
  const record = asRecord(value);
  if (record) {
    const qty = parseLocaleNumber(String(field(record, "qty", "value", "magnitude") ?? ""));
    const unit = String(field(record, "units", "unit") ?? hint).trim().toLowerCase();
    if (qty === null) return null;
    return durationFrom(qty, unit);
  }
  if (typeof value === "number" && Number.isFinite(value)) return durationFrom(value, hint);
  if (typeof value !== "string") return null;
  const text = value.trim();
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (clock) {
    if (clock[3] !== undefined) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    return Number(clock[1]) * 60 + Number(clock[2]);
  }
  const amount = singleAmount(text);
  if (!amount) return null;
  return durationFrom(amount.qty, amount.unit || hint);
}

function parsePaceSec(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value < 30 ? value * 60 : value;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(/\s*\/\s*mi$/, "").replace(/\s*min(?:utes)?(?:\s*\/\s*mi)?$/, "").trim();
  const clock = /^(\d+):(\d{1,2})$/.exec(text);
  if (clock?.[1] && clock[2]) return Number(clock[1]) * 60 + Number(clock[2]);
  const amount = singleAmount(text);
  if (!amount || amount.qty <= 0) return null;
  if (MINUTES.has(amount.unit) || amount.unit === "") return amount.qty < 30 ? amount.qty * 60 : amount.qty;
  if (SECONDS.has(amount.unit)) return amount.qty;
  return null;
}

function parseAvgHr(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= BPM_MIN && value <= BPM_MAX ? value : null;
  }
  if (typeof value !== "string") return null;
  return bpm(value);
}

function measureKey(day: string, miles: number, durationSec: number): string {
  const roundedMiles = (Math.round(miles * 100) / 100).toFixed(2);
  const roundedSec = String(Math.round(durationSec));
  return `${day}|${roundedMiles}|${roundedSec}`;
}

function buildRun(input: {
  date: unknown;
  start: unknown;
  distance: unknown;
  distanceUnit: unknown;
  duration: unknown;
  durationUnit: unknown;
  pace: unknown;
  avgHr: unknown;
}): NrcRunWrite | null {
  const startText = typeof input.start === "string" ? input.start.trim() : "";
  const dateText = typeof input.date === "string" ? input.date.trim() : "";
  const started = startText ? dayOf(startText) : null;
  const dated = dateText ? dayOf(dateText) : null;
  const day = started?.day ?? dated?.day ?? null;
  if (!day) return null;
  const miles = parseMiles(input.distance, input.distanceUnit);
  const durationSec = parseDurationSec(input.duration, input.durationUnit);
  if (miles === null || durationSec === null) return null;
  if (miles < 0.05 || miles > 100) return null;
  if (durationSec <= 0 || durationSec > DURATION_MAX_SEC) return null;
  const startTime = started?.iso ?? null;
  const sentPace = parsePaceSec(input.pace);
  const computed = durationSec / miles;
  const pace = sentPace ?? computed;
  const avg = parseAvgHr(input.avgHr);
  return {
    day,
    startTime,
    distanceMi: decimalString(miles),
    durationSec: decimalString(durationSec),
    paceSecPerMi: Number.isFinite(pace) && pace > 0 ? decimalString(pace) : null,
    avgHr: avg === null ? null : decimalString(avg),
    startKey: startTime ? `${day}|${startTime}` : null,
    measureKey: measureKey(day, miles, durationSec),
  };
}

function runFromRecord(record: Record<string, unknown>): NrcRunWrite | null {
  return buildRun({
    date: field(record, "date", "day"),
    start: field(record, "start", "startTime", "startedAt", "startDate", "start_time"),
    distance: field(record, "distance", "miles", "distanceMi", "distance_mi"),
    distanceUnit: field(record, "distanceUnit", "distance_unit", "distanceUnits"),
    duration: field(record, "duration", "durationSec", "duration_sec", "durationMin", "duration_min"),
    durationUnit:
      field(record, "durationUnit", "duration_unit", "durationUnits") ??
      (field(record, "durationSec", "duration_sec") !== undefined ? "s" : undefined) ??
      (field(record, "durationMin", "duration_min") !== undefined ? "min" : undefined),
    pace: field(record, "pace", "pacePerMile", "pace_per_mi"),
    avgHr: field(record, "avgHr", "avgHR", "averageHeartRate", "heartRate", "heart_rate", "hr"),
  });
}

function lineRun(line: string): NrcRunWrite | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[T ]\S+)?\s+([0-9][0-9.,]*)\s*(miles|mile|mi|kilometers|kilometer|km|meters|meter|m)?\s+([0-9][0-9.,:]+)\s*(minutes|minute|mins|min|seconds|second|secs|sec|s)?(?:\s+([0-9]+:[0-9]{2}))?(?:\s+([0-9][0-9.,]*))?\s*$/i.exec(
      line.trim(),
    );
  if (!match) return null;
  return buildRun({
    date: match[1],
    start: line.includes("T") ? line.split(/\s+/)[0] : undefined,
    distance: match[2],
    distanceUnit: match[3],
    duration: match[4],
    durationUnit: match[5],
    pace: match[6],
    avgHr: match[7],
  });
}

function isList(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  return typeof value === "string" && value.includes("\n");
}

function parallelRuns(record: Record<string, unknown>): NrcRunWrite[] {
  const dates = splitShortcutList(field(record, "dates", "date", "days", "day"));
  const starts = splitShortcutList(field(record, "starts", "start", "startDates"));
  const distances = splitShortcutList(field(record, "distances", "distance", "miles"));
  const durations = splitShortcutList(field(record, "durations", "duration"));
  const paces = splitShortcutList(field(record, "paces", "pace"));
  const hearts = splitShortcutList(field(record, "avgHrs", "avgHr", "heartRates", "heartRate", "hr"));
  const count = Math.max(dates.length, starts.length, distances.length, durations.length);
  const runs: NrcRunWrite[] = [];
  for (let index = 0; index < count && runs.length < NRC_RUN_LIMIT; index += 1) {
    const run = buildRun({
      date: dates[index],
      start: starts[index],
      distance: distances[index],
      distanceUnit: field(record, "distanceUnit", "distance_unit"),
      duration: durations[index],
      durationUnit: field(record, "durationUnit", "duration_unit"),
      pace: paces[index],
      avgHr: hearts[index],
    });
    if (run) runs.push(run);
  }
  return runs;
}

function collectRuns(value: unknown): NrcRunWrite[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return splitShortcutList(value)
      .map((line) => lineRun(line))
      .filter((run): run is NrcRunWrite => run !== null)
      .slice(0, NRC_RUN_LIMIT);
  }
  if (Array.isArray(value)) {
    const runs: NrcRunWrite[] = [];
    for (const item of value) {
      if (runs.length >= NRC_RUN_LIMIT) break;
      if (typeof item === "string") {
        const run = lineRun(item);
        if (run) runs.push(run);
        continue;
      }
      const record = asRecord(item);
      if (!record) continue;
      if (
        isList(field(record, "dates", "distances", "durations")) ||
        field(record, "dates", "distances", "durations") !== undefined
      ) {
        runs.push(...parallelRuns(record));
        continue;
      }
      const run = runFromRecord(record);
      if (run) runs.push(run);
    }
    return runs.slice(0, NRC_RUN_LIMIT);
  }
  const record = asRecord(value);
  if (!record) return [];
  if (
    isList(field(record, "dates", "date", "distances", "distance", "durations", "duration")) ||
    field(record, "dates", "distances", "durations") !== undefined
  ) {
    return parallelRuns(record).slice(0, NRC_RUN_LIMIT);
  }
  const one = runFromRecord(record);
  return one ? [one] : [];
}

export function nrcSame(left: NrcRunWrite, right: NrcRunWrite): boolean {
  if (left.startKey && right.startKey && left.startKey === right.startKey) return true;
  return left.measureKey === right.measureKey;
}

/** Later distance and duration win. A missing heart rate or start keeps the one already stored. */
export function mergeNrcRun(previous: NrcRunWrite, next: NrcRunWrite): NrcRunWrite {
  return {
    day: next.day,
    startTime: next.startTime ?? previous.startTime,
    distanceMi: next.distanceMi,
    durationSec: next.durationSec,
    paceSecPerMi: next.paceSecPerMi ?? previous.paceSecPerMi,
    avgHr: next.avgHr ?? previous.avgHr,
    startKey: next.startKey ?? previous.startKey,
    measureKey: next.measureKey,
  };
}

export function absorbNrcRuns(current: readonly NrcRunWrite[], incoming: readonly NrcRunWrite[]): NrcRunWrite[] {
  const runs = [...current];
  for (const row of incoming) {
    const hits: number[] = [];
    runs.forEach((existing, index) => {
      if (nrcSame(existing, row)) hits.push(index);
    });
    if (hits.length === 0) {
      runs.push(row);
      continue;
    }
    let merged = row;
    for (const index of hits) {
      const existing = runs[index];
      if (existing) merged = mergeNrcRun(existing, merged);
    }
    const keep = hits[0];
    if (keep === undefined) continue;
    runs[keep] = merged;
    for (const index of hits.slice(1).sort((left, right) => right - left)) runs.splice(index, 1);
  }
  return runs;
}

/**
 * Optional runs and heart rate on the same body as steps.
 * Missing fields add nothing. A steps-only post is unchanged.
 * Numbers may be strings. Units may read mi or min. Commas may be decimals.
 * A Find Health Samples list may arrive as newline text.
 */
export function readNightlyFitness(body: unknown): NightlyFitness {
  const root = asRecord(body);
  if (!root) return { heart: [], runs: [] };
  return {
    heart: heartMetrics(collectHeart(root)),
    runs: absorbNrcRuns([], collectRuns(field(root, "runs"))),
  };
}

export function nrcRunsAsWrites(rows: readonly NrcRunWrite[]): FitnessWorkoutWrite[] {
  return rows.map((row) => {
    const startedAt = row.startTime ?? chicagoInstant(row.day, "12:00").toISOString();
    const day = chicagoDay(startedAt) ?? row.day;
    return {
      source: "shortcuts",
      externalId: row.startKey ?? row.measureKey,
      name: "Running",
      startedAt,
      endedAt: null,
      durationSec: row.durationSec,
      distanceQty: row.distanceMi,
      distanceUnits: "mi",
      energyKcal: null,
      heartRateAvg: row.avgHr,
      heartRateMin: null,
      heartRateMax: null,
      origin: "shortcuts",
      payload: {
        source: "Nike Run Club",
        clockKnown: row.startTime !== null,
        day,
      },
    };
  });
}
