import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decimalString, energyKcal, parseHealthTimestamp } from "@/lib/fitness-parse";
import type { FitnessMetricWrite, FitnessWorkoutWrite, FitnessWrites } from "@/lib/fitness-types";

/** Vercel serverless functions reject a request body over about 4.5 MB. */
export const HEALTH_AUTO_EXPORT_BODY_LIMIT = 4_500_000;

/** Rows written in one INSERT. A full-history export stays a sequence of these. */
export const HEALTH_AUTO_EXPORT_DB_BATCH = 40;

export const HEALTH_AUTO_EXPORT_SOURCE = "health-auto-export";
export const HEALTH_AUTO_EXPORT_HEADER = "x-resonance-token";
export const HEALTH_AUTO_EXPORT_HEADER_NAME = "X-Resonance-Token";
export const HEALTH_AUTO_EXPORT_URL = "https://resonance3.vercel.app/api/ingest/health-auto-export";

const KM_PER_MILE = 1.609344;

export function newHealthAutoExportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHealthAutoExportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compare a presented token with the stored sha256 hex digest. */
export function healthAutoExportTokenMatches(provided: string, storedHex: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = /^[0-9a-f]{64}$/i.test(storedHex) ? Buffer.from(storedHex, "hex") : Buffer.alloc(0);
  if (right.length !== left.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanUnits(value: unknown): string {
  if (typeof value !== "string") return "";
  const units = value.trim();
  return units.length > 0 && units.length <= 32 ? units : "";
}

function qtyUnits(value: unknown): { qty: number; units: string } | null {
  const record = asRecord(value);
  if (!record) return null;
  const qty = numberOrNull(record.qty);
  const units = cleanUnits(record.units);
  if (qty === null || !units) return null;
  return { qty, units };
}

function parseWhen(value: unknown): { iso: string; day: string } | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/(\d{2}:\d{2}:\d{2})\.\d+/, "$1");
  const parsed = parseHealthTimestamp(cleaned);
  if (!parsed?.day) return null;
  return parsed;
}

function stepUnits(units: string): boolean {
  const normalized = units.trim().toLowerCase();
  return normalized === "" || normalized === "count" || normalized === "steps" || normalized === "step";
}

type StepPoint = { day: string; qty: number; source: string; iso: string };

function stepPoints(metrics: unknown[]): StepPoint[] {
  const points: StepPoint[] = [];
  for (const metric of metrics) {
    const record = asRecord(metric);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
    if (name !== "step_count") continue;
    const fallback = cleanUnits(record.units) || "count";
    for (const entry of asArray(record.data)) {
      const point = asRecord(entry);
      if (!point) continue;
      const at = parseWhen(point.date ?? point.endDate ?? point.startDate);
      const qty = numberOrNull(point.qty);
      const units = cleanUnits(point.units) || fallback;
      if (!at || qty === null || qty < 0 || !stepUnits(units)) continue;
      const source = typeof point.source === "string" ? point.source.trim().slice(0, 80) : "";
      points.push({ day: at.day, qty, source, iso: at.iso });
    }
  }
  return points;
}

/**
 * One Chicago day, one total.
 * Samples on that day are summed per source. Two devices (iPhone and Watch)
 * keep the larger source so the same steps are not added twice.
 * A later request replaces that day. It does not add to the stored total.
 */
function stepRows(points: StepPoint[]): FitnessMetricWrite[] {
  const byDay = new Map<string, Map<string, { sum: number; points: number; latest: string }>>();
  for (const point of points) {
    const sources = byDay.get(point.day) ?? new Map();
    byDay.set(point.day, sources);
    const bucket = sources.get(point.source) ?? { sum: 0, points: 0, latest: point.iso };
    bucket.sum += point.qty;
    bucket.points += 1;
    if (point.iso > bucket.latest) bucket.latest = point.iso;
    sources.set(point.source, bucket);
  }
  return [...byDay.entries()].map(([day, sources]) => {
    let bestSource = "";
    let best = { sum: 0, points: 0, latest: "" };
    let bestSum = -1;
    let points = 0;
    for (const [source, bucket] of sources) {
      points += bucket.points;
      if (bucket.sum > bestSum) {
        bestSum = bucket.sum;
        best = bucket;
        bestSource = source;
      }
    }
    return {
      source: HEALTH_AUTO_EXPORT_SOURCE,
      externalId: `step_count:${day}:count`,
      metric: "step_count",
      day,
      recordedAt: best.latest || null,
      qty: decimalString(best.sum),
      units: "count",
      qtyMin: null,
      qtyMax: null,
      origin: "health-auto-export" as const,
      payload: {
        metric: "step_count",
        day,
        units: "count",
        points,
        sources: sources.size,
        source: bestSource || null,
        aggregation: points <= sources.size ? "day" : "samples",
        dailyTotal: true,
      },
    };
  });
}

export function normalizeDistance(qty: number, units: string): { miles: number; km: number } | null {
  const normalized = units.trim().toLowerCase();
  let miles: number | null = null;
  if (normalized === "mi" || normalized === "mile" || normalized === "miles") miles = qty;
  else if (normalized === "km" || normalized === "kilometer" || normalized === "kilometers") miles = qty / KM_PER_MILE;
  else if (normalized === "m" || normalized === "meter" || normalized === "meters") miles = qty / 1609.344;
  else if (normalized === "yd" || normalized === "yard" || normalized === "yards") miles = qty * 0.000568182;
  if (miles === null || !Number.isFinite(miles) || miles < 0) return null;
  return { miles, km: miles * KM_PER_MILE };
}

function heartQty(value: unknown): number | null {
  const direct = numberOrNull(value);
  if (direct !== null) return direct;
  return qtyUnits(value)?.qty ?? null;
}

function heartSummary(workout: Record<string, unknown>): { avg: number | null; max: number | null; min: number | null } {
  const summary = asRecord(workout.heartRate);
  const avg =
    heartQty(summary?.avg) ??
    heartQty(summary?.Avg) ??
    heartQty(workout.avgHeartRate) ??
    heartQty(workout.averageHeartRate) ??
    null;
  const max = heartQty(summary?.max) ?? heartQty(summary?.Max) ?? heartQty(workout.maxHeartRate) ?? null;
  const min = heartQty(summary?.min) ?? heartQty(summary?.Min) ?? heartQty(workout.minHeartRate) ?? null;
  if (avg !== null || max !== null || min !== null) return { avg, max, min };
  const values: number[] = [];
  for (const entry of asArray(workout.heartRateData)) {
    const record = asRecord(entry);
    if (!record) continue;
    const qty = numberOrNull(record.Avg ?? record.avg ?? record.Max ?? record.max ?? record.qty);
    if (qty !== null) values.push(qty);
  }
  if (values.length === 0) return { avg: null, max: null, min: null };
  const total = values.reduce((sum, value) => sum + value, 0);
  return { avg: total / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function kcalOf(value: unknown): number | null {
  const parsed = qtyUnits(value);
  if (!parsed) return null;
  return energyKcal(parsed.qty, parsed.units);
}

function workoutEnergy(workout: Record<string, unknown>): number | null {
  for (const candidate of [workout.activeEnergyBurned, workout.energy, workout.activeEnergy, workout.totalEnergy]) {
    if (Array.isArray(candidate)) continue;
    const kcal = kcalOf(candidate);
    if (kcal !== null) return kcal;
  }
  for (const candidate of [workout.activeEnergy, workout.energy, workout.activeEnergyBurned]) {
    if (!Array.isArray(candidate)) continue;
    let sum = 0;
    let seen = false;
    for (const entry of candidate) {
      const kcal = kcalOf(entry);
      if (kcal === null) continue;
      sum += kcal;
      seen = true;
    }
    if (seen) return sum;
  }
  return null;
}

function workoutDistance(workout: Record<string, unknown>): { miles: string; km: string; qty: string; units: string } | null {
  const parsed = qtyUnits(workout.distance);
  if (!parsed) return null;
  const normalized = normalizeDistance(parsed.qty, parsed.units);
  if (!normalized) {
    return {
      miles: "",
      km: "",
      qty: decimalString(parsed.qty),
      units: parsed.units,
    };
  }
  return {
    miles: decimalString(normalized.miles),
    km: decimalString(normalized.km),
    qty: decimalString(normalized.miles),
    units: "mi",
  };
}

function workoutExternalId(id: string, startIso: string, name: string): string {
  if (id) return id.slice(0, 200);
  return createHash("sha256").update(`${startIso}|${name.trim().toLowerCase()}`).digest("hex");
}

const MILE_SCALE = 10_000;
const MINUTE_MS = 60_000;

type SeriesPoint = { t: string; ms: number; qty: number };

function elevationUnits(units: string): string | null {
  const normalized = units.trim().toLowerCase();
  if (normalized === "m" || normalized === "meter" || normalized === "meters") return "m";
  if (normalized === "ft" || normalized === "foot" || normalized === "feet") return "ft";
  return null;
}

/** Recorded ascent or descent. Unknown units are dropped rather than labeled. */
function elevationField(value: unknown): { qty: string; units: string } | null {
  const parsed = qtyUnits(value);
  if (!parsed || parsed.qty < 0) return null;
  const units = elevationUnits(parsed.units);
  if (!units) return null;
  return { qty: decimalString(parsed.qty), units };
}

/**
 * One heart-rate value per minute.
 * Samples inside a minute are averaged. Empty minutes stay empty.
 */
function heartSeries(workout: Record<string, unknown>): { t: string; bpm: string }[] {
  const buckets = new Map<string, number[]>();
  for (const entry of asArray(workout.heartRateData)) {
    const record = asRecord(entry);
    if (!record) continue;
    const at = parseWhen(record.date ?? record.startDate ?? record.endDate);
    const bpm = numberOrNull(record.Avg ?? record.avg ?? record.qty);
    if (!at || bpm === null || bpm <= 0 || bpm > 250) continue;
    const minute = at.iso.slice(0, 16);
    const list = buckets.get(minute) ?? [];
    list.push(bpm);
    buckets.set(minute, list);
  }
  return [...buckets.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([minute, values]) => ({
      t: `${minute}:00.000Z`,
      bpm: decimalString(values.reduce((sum, value) => sum + value, 0) / values.length),
    }));
}

function timedSeries(raw: unknown, convert: (qty: number, units: string) => number | null): SeriesPoint[] {
  const summed = new Map<string, { ms: number; qty: number }>();
  for (const entry of asArray(raw)) {
    const record = asRecord(entry);
    if (!record) continue;
    const at = parseWhen(record.date ?? record.startDate ?? record.endDate);
    const parsed = qtyUnits(record);
    if (!at || !parsed) continue;
    const qty = convert(parsed.qty, parsed.units);
    if (qty === null || qty < 0) continue;
    const ms = Date.parse(at.iso);
    if (!Number.isFinite(ms)) continue;
    const current = summed.get(at.iso);
    if (current) current.qty += qty;
    else summed.set(at.iso, { ms, qty });
  }
  return [...summed.entries()]
    .map(([t, row]) => ({ t, ms: row.ms, qty: row.qty }))
    .sort((left, right) => left.ms - right.ms);
}

function distanceSeries(workout: Record<string, unknown>): SeriesPoint[] {
  return timedSeries(
    workout.walkingAndRunningDistance,
    (qty, units) => normalizeDistance(qty, units)?.miles ?? null,
  );
}

function energySeries(workout: Record<string, unknown>): SeriesPoint[] {
  return timedSeries(workout.activeEnergy, (qty, units) => energyKcal(qty, units));
}

function seriesDistance(
  points: readonly SeriesPoint[],
): { miles: string; km: string; qty: string; units: string } | null {
  const miles = points.reduce((sum, point) => sum + point.qty, 0);
  if (!(miles > 0)) return null;
  return {
    miles: decimalString(miles),
    km: decimalString(miles * KM_PER_MILE),
    qty: decimalString(miles),
    units: "mi",
  };
}

/**
 * Per-mile splits from the distance series.
 * Fine enough means every sample is under a mile and at most a minute from the
 * previous one, and the first sample is within a minute of the start.
 * A mile closes on the recorded sample that reaches it.
 * A coarser gap, or a sample that already contains a mile, yields no splits.
 * Times are never placed between samples.
 */
function mileSplits(
  startIso: string,
  endIso: string | null,
  points: readonly SeriesPoint[],
): { miles: string; durationSec: string }[] {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs) || points.length < 2) return [];
  const endMs = endIso === null ? null : Date.parse(endIso);
  const window = points.filter((point) => {
    if (point.ms < startMs - 1_000) return false;
    if (endMs !== null && Number.isFinite(endMs) && point.ms > endMs + MINUTE_MS) return false;
    return true;
  });
  if (window.length < 2) return [];
  if (window[0].ms - startMs > MINUTE_MS) return [];
  for (let index = 1; index < window.length; index += 1) {
    const gap = window[index].ms - window[index - 1].ms;
    if (gap <= 0 || gap > MINUTE_MS) return [];
  }
  for (const point of window) {
    if (Math.round(point.qty * MILE_SCALE) >= MILE_SCALE) return [];
  }
  let cumulative = 0;
  let nextMile = MILE_SCALE;
  let previous = startMs;
  const splits: { miles: string; durationSec: string }[] = [];
  for (const point of window) {
    cumulative += Math.round(point.qty * MILE_SCALE);
    if (cumulative < nextMile) continue;
    const duration = (point.ms - previous) / 1000;
    if (!(duration > 0)) return [];
    splits.push({ miles: "1", durationSec: decimalString(duration) });
    previous = point.ms;
    nextMile += MILE_SCALE;
  }
  return splits;
}

function workoutRows(workouts: unknown[]): FitnessWorkoutWrite[] {
  const rows = new Map<string, FitnessWorkoutWrite>();
  for (const entry of workouts) {
    const workout = asRecord(entry);
    if (!workout) continue;
    const name = typeof workout.name === "string" ? workout.name.trim() : "";
    if (!name || typeof workout.start !== "string") continue;
    const start = parseWhen(workout.start);
    if (!start) continue;
    const end = typeof workout.end === "string" ? parseWhen(workout.end) : null;
    const elapsed =
      end === null ? null : (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 1000;
    const duration = numberOrNull(workout.duration) ?? (elapsed !== null && elapsed > 0 ? elapsed : null);
    const distancePoints = distanceSeries(workout);
    const energyPoints = energySeries(workout);
    const summaryDistance = workoutDistance(workout);
    const distance = summaryDistance ?? (distancePoints.length > 0 ? seriesDistance(distancePoints) : null);
    const energy = workoutEnergy(workout);
    const heart = heartSummary(workout);
    const id = typeof workout.id === "string" ? workout.id.trim() : "";
    const sourceName = typeof workout.source === "string" ? workout.source.trim().slice(0, 80) : "";
    const externalId = workoutExternalId(id, start.iso, name);
    const payload: Record<string, unknown> = {
      id: id || null,
      name,
      source: sourceName || null,
    };
    if (distance?.miles) {
      payload.miles = distance.miles;
      payload.km = distance.km;
    }
    const elevationUp = elevationField(workout.elevationUp);
    const elevationDown = elevationField(workout.elevationDown);
    if (elevationUp) payload.elevationUp = elevationUp;
    if (elevationDown) payload.elevationDown = elevationDown;
    const heartMinutes = heartSeries(workout);
    if (heartMinutes.length > 0) payload.heart = heartMinutes;
    if (distancePoints.length > 0) {
      payload.distanceSeries = distancePoints.map((point) => ({
        t: point.t,
        miles: decimalString(point.qty),
      }));
    }
    if (energyPoints.length > 0) {
      payload.energySeries = energyPoints.map((point) => ({
        t: point.t,
        kcal: decimalString(point.qty),
      }));
    }
    const recordedSplits = splitRows(workout);
    const splits =
      recordedSplits.length > 0 ? recordedSplits : mileSplits(start.iso, end?.iso ?? null, distancePoints);
    if (splits.length > 0) payload.splits = splits;
    rows.set(externalId, {
      source: HEALTH_AUTO_EXPORT_SOURCE,
      externalId,
      name: name.slice(0, 120),
      startedAt: start.iso,
      endedAt: end?.iso ?? null,
      durationSec: duration === null ? null : decimalString(duration),
      distanceQty: distance ? distance.qty : null,
      distanceUnits: distance ? distance.units : null,
      energyKcal: energy === null ? null : decimalString(energy),
      heartRateAvg: heart.avg === null ? null : decimalString(heart.avg),
      heartRateMin: heart.min === null ? null : decimalString(heart.min),
      heartRateMax: heart.max === null ? null : decimalString(heart.max),
      origin: "health-auto-export",
      payload,
    });
  }
  return [...rows.values()];
}

function metricKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function restingUnits(units: string): boolean {
  const normalized = units.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "count" ||
    normalized === "bpm" ||
    normalized === "count/min" ||
    normalized === "beats/min" ||
    normalized === "beats per minute"
  );
}

/**
 * One resting heart rate per Chicago day.
 * The latest sample that day wins. A later request with the same external id replaces it.
 */
function restingRows(metrics: unknown[]): FitnessMetricWrite[] {
  const best = new Map<string, { qty: number; iso: string; source: string }>();
  for (const metric of metrics) {
    const record = asRecord(metric);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name : "";
    if (metricKey(name) !== "restingheartrate") continue;
    const fallback = cleanUnits(record.units) || "bpm";
    for (const entry of asArray(record.data)) {
      const point = asRecord(entry);
      if (!point) continue;
      const at = parseWhen(point.date ?? point.endDate ?? point.startDate);
      const qty = numberOrNull(point.qty);
      const units = cleanUnits(point.units) || fallback;
      if (!at || qty === null || qty <= 0 || qty > 220 || !restingUnits(units)) continue;
      const source = typeof point.source === "string" ? point.source.trim().slice(0, 80) : "";
      const current = best.get(at.day);
      if (!current || at.iso >= current.iso) best.set(at.day, { qty, iso: at.iso, source });
    }
  }
  return [...best.entries()].map(([day, row]) => ({
    source: HEALTH_AUTO_EXPORT_SOURCE,
    externalId: `resting_heart_rate:${day}:bpm`,
    metric: "resting_heart_rate",
    day,
    recordedAt: row.iso || null,
    qty: decimalString(row.qty),
    units: "bpm",
    qtyMin: null,
    qtyMax: null,
    origin: "health-auto-export" as const,
    payload: {
      metric: "resting_heart_rate",
      day,
      units: "bpm",
      source: row.source || null,
      aggregation: "day",
      dailyTotal: true,
    },
  }));
}

/** Lap rows that already carry distance and duration. Missing pieces are skipped, never filled in. */
function splitRows(workout: Record<string, unknown>): { miles: string; durationSec: string }[] {
  const raw = workout.splits ?? workout.laps;
  if (!Array.isArray(raw)) return [];
  const splits: { miles: string; durationSec: string }[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const distance = workoutDistance(record);
    const duration = numberOrNull(record.duration ?? record.durationSec);
    if (!distance?.miles || duration === null || duration <= 0) continue;
    splits.push({ miles: distance.miles, durationSec: decimalString(duration) });
  }
  return splits;
}

/** Health Auto Export REST API JSON, version 2: `{ data: { metrics, workouts } }`. */
export function parseHealthAutoExport(body: unknown): FitnessWrites {
  const root = asRecord(body);
  const data = asRecord(root?.data) ?? root;
  const listed = asArray(data?.metrics ?? data?.metric);
  const metrics = [...stepRows(stepPoints(listed)), ...restingRows(listed)];
  const workouts = workoutRows(asArray(data?.workouts ?? data?.workout));
  return { metrics, workouts };
}
