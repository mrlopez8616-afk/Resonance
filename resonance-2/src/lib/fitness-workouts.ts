import { decimalString } from "@/lib/fitness-parse";
import type {
  FitnessWorkoutWrite,
  ShortcutWorkoutType,
  ShortcutWorkoutWrite,
} from "@/lib/fitness-types";

export type { ShortcutWorkoutType, ShortcutWorkoutWrite };

/** One Shortcuts post. A backfill from September is well under this. */
export const SHORTCUT_WORKOUT_LIMIT = 400;

/** International mile. Pace per mile uses the same length. */
export const MILE_METERS = 1609.344;

const SOURCE_MAX = 120;
const DURATION_MAX_SEC = 48 * 60 * 60;

const ISO_OFFSET =
  /^(\d{4}-\d{2}-\d{2})[T ]([0-2]\d):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

const SECONDS = new Set(["s", "sec", "secs", "second", "seconds"]);
const MINUTES = new Set(["m", "min", "mins", "minute", "minutes"]);
const MILES = new Set(["mi", "mile", "miles"]);
const KILOMETERS = new Set(["km", "kilometer", "kilometers"]);
const KCAL = new Set(["kcal", "cal", "cals", "calorie", "calories"]);

export type ShortcutWorkoutResult =
  | { ok: true; workouts: ShortcutWorkoutWrite[] }
  | { ok: false; error: string };

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

function cleanUnit(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function paceFrom(
  durationSec: number,
  distanceM: number,
): { perKm: string; perMi: string } | null {
  if (!(durationSec > 0) || !(distanceM > 0)) return null;
  return {
    perKm: decimalString(durationSec / (distanceM / 1000)),
    perMi: decimalString(durationSec / (distanceM / MILE_METERS)),
  };
}

/** ISO-8601 with a numeric offset or Z. A bare wall time is rejected. */
export function parseWorkoutStart(value: string): string | null {
  const match = ISO_OFFSET.exec(value.trim().replace(/[\u202f\u00a0]/g, " "));
  if (!match?.[1] || !match[2] || !match[3] || !match[5]) return null;
  const second = match[4] ?? "00";
  const zone = match[5];
  const offset =
    zone === "Z" || zone === "z"
      ? "Z"
      : zone.includes(":")
        ? zone
        : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${second}${offset}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function workoutType(value: unknown): ShortcutWorkoutType | "other" | "invalid" {
  if (typeof value !== "string") return "invalid";
  const key = value.trim().toLowerCase();
  if (!key) return "invalid";
  if (key === "running") return "Running";
  if (key === "walking") return "Walking";
  return "other";
}

type Quantity = { qty: number; units: string };

function parseQuantity(value: unknown, unitHint: unknown): Quantity | "missing" | "invalid" {
  if (value === undefined || value === null || value === "") return "missing";
  const record = asRecord(value);
  if (record) {
    const qty = numberOrNull(field(record, "qty", "value", "magnitude"));
    const units = cleanUnit(field(record, "units", "unit") ?? unitHint);
    if (qty === null || !units) return "invalid";
    return { qty, units };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "invalid";
    const units = cleanUnit(unitHint);
    if (!units) return "invalid";
    return { qty: value, units };
  }
  if (typeof value === "string") {
    const text = value.trim().replace(/,/g, "");
    if (!text) return "missing";
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*([A-Za-z]+))?$/.exec(text);
    if (!match?.[1]) return "invalid";
    const qty = Number(match[1]);
    const units = cleanUnit(match[2] ?? unitHint);
    if (!Number.isFinite(qty) || !units) return "invalid";
    return { qty, units };
  }
  return "invalid";
}

function durationSeconds(qty: number, units: string): number | null {
  if (SECONDS.has(units)) return qty;
  if (MINUTES.has(units)) return qty * 60;
  return null;
}

function distanceMeters(qty: number, units: string): number | null {
  if (MILES.has(units)) return qty * MILE_METERS;
  if (KILOMETERS.has(units)) return qty * 1000;
  return null;
}

function kcal(qty: number, units: string): number | null {
  return KCAL.has(units) ? qty : null;
}

function optionalAmount(
  parsed: Quantity | "missing" | "invalid",
  convert: (qty: number, units: string) => number | null,
  label: string,
  index: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (parsed === "missing") return { ok: true, value: null };
  if (parsed === "invalid") return { ok: false, error: `Workout ${index} has an invalid ${label}.` };
  if (parsed.qty < 0) return { ok: false, error: `Workout ${index} has an invalid ${label}.` };
  if (parsed.qty === 0) return { ok: true, value: null };
  const value = convert(parsed.qty, parsed.units);
  if (value === null) return { ok: false, error: `Workout ${index} has an unsupported ${label} unit.` };
  return { ok: true, value };
}

function buildRow(entry: Record<string, unknown>, index: number): ShortcutWorkoutResult | "skip" {
  const type = workoutType(field(entry, "type", "activity", "workoutType", "workout_type"));
  if (type === "invalid") return { ok: false, error: `Workout ${index} needs a type.` };
  if (type === "other") return "skip";

  const startRaw = field(entry, "start", "startTime", "startedAt", "start_time", "startDate");
  if (typeof startRaw !== "string" || !startRaw.trim()) {
    return { ok: false, error: `Workout ${index} needs a start time with a timezone offset.` };
  }
  const startTime = parseWorkoutStart(startRaw);
  if (!startTime) {
    return { ok: false, error: `Workout ${index} needs a start time with a timezone offset.` };
  }

  const durationHint =
    field(entry, "durationUnit", "duration_unit", "durationUnits") ??
    (field(entry, "durationSec", "duration_sec") !== undefined ? "s" : undefined) ??
    (field(entry, "durationMin", "duration_min") !== undefined ? "min" : undefined);
  const durationRaw =
    field(entry, "duration", "durationSec", "duration_sec", "durationMin", "duration_min");
  const durationParsed = parseQuantity(durationRaw, durationHint);
  if (durationParsed === "missing" || durationParsed === "invalid" || durationParsed.qty <= 0) {
    return { ok: false, error: `Workout ${index} needs a duration in seconds or minutes.` };
  }
  const durationSec = durationSeconds(durationParsed.qty, durationParsed.units);
  if (durationSec === null) {
    return { ok: false, error: `Workout ${index} needs a duration in seconds or minutes.` };
  }
  if (durationSec > DURATION_MAX_SEC) {
    return { ok: false, error: `Workout ${index} duration is too long.` };
  }

  const distance = optionalAmount(
    parseQuantity(
      field(entry, "distance"),
      field(entry, "distanceUnit", "distance_unit", "distanceUnits"),
    ),
    distanceMeters,
    "distance",
    index,
  );
  if (!distance.ok) return distance;
  const energy = optionalAmount(
    parseQuantity(
      field(entry, "energy", "activeEnergy", "active_energy", "calories"),
      field(entry, "energyUnit", "energy_unit", "energyUnits"),
    ),
    kcal,
    "energy",
    index,
  );
  if (!energy.ok) return energy;

  const sourceRaw = field(entry, "source", "sourceName", "source_name", "sourceApp");
  let sourceName: string | null = null;
  if (sourceRaw !== undefined && sourceRaw !== null && sourceRaw !== "") {
    if (typeof sourceRaw !== "string") {
      return { ok: false, error: `Workout ${index} source must be text.` };
    }
    const trimmed = sourceRaw.trim();
    if (trimmed.length > SOURCE_MAX) {
      return { ok: false, error: `Workout ${index} source is too long.` };
    }
    sourceName = trimmed || null;
  }

  const pace = distance.value === null ? null : paceFrom(durationSec, distance.value);
  return {
    ok: true,
    workouts: [
      {
        startTime,
        type,
        sourceName,
        durationSec: decimalString(durationSec),
        distanceM: distance.value === null ? null : decimalString(distance.value),
        energyKcal: energy.value === null ? null : decimalString(energy.value),
        paceSecPerKm: pace?.perKm ?? null,
        paceSecPerMi: pace?.perMi ?? null,
      },
    ],
  };
}

/** Later non-null fields win. A null field keeps the value already stored in this post. */
export function mergeShortcutWorkout(
  previous: ShortcutWorkoutWrite,
  next: ShortcutWorkoutWrite,
): ShortcutWorkoutWrite {
  const durationSec = Number(next.durationSec);
  const distanceM = next.distanceM ?? previous.distanceM;
  const meters = distanceM === null ? null : Number(distanceM);
  const pace = meters === null ? null : paceFrom(durationSec, meters);
  return {
    startTime: next.startTime,
    type: next.type,
    sourceName: next.sourceName ?? previous.sourceName,
    durationSec: next.durationSec,
    distanceM,
    energyKcal: next.energyKcal ?? previous.energyKcal,
    paceSecPerKm: pace?.perKm ?? null,
    paceSecPerMi: pace?.perMi ?? null,
  };
}

/**
 * Shortcuts `workouts` array. Other activity types are skipped.
 * When `shortcuts` is false the array is ignored so Health Auto Export keeps its parser.
 */
export function readShortcutWorkouts(body: unknown, shortcuts: boolean): ShortcutWorkoutResult {
  const root = asRecord(body);
  if (!root) return { ok: true, workouts: [] };
  const raw = field(root, "workouts");
  if (raw === undefined || !shortcuts) return { ok: true, workouts: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "workouts must be an array." };
  if (raw.length > SHORTCUT_WORKOUT_LIMIT) {
    return { ok: false, error: `At most ${SHORTCUT_WORKOUT_LIMIT} workouts.` };
  }

  const merged = new Map<string, ShortcutWorkoutWrite>();
  for (let index = 0; index < raw.length; index += 1) {
    const entry = asRecord(raw[index]);
    if (!entry) return { ok: false, error: `Workout ${index + 1} must be an object.` };
    const built = buildRow(entry, index + 1);
    if (built === "skip") continue;
    if (!built.ok) return built;
    const row = built.workouts[0];
    if (!row) continue;
    const key = `${row.startTime}|${row.type}`;
    const previous = merged.get(key);
    merged.set(key, previous ? mergeShortcutWorkout(previous, row) : row);
  }
  return { ok: true, workouts: [...merged.values()] };
}

export function shortcutWorkoutsAsWrites(
  rows: readonly ShortcutWorkoutWrite[],
): FitnessWorkoutWrite[] {
  return rows.map((row) => {
    const meters = row.distanceM === null ? null : Number(row.distanceM);
    const miles = meters !== null && meters > 0 ? meters / MILE_METERS : null;
    return {
      source: "shortcuts",
      externalId: `${row.startTime}|${row.type}`,
      name: row.type,
      startedAt: row.startTime,
      endedAt: null,
      durationSec: row.durationSec,
      distanceQty: miles === null ? null : decimalString(miles),
      distanceUnits: miles === null ? null : "mi",
      energyKcal: row.energyKcal,
      heartRateAvg: null,
      heartRateMin: null,
      heartRateMax: null,
      origin: "shortcuts",
      payload: {
        ...(row.sourceName ? { source: row.sourceName } : {}),
        clockKnown: true,
      },
    };
  });
}
