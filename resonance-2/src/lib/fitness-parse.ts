import { chicagoDay } from "@/lib/calendar-time";
import type {
  FitnessMetricWrite,
  FitnessOrigin,
  FitnessWorkoutWrite,
  FitnessWrites,
} from "@/lib/fitness-types";

const HAE_DATE =
  /^(\d{4}-\d{2}-\d{2})(?:[ T]([0-2]\d):([0-5]\d):([0-5]\d))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/;

const SERIES_KEYS = new Set([
  "route",
  "heartRateData",
  "heartRateRecovery",
  "stepCount",
  "activeEnergy",
  "basalEnergy",
  "walkingAndRunningDistance",
  "cyclingCadence",
  "cyclingDistance",
  "cyclingPower",
  "cyclingSpeed",
  "swimDistance",
  "swimStroke",
]);

/**
 * Day totals. A request that contains several samples for one Chicago day
 * collapses to one row, so a re-sent day upserts instead of stacking.
 * Heart-rate names average. Everything else sums.
 */
function averages(metric: string): boolean {
  return metric.includes("heart_rate") || metric.endsWith("_bpm");
}

export function decimalString(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, "");
}

export function parseHealthTimestamp(value: string): { iso: string; day: string } | null {
  const match = HAE_DATE.exec(value.trim());
  if (!match) return null;
  const date = match[1];
  const hour = match[2];
  const minute = match[3];
  const second = match[4];
  const zone = match[5];
  if (!date) return null;
  if (!hour || !minute || !second) {
    return { iso: `${date}T12:00:00.000Z`, day: date };
  }
  const offset =
    !zone || zone === "Z"
      ? "Z"
      : zone.includes(":")
        ? zone
        : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const iso = `${date}T${hour}:${minute}:${second}${offset}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return { iso: parsed.toISOString(), day: chicagoDay(parsed.toISOString()) };
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

function metricName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) return null;
  return name;
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

type MetricPoint = {
  qty: number;
  min: number | null;
  max: number | null;
  at: { iso: string; day: string };
};

function metricPoint(value: unknown, fallbackUnits: string): { point: MetricPoint; units: string } | null {
  const record = asRecord(value);
  if (!record) return null;
  const rawDate = record.date ?? record.endDate ?? record.startDate;
  if (typeof rawDate !== "string") return null;
  const at = parseHealthTimestamp(rawDate);
  if (!at || !at.day) return null;
  const avg = numberOrNull(record.Avg ?? record.avg);
  const qty = numberOrNull(record.qty) ?? avg;
  if (qty === null) return null;
  return {
    units: cleanUnits(record.units) || fallbackUnits || "count",
    point: {
      qty,
      min: numberOrNull(record.Min ?? record.min),
      max: numberOrNull(record.Max ?? record.max),
      at,
    },
  };
}

function collectExport(body: unknown): { metrics: unknown[]; workouts: unknown[] } {
  const root = asRecord(body);
  if (!root) return { metrics: [], workouts: [] };
  const data = asRecord(root.data) ?? root;
  return {
    metrics: asArray(data.metrics ?? data.metric),
    workouts: asArray(data.workouts ?? data.workout),
  };
}

function metricRows(
  metrics: unknown[],
  source: string,
  origin: FitnessOrigin,
): FitnessMetricWrite[] {
  const buckets = new Map<
    string,
    {
      metric: string;
      day: string;
      units: string;
      sum: number;
      count: number;
      min: number | null;
      max: number | null;
      recordedAt: string | null;
      kind: "sum" | "avg";
    }
  >();

  for (const metric of metrics) {
    const record = asRecord(metric);
    if (!record) continue;
    const name = metricName(record.name);
    if (!name) continue;
    const units = cleanUnits(record.units);
    const kind = averages(name) ? "avg" : "sum";
    for (const entry of asArray(record.data)) {
      const parsed = metricPoint(entry, units);
      if (!parsed) continue;
      const key = `${name}:${parsed.point.at.day}:${parsed.units.toLowerCase()}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          metric: name,
          day: parsed.point.at.day,
          units: parsed.units,
          sum: parsed.point.qty,
          count: 1,
          min: parsed.point.min,
          max: parsed.point.max,
          recordedAt: parsed.point.at.iso,
          kind,
        });
        continue;
      }
      existing.sum += parsed.point.qty;
      existing.count += 1;
      if (parsed.point.min !== null) {
        existing.min = existing.min === null ? parsed.point.min : Math.min(existing.min, parsed.point.min);
      }
      if (parsed.point.max !== null) {
        existing.max = existing.max === null ? parsed.point.max : Math.max(existing.max, parsed.point.max);
      }
      if (!existing.recordedAt || parsed.point.at.iso > existing.recordedAt) {
        existing.recordedAt = parsed.point.at.iso;
      }
    }
  }

  return [...buckets.values()].map((bucket) => {
    const qty = bucket.kind === "avg" ? bucket.sum / bucket.count : bucket.sum;
    return {
      source,
      externalId: `${bucket.metric}:${bucket.day}:${bucket.units.toLowerCase()}`,
      metric: bucket.metric,
      day: bucket.day,
      recordedAt: bucket.recordedAt,
      qty: decimalString(qty),
      units: bucket.units,
      qtyMin: bucket.min === null ? null : decimalString(bucket.min),
      qtyMax: bucket.max === null ? null : decimalString(bucket.max),
      origin,
      payload: {
        metric: bucket.metric,
        day: bucket.day,
        units: bucket.units,
        points: bucket.count,
      },
    };
  });
}

export function energyKcal(qty: number, units: string): number | null {
  const normalized = units.trim().toLowerCase();
  if (normalized === "kcal" || normalized === "cal") return qty;
  if (normalized === "kj") return qty / 4.184;
  return null;
}

function heartSummary(workout: Record<string, unknown>): {
  avg: number | null;
  min: number | null;
  max: number | null;
} {
  const summary = asRecord(workout.heartRate);
  const avg =
    qtyUnits(summary?.avg)?.qty ??
    qtyUnits(workout.avgHeartRate)?.qty ??
    null;
  const min = qtyUnits(summary?.min)?.qty ?? qtyUnits(workout.minHeartRate)?.qty ?? null;
  const max = qtyUnits(summary?.max)?.qty ?? qtyUnits(workout.maxHeartRate)?.qty ?? null;
  if (avg !== null || min !== null || max !== null) return { avg, min, max };

  const series = asArray(workout.heartRateData);
  const values: number[] = [];
  for (const entry of series) {
    const record = asRecord(entry);
    if (!record) continue;
    const qty = numberOrNull(record.Avg ?? record.avg ?? record.qty);
    if (qty !== null) values.push(qty);
  }
  if (values.length === 0) return { avg: null, min: null, max: null };
  const total = values.reduce((sum, value) => sum + value, 0);
  return { avg: total / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function workoutEnergy(workout: Record<string, unknown>): number | null {
  for (const candidate of [workout.activeEnergyBurned, workout.activeEnergy, workout.totalEnergy]) {
    const parsed = qtyUnits(candidate);
    if (!parsed) continue;
    const kcal = energyKcal(parsed.qty, parsed.units);
    if (kcal !== null) return kcal;
  }
  return null;
}

function trimmedWorkout(workout: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(workout)) {
    if (SERIES_KEYS.has(key)) continue;
    if (Array.isArray(value)) continue;
    copy[key] = value;
  }
  return copy;
}

function workoutRows(
  workouts: unknown[],
  source: string,
  origin: FitnessOrigin,
): FitnessWorkoutWrite[] {
  const rows: FitnessWorkoutWrite[] = [];
  for (const entry of workouts) {
    const workout = asRecord(entry);
    if (!workout) continue;
    const name = typeof workout.name === "string" ? workout.name.trim() : "";
    if (!name || typeof workout.start !== "string") continue;
    const start = parseHealthTimestamp(workout.start);
    if (!start?.day) continue;
    const end = typeof workout.end === "string" ? parseHealthTimestamp(workout.end) : null;
    const elapsed =
      end === null
        ? null
        : (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 1000;
    const duration = numberOrNull(workout.duration) ?? (elapsed !== null && elapsed > 0 ? elapsed : null);
    const distance = qtyUnits(workout.distance);
    const energy = workoutEnergy(workout);
    const heart = heartSummary(workout);
    const id = typeof workout.id === "string" ? workout.id.trim() : "";
    const externalId = id || `${name}|${start.iso}|${end?.iso ?? ""}`;
    rows.push({
      source,
      externalId,
      name,
      startedAt: start.iso,
      endedAt: end?.iso ?? null,
      durationSec: duration === null ? null : decimalString(duration),
      distanceQty: distance ? decimalString(distance.qty) : null,
      distanceUnits: distance?.units ?? null,
      energyKcal: energy === null ? null : decimalString(energy),
      heartRateAvg: heart.avg === null ? null : decimalString(heart.avg),
      heartRateMin: heart.min === null ? null : decimalString(heart.min),
      heartRateMax: heart.max === null ? null : decimalString(heart.max),
      origin,
      payload: trimmedWorkout(workout),
    });
  }
  return rows;
}

export function sanitizeFitnessSource(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return cleaned || "health-auto-export";
}

/** Health Auto Export JSON, metrics automation and workouts automation. */
export function parseHealthExport(
  body: unknown,
  options: { source?: string; origin?: FitnessOrigin } = {},
): FitnessWrites {
  const source = sanitizeFitnessSource(options.source);
  const origin = options.origin ?? "health-auto-export";
  const collected = collectExport(body);
  return {
    metrics: metricRows(collected.metrics, source, origin),
    workouts: workoutRows(collected.workouts, source, origin),
  };
}
