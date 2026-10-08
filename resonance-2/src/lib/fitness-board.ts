import { addCivilDays, chicagoDay, civilWeek, formatCivilDate } from "@/lib/calendar-time";
import { energyKcal } from "@/lib/fitness-parse";
import type { FitnessMetricWrite, FitnessOrigin, FitnessWorkoutWrite } from "@/lib/fitness-types";

export const FITNESS_EMPTY = "Data appears once the phone sync runs.";

export const FITNESS_NODES = [
  { id: "activity", title: "Activity" },
  { id: "runs", title: "Runs" },
  { id: "lifting", title: "Lifting" },
  { id: "heart", title: "Heart" },
] as const;

export type FitnessNodeId = (typeof FITNESS_NODES)[number]["id"];

export type FitnessHomeLine = {
  value: string;
  unit: string;
};

export type FitnessCard = {
  id: FitnessNodeId;
  title: string;
  href: string;
  headline: string | null;
  detail: string | null;
};

export type FitnessRow = {
  id: string;
  primary: string;
  secondary: string | null;
};

export type FitnessNodeDetail = {
  id: FitnessNodeId;
  title: string;
  headline: string | null;
  detail: string | null;
  rows: FitnessRow[];
};

type MetricSample = {
  metric: string;
  day: string;
  qty: number;
  units: string;
  origin: FitnessOrigin;
};

type WorkoutKind = "run" | "strength" | "other";

type WorkoutSample = {
  id: string;
  name: string;
  kind: WorkoutKind;
  day: string;
  startedAt: string;
  durationSec: number | null;
  miles: number | null;
  energyKcal: number | null;
  heartRateAvg: number | null;
  origin: FitnessOrigin;
  sourceLabel: string;
  clockKnown: boolean;
};

export function workoutKind(name: string): WorkoutKind {
  const value = name.trim().toLowerCase();
  if (value.includes("run")) return "run";
  if (
    value.includes("strength") ||
    value.includes("weight") ||
    value.includes("lifting") ||
    value.includes("weightlifting")
  ) {
    return "strength";
  }
  return "other";
}

function finite(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function milesFrom(qty: number, units: string): number | null {
  const normalized = units.trim().toLowerCase();
  if (normalized === "mi" || normalized === "mile" || normalized === "miles") return qty;
  if (normalized === "km" || normalized === "kilometer" || normalized === "kilometers") {
    return qty * 0.621371192;
  }
  if (normalized === "m" || normalized === "meter" || normalized === "meters") {
    return qty * 0.000621371192;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function preferLive<T extends { origin: FitnessOrigin }>(rows: T[], group: (row: T) => string): T[] {
  const live = new Set(rows.filter((row) => row.origin !== "manual").map(group));
  return rows.filter((row) => row.origin !== "manual" || !live.has(group(row)));
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(durationSec: number): string {
  const rounded = Math.round(durationSec);
  if (rounded % 60 === 0) return `${rounded / 60} min`;
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(miles: number, durationSec: number): string | null {
  if (!(miles > 0) || !(durationSec > 0)) return null;
  const total = Math.round(durationSec / miles);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function shortDay(day: string): string {
  return formatCivilDate(day).replace(/ \d{4}$/, "");
}

function sourceLabel(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  const source = record?.source;
  if (typeof source === "string" && source.trim()) return source.trim();
  return fallback === "manual" ? "Manual" : fallback;
}

function clockKnown(payload: unknown, origin: FitnessOrigin): boolean {
  const record = asRecord(payload);
  if (record?.clockKnown === false) return false;
  return origin !== "manual";
}

export function metricSamples(rows: readonly FitnessMetricWrite[]): MetricSample[] {
  const parsed: MetricSample[] = [];
  for (const row of rows) {
    const qty = finite(row.qty);
    if (qty === null) continue;
    parsed.push({
      metric: row.metric,
      day: row.day.slice(0, 10),
      qty,
      units: row.units,
      origin: row.origin,
    });
  }
  return preferLive(parsed, (row) => `${row.metric}:${row.day}`);
}

export function workoutSamples(rows: readonly FitnessWorkoutWrite[]): WorkoutSample[] {
  const parsed: WorkoutSample[] = [];
  for (const row of rows) {
    const day = chicagoDay(row.startedAt);
    if (!day) continue;
    const distance = finite(row.distanceQty);
    const kind = workoutKind(row.name);
    parsed.push({
      id: `${row.source}:${row.externalId}`,
      name: row.name,
      kind,
      day,
      startedAt: row.startedAt,
      durationSec: finite(row.durationSec),
      miles: distance === null || !row.distanceUnits ? null : milesFrom(distance, row.distanceUnits),
      energyKcal: finite(row.energyKcal),
      heartRateAvg: finite(row.heartRateAvg),
      origin: row.origin,
      sourceLabel: sourceLabel(row.payload, row.source),
      clockKnown: clockKnown(row.payload, row.origin),
    });
  }
  return preferLive(parsed, (row) => `${row.kind}:${row.day}`).sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.clockKnown && b.clockKnown && a.startedAt !== b.startedAt) {
      return a.startedAt < b.startedAt ? 1 : -1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

function sumMetric(
  metrics: readonly MetricSample[],
  name: string,
  day: string,
  convert: (qty: number, units: string) => number | null,
): number | null {
  let total = 0;
  let seen = false;
  for (const metric of metrics) {
    if (metric.metric !== name || metric.day !== day) continue;
    const value = convert(metric.qty, metric.units);
    if (value === null) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

function stepsOn(metrics: readonly MetricSample[], day: string): number | null {
  return sumMetric(metrics, "step_count", day, (qty, units) => {
    const normalized = units.trim().toLowerCase();
    return normalized === "" || normalized === "count" || normalized === "steps" ? qty : null;
  });
}

function energyOn(metrics: readonly MetricSample[], day: string): number | null {
  return sumMetric(metrics, "active_energy", day, (qty, units) => energyKcal(qty, units));
}

function distanceOn(metrics: readonly MetricSample[], day: string): number | null {
  return sumMetric(metrics, "walking_running_distance", day, milesFrom);
}

function latestDay(days: readonly string[], today: string): string | null {
  const eligible = days.filter((day) => day <= today).sort();
  return eligible.at(-1) ?? null;
}

function daysWith(metrics: readonly MetricSample[], name: string, today: string): string[] {
  return [...new Set(metrics.filter((metric) => metric.metric === name && metric.day <= today).map((metric) => metric.day))];
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type ActivityFacts = {
  headline: string | null;
  detail: string | null;
  todaySteps: number | null;
  latest: { day: string; steps: number } | null;
};

function activityFacts(metrics: readonly MetricSample[], today: string): ActivityFacts {
  const todaySteps = stepsOn(metrics, today);
  const latestDayValue = latestDay(daysWith(metrics, "step_count", today), today);
  const latestSteps = latestDayValue ? stepsOn(metrics, latestDayValue) : null;
  const windowStart = addCivilDays(today, -6);
  const windowDays = daysWith(metrics, "step_count", today).filter((day) => day >= windowStart);
  const avg = average(
    windowDays
      .map((day) => stepsOn(metrics, day))
      .filter((value): value is number => value !== null),
  );
  const avgLabel = avg === null ? null : `7-day avg ${formatCount(avg)}`;
  if (todaySteps !== null) {
    return {
      headline: formatCount(todaySteps),
      detail: avgLabel,
      todaySteps,
      latest: { day: today, steps: todaySteps },
    };
  }
  if (latestDayValue && latestSteps !== null) {
    return {
      headline: formatCount(latestSteps),
      detail: [shortDay(latestDayValue), avgLabel].filter(Boolean).join(" · "),
      todaySteps: null,
      latest: { day: latestDayValue, steps: latestSteps },
    };
  }
  return { headline: null, detail: FITNESS_EMPTY, todaySteps: null, latest: null };
}

function weekMiles(workouts: readonly WorkoutSample[], today: string): { miles: number; runs: WorkoutSample[] } {
  const week = new Set(civilWeek(today));
  const runs = workouts.filter((workout) => workout.kind === "run" && week.has(workout.day));
  const miles = runs.reduce((sum, run) => sum + (run.miles ?? 0), 0);
  return { miles, runs };
}

function runBrief(run: WorkoutSample): string {
  const parts = [run.miles === null ? run.name : formatMiles(run.miles)];
  if (run.durationSec !== null) parts.push(formatDuration(run.durationSec));
  return parts.join(" · ");
}

function runsFacts(workouts: readonly WorkoutSample[], today: string): { headline: string | null; detail: string | null } {
  const week = weekMiles(workouts, today);
  if (week.runs.length > 0) {
    const timed = week.runs
      .filter((run) => run.clockKnown)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    const last = timed[0];
    const detail = last
      ? `last ${runBrief(last)}`
      : [...week.runs].sort((a, b) => (a.id < b.id ? -1 : 1)).map(runBrief).join(", ");
    return {
      headline: week.miles > 0 ? formatMiles(week.miles) : `${week.runs.length}`,
      detail,
    };
  }
  const older = workouts.filter((workout) => workout.kind === "run" && workout.day <= today);
  const last = older[0];
  if (!last) return { headline: null, detail: FITNESS_EMPTY };
  return {
    headline: last.miles === null ? last.name : formatMiles(last.miles),
    detail: `last run · ${shortDay(last.day)}`,
  };
}

function liftingFacts(workouts: readonly WorkoutSample[], today: string): { headline: string | null; detail: string | null } {
  const week = new Set(civilWeek(today));
  const lifts = workouts.filter((workout) => workout.kind === "strength" && workout.day <= today);
  const thisWeek = lifts.filter((lift) => week.has(lift.day));
  if (thisWeek.length > 0) {
    const last = thisWeek[0]!;
    return {
      headline: String(thisWeek.length),
      detail: `${last.name} · ${shortDay(last.day)}`,
    };
  }
  const last = lifts[0];
  if (!last) return { headline: null, detail: FITNESS_EMPTY };
  return { headline: last.name, detail: `last · ${shortDay(last.day)}` };
}

function heartOn(metrics: readonly MetricSample[], name: string, day: string): number | null {
  const values = metrics
    .filter((metric) => metric.metric === name && metric.day === day)
    .map((metric) => metric.qty);
  return average(values);
}

function heartFacts(metrics: readonly MetricSample[], today: string): { headline: string | null; detail: string | null } {
  const restingDays = daysWith(metrics, "resting_heart_rate", today);
  const rateDays = daysWith(metrics, "heart_rate", today);
  const restingDay = restingDays.includes(today) ? today : latestDay(restingDays, today);
  if (restingDay) {
    const qty = heartOn(metrics, "resting_heart_rate", restingDay);
    if (qty !== null) {
      return {
        headline: formatCount(qty),
        detail: restingDay === today ? "resting" : `resting · ${shortDay(restingDay)}`,
      };
    }
  }
  const rateDay = rateDays.includes(today) ? today : latestDay(rateDays, today);
  if (rateDay) {
    const qty = heartOn(metrics, "heart_rate", rateDay);
    if (qty !== null) {
      return {
        headline: formatCount(qty),
        detail: rateDay === today ? "avg" : `avg · ${shortDay(rateDay)}`,
      };
    }
  }
  return { headline: null, detail: FITNESS_EMPTY };
}

export type FitnessWeekFacts = {
  /** Step count summed across this civil week, through today. Null when no sample exists. */
  steps: number | null;
  /** Active-energy kilocalories summed the same way. Workout calories are a different series. */
  activeKcal: number | null;
  /** Mean resting heart rate on the days this week that have a sample. */
  restingHr: number | null;
  /** Run miles this civil week. Null when the week has none. */
  miles: number | null;
};

export const EMPTY_FITNESS_WEEK: FitnessWeekFacts = {
  steps: null,
  activeKcal: null,
  restingHr: null,
  miles: null,
};

/** This civil week, through today. Missing series stay null. Nothing is filled in. */
export function fitnessWeekFacts(
  metrics: readonly MetricSample[],
  workouts: readonly WorkoutSample[],
  today: string,
): FitnessWeekFacts {
  const days = civilWeek(today).filter((day) => day <= today);
  let steps = 0;
  let stepsSeen = false;
  let activeKcal = 0;
  let energySeen = false;
  const resting: number[] = [];
  for (const day of days) {
    const daySteps = stepsOn(metrics, day);
    if (daySteps !== null) {
      steps += daySteps;
      stepsSeen = true;
    }
    const dayEnergy = energyOn(metrics, day);
    if (dayEnergy !== null) {
      activeKcal += dayEnergy;
      energySeen = true;
    }
    const dayResting = heartOn(metrics, "resting_heart_rate", day);
    if (dayResting !== null) resting.push(dayResting);
  }
  const miles = weekMiles(workouts, today).miles;
  const restingHr = average(resting);
  return {
    steps: stepsSeen ? steps : null,
    activeKcal: energySeen ? activeKcal : null,
    restingHr,
    miles: miles > 0 ? miles : null,
  };
}

export function fitnessHomeLine(
  metrics: readonly MetricSample[],
  workouts: readonly WorkoutSample[],
  today: string,
): FitnessHomeLine | null {
  const activity = activityFacts(metrics, today);
  if (activity.todaySteps !== null) {
    return { value: formatCount(activity.todaySteps), unit: "steps" };
  }
  const week = weekMiles(workouts, today);
  if (week.miles > 0) return { value: week.miles.toFixed(1), unit: "mi this week" };
  if (activity.latest) {
    return { value: formatCount(activity.latest.steps), unit: `steps · ${shortDay(activity.latest.day)}` };
  }
  return null;
}

export function fitnessCards(
  metrics: readonly MetricSample[],
  workouts: readonly WorkoutSample[],
  today: string,
): FitnessCard[] {
  const facts = {
    activity: activityFacts(metrics, today),
    runs: runsFacts(workouts, today),
    lifting: liftingFacts(workouts, today),
    heart: heartFacts(metrics, today),
  };
  return FITNESS_NODES.map((node) => ({
    id: node.id,
    title: node.title,
    href: `/n/fitness/${node.id}`,
    headline: facts[node.id].headline,
    detail: facts[node.id].detail,
  }));
}

function originLabel(origin: FitnessOrigin): string | null {
  return origin === "manual" ? "manual" : null;
}

function activityRows(metrics: readonly MetricSample[], today: string): FitnessRow[] {
  const days = [
    ...new Set(
      metrics
        .filter(
          (metric) =>
            metric.day <= today &&
            (metric.metric === "step_count" ||
              metric.metric === "active_energy" ||
              metric.metric === "walking_running_distance"),
        )
        .map((metric) => metric.day),
    ),
  ].sort((a, b) => (a < b ? 1 : -1));
  return days.map((day) => {
    const steps = stepsOn(metrics, day);
    const energy = energyOn(metrics, day);
    const distance = distanceOn(metrics, day);
    const manual = metrics.some(
      (metric) => metric.day === day && metric.metric === "step_count" && metric.origin === "manual",
    );
    const secondary = [
      formatCivilDate(day),
      energy === null ? null : `${formatCount(energy)} kcal`,
      distance === null ? null : formatMiles(distance),
      manual ? "manual" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: day,
      primary: steps === null ? formatCivilDate(day) : `${formatCount(steps)} steps`,
      secondary: secondary || null,
    };
  });
}

function workoutSecondary(workout: WorkoutSample): string {
  const pace =
    workout.miles !== null && workout.durationSec !== null
      ? formatPace(workout.miles, workout.durationSec)
      : null;
  return [
    formatCivilDate(workout.day),
    pace,
    workout.heartRateAvg === null ? null : `${formatCount(workout.heartRateAvg)} bpm`,
    workout.energyKcal === null ? null : `${formatCount(workout.energyKcal)} kcal`,
    workout.sourceLabel,
    originLabel(workout.origin),
  ]
    .filter(Boolean)
    .join(" · ");
}

function runRows(workouts: readonly WorkoutSample[], today: string): FitnessRow[] {
  return workouts
    .filter((workout) => workout.kind === "run" && workout.day <= today)
    .map((workout) => ({
      id: workout.id,
      primary: [
        workout.miles === null ? workout.name : formatMiles(workout.miles),
        workout.durationSec === null ? null : formatDuration(workout.durationSec),
      ]
        .filter(Boolean)
        .join(" · "),
      secondary: workoutSecondary(workout),
    }));
}

function liftRows(workouts: readonly WorkoutSample[], today: string): FitnessRow[] {
  return workouts
    .filter((workout) => workout.kind === "strength" && workout.day <= today)
    .map((workout) => ({
      id: workout.id,
      primary: [workout.name, workout.durationSec === null ? null : formatDuration(workout.durationSec)]
        .filter(Boolean)
        .join(" · "),
      secondary: workoutSecondary(workout),
    }));
}

function heartRows(metrics: readonly MetricSample[], today: string): FitnessRow[] {
  const days = [
    ...new Set(
      metrics
        .filter(
          (metric) =>
            metric.day <= today &&
            (metric.metric === "resting_heart_rate" || metric.metric === "heart_rate"),
        )
        .map((metric) => metric.day),
    ),
  ].sort((a, b) => (a < b ? 1 : -1));
  return days.flatMap((day) => {
    const resting = heartOn(metrics, "resting_heart_rate", day);
    const avg = heartOn(metrics, "heart_rate", day);
    if (resting === null && avg === null) return [];
    const primary = resting !== null ? `${formatCount(resting)} bpm` : `${formatCount(avg!)} bpm`;
    const secondary = [
      formatCivilDate(day),
      resting !== null ? "resting" : null,
      avg !== null ? `${formatCount(avg)} avg` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return [{ id: day, primary, secondary }];
  });
}

export function fitnessNode(
  id: string,
  metrics: readonly MetricSample[],
  workouts: readonly WorkoutSample[],
  today: string,
): FitnessNodeDetail | null {
  const node = FITNESS_NODES.find((item) => item.id === id);
  if (!node) return null;
  const cards = fitnessCards(metrics, workouts, today);
  const card = cards.find((item) => item.id === node.id);
  const rows =
    node.id === "activity"
      ? activityRows(metrics, today)
      : node.id === "runs"
        ? runRows(workouts, today)
        : node.id === "lifting"
          ? liftRows(workouts, today)
          : heartRows(metrics, today);
  return {
    id: node.id,
    title: node.title,
    headline: card?.headline ?? null,
    detail: card?.detail ?? null,
    rows,
  };
}

export function isFitnessNode(id: string): id is FitnessNodeId {
  return FITNESS_NODES.some((node) => node.id === id);
}
