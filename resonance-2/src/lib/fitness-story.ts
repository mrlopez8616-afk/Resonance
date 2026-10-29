import {
  addCivilDays,
  chicagoDay,
  civilMonthLastDay,
  civilWeek,
  formatChicagoClock,
  formatCivilDate,
} from "@/lib/calendar-time";
import { workoutSamples } from "@/lib/fitness-board";
import {
  formatManualQuantity,
  hideManualMoney,
  latestManualPeriod,
  manualPeriodLabel,
  type ManualSummary,
} from "@/lib/fitness-manual";
import type { FitnessMetricWrite, FitnessOrigin, FitnessWorkoutWrite } from "@/lib/fitness-types";

export type StoryRange = "w" | "m" | "y";

export type StoryFigure = {
  id: string;
  label: string;
  value: string;
  meta: string | null;
};

export type StoryPeriod = {
  id: "week" | "month";
  title: string;
  span: string;
  figures: StoryFigure[];
  aside: string | null;
  notes: string[];
};

export type StoryBar = {
  id: string;
  label: string;
  value: number;
  caption: string;
};

export type StoryChart = {
  id: "steps" | "runs";
  title: string;
  href: string;
  range: StoryRange;
  bars: StoryBar[];
  empty: string;
};

export type StoryRun = {
  id: string;
  date: string;
  miles: string;
  pace: string | null;
  source: string;
  approx: boolean;
};

export type StoryLifting = {
  href: string;
  title: string;
  value: string;
  meta: string | null;
};

export type FitnessStory = {
  periods: StoryPeriod[];
  steps: StoryChart;
  runs: StoryChart;
  recent: StoryRun[];
  lifting: StoryLifting;
  manual: { href: string; text: string };
};

const NOT_RECORDED = "not recorded";
const SOURCE_ORDER = ["Apple Health", "Nike Run Club", "Manual import"];

type StepDay = {
  day: string;
  qty: number;
  sources: string[];
  updated: { day: string; at: string | null; clock: boolean }[];
};

type RunSample = ReturnType<typeof workoutSamples>[number];

type ManualKind = "steps" | "miles" | "pace" | "runs" | "other";

type ManualUse = "used" | "aside" | "idle";

type GlanceWindow = {
  id: "week" | "month";
  title: string;
  start: string;
  /** Last day with live rows. Never later than today. */
  end: string;
  /** Last day of the labeled week or month. A summary may land on this day before it arrives. */
  boundEnd: string;
  span: string;
  activeDenom: number;
};

export function parseStoryRange(value: string | string[] | undefined): StoryRange {
  const raw = typeof value === "string" ? value : value?.[0];
  if (raw === "m" || raw === "y" || raw === "w") return raw;
  return "w";
}

function clean(value: string, publicMode: boolean): string {
  const text = publicMode ? hideManualMoney(value) : value;
  return text.replace(/\s+/g, " ").trim();
}

function shortDay(day: string): string {
  return formatCivilDate(day).replace(/ \d{4}$/, "");
}

function spanLabel(start: string, end: string): string {
  if (start === end) return shortDay(start);
  return `${shortDay(start)}–${shortDay(end)}`;
}

function finite(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function originRank(origin: FitnessOrigin): number {
  if (origin === "shortcuts") return 3;
  if (origin === "health-auto-export") return 2;
  return 1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function namedSource(payload: unknown): string {
  const source = asRecord(payload)?.source;
  return typeof source === "string" ? source.trim() : "";
}

/** Plain names only. Shortcut and Health rows read as Apple Health. */
function metricSource(origin: FitnessOrigin, payload: unknown): string {
  if (/nike run club/i.test(namedSource(payload))) return "Nike Run Club";
  if (origin === "shortcuts" || origin === "health-auto-export") return "Apple Health";
  return "Manual import";
}

function runSource(run: RunSample): string {
  if (/nike run club/i.test(run.sourceLabel)) return "Nike Run Club";
  if (run.origin === "shortcuts" || run.origin === "health-auto-export") return "Apple Health";
  return "Manual import";
}

function sortSources(sources: readonly string[]): string[] {
  return [...new Set(sources)].sort((a, b) => {
    const ai = SOURCE_ORDER.indexOf(a);
    const bi = SOURCE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function fromSources(sources: readonly string[]): string | null {
  const unique = sortSources(sources);
  if (unique.length === 0) return null;
  if (unique.length === 1) return `from ${unique[0]}`;
  if (unique.length === 2) return `from ${unique[0]} and ${unique[1]}`;
  return `from ${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
}

function describeUpdated(items: readonly { day: string; at: string | null; clock: boolean }[]): string | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => {
    const ak = a.at ?? a.day;
    const bk = b.at ?? b.day;
    if (ak === bk) return 0;
    return ak < bk ? 1 : -1;
  });
  const top = sorted[0];
  if (!top) return null;
  if (top.clock && top.at) {
    const day = chicagoDay(top.at) || top.day;
    return `updated ${shortDay(day)}, ${formatChicagoClock(top.at)}`;
  }
  return `updated ${formatCivilDate(top.day)}`;
}

function metaLine(parts: readonly (string | null | undefined)[]): string | null {
  const text = parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
  return text.length > 0 ? text : null;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

function formatPaceSeconds(seconds: number): string | null {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, "0")} /mi`;
}

function marked(value: string, approx: boolean): string {
  return approx ? `~${value}` : value;
}

/** A tilde means the whole figure was written down. A mix keeps the number plain and says approx beside the source. */
function tilde(value: string, approx: boolean, sources: readonly string[]): string {
  const names = sortSources(sources);
  if (!approx || names.length === 0 || names.some((name) => name !== "Manual import")) return value;
  return marked(value, true);
}

function daysIn(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addCivilDays(day, 1)) days.push(day);
  return days;
}

function overlaps(start: string, end: string, days: ReadonlySet<string>): boolean {
  for (const day of days) {
    if (day >= start && day <= end) return true;
  }
  return false;
}

function glanceWindows(today: string): { week: GlanceWindow; month: GlanceWindow; lastWeek: GlanceWindow } {
  const weekDays = civilWeek(today);
  const monday = weekDays[0] ?? today;
  const sunday = weekDays[6] ?? today;
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthElapsed = daysIn(monthStart, today).length;
  const lastSunday = addCivilDays(monday, -1);
  const lastMonday = addCivilDays(monday, -7);
  return {
    week: {
      id: "week",
      title: "This week",
      start: monday,
      end: today < sunday ? today : sunday,
      boundEnd: sunday,
      span: spanLabel(monday, sunday),
      activeDenom: 7,
    },
    month: {
      id: "month",
      title: "This month",
      start: monthStart,
      end: today < civilMonthLastDay(today) ? today : civilMonthLastDay(today),
      boundEnd: civilMonthLastDay(today),
      span: spanLabel(monthStart, today),
      activeDenom: monthElapsed,
    },
    lastWeek: {
      id: "week",
      title: "Last week",
      start: lastMonday,
      end: lastSunday,
      boundEnd: lastSunday,
      span: spanLabel(lastMonday, lastSunday),
      activeDenom: 7,
    },
  };
}

function chartStart(range: StoryRange, today: string): string {
  if (range === "w") return civilWeek(today)[0] ?? today;
  if (range === "m") return `${today.slice(0, 7)}-01`;
  return `${today.slice(0, 4)}-01-01`;
}

function isStepUnits(units: string): boolean {
  const normalized = units.trim().toLowerCase();
  return normalized === "" || normalized === "count" || normalized === "steps";
}

function stepDays(rows: readonly FitnessMetricWrite[]): StepDay[] {
  const best = new Map<string, number>();
  for (const row of rows) {
    if (row.metric !== "step_count") continue;
    const qty = finite(row.qty);
    if (qty === null || qty < 0 || !isStepUnits(row.units)) continue;
    const day = row.day.slice(0, 10);
    const rank = originRank(row.origin);
    const current = best.get(day);
    if (current === undefined || rank > current) best.set(day, rank);
  }
  const grouped = new Map<string, StepDay>();
  for (const row of rows) {
    if (row.metric !== "step_count") continue;
    const day = row.day.slice(0, 10);
    if (originRank(row.origin) !== best.get(day)) continue;
    const qty = finite(row.qty);
    if (qty === null || qty < 0 || !isStepUnits(row.units)) continue;
    const existing = grouped.get(day);
    const clock = row.origin !== "manual" && row.recordedAt !== null;
    const stamp = { day, at: row.recordedAt, clock };
    if (!existing) {
      grouped.set(day, { day, qty, sources: [metricSource(row.origin, row.payload)], updated: [stamp] });
      continue;
    }
    existing.qty += qty;
    existing.sources.push(metricSource(row.origin, row.payload));
    existing.updated.push(stamp);
  }
  return [...grouped.values()];
}

function restingDays(rows: readonly FitnessMetricWrite[]): StepDay[] {
  const best = new Map<string, number>();
  for (const row of rows) {
    if (row.metric !== "resting_heart_rate") continue;
    const qty = finite(row.qty);
    if (qty === null || qty <= 0) continue;
    const day = row.day.slice(0, 10);
    const rank = originRank(row.origin);
    const current = best.get(day);
    if (current === undefined || rank > current) best.set(day, rank);
  }
  const grouped = new Map<string, StepDay>();
  for (const row of rows) {
    if (row.metric !== "resting_heart_rate") continue;
    const day = row.day.slice(0, 10);
    if (originRank(row.origin) !== best.get(day)) continue;
    const qty = finite(row.qty);
    if (qty === null || qty <= 0) continue;
    const existing = grouped.get(day);
    const clock = row.origin !== "manual" && row.recordedAt !== null;
    const stamp = { day, at: row.recordedAt, clock };
    if (!existing) {
      grouped.set(day, { day, qty, sources: [metricSource(row.origin, row.payload)], updated: [stamp] });
      continue;
    }
    existing.qty = (existing.qty + qty) / 2;
    existing.sources.push(metricSource(row.origin, row.payload));
    existing.updated.push(stamp);
  }
  return [...grouped.values()];
}

function manualKind(entry: ManualSummary): ManualKind {
  const metric = entry.metric.toLowerCase();
  const unit = entry.unit.toLowerCase();
  if (metric.includes("step") || unit === "steps") return "steps";
  if (metric.includes("pace") || unit.includes("/mi") || unit.includes("min/mi") || unit.includes("sec/mi")) {
    return "pace";
  }
  if (metric === "runs" || metric === "run" || metric.includes("run count")) return "runs";
  if (
    metric.includes("distance") ||
    metric.includes("mile") ||
    unit === "mi" ||
    unit === "mile" ||
    unit === "miles" ||
    unit === "km" ||
    unit === "kilometers"
  ) {
    return "miles";
  }
  return "other";
}

function isAverageWording(entry: ManualSummary): boolean {
  const metric = entry.metric.toLowerCase();
  const unit = entry.unit.toLowerCase();
  return metric.includes("average") || metric.includes("avg") || unit.includes("avg") || unit.includes("/day");
}

function manualNumber(entry: ManualSummary): number | null {
  const parsed = Number(entry.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function manualMiles(entry: ManualSummary): number | null {
  const value = manualNumber(entry);
  if (value === null || value <= 0) return null;
  const unit = entry.unit.trim().toLowerCase();
  if (unit === "km" || unit === "kilometers") return value * 0.621371192;
  if (unit === "mi" || unit === "mile" || unit === "miles") return value;
  return null;
}

function manualPaceSeconds(entry: ManualSummary): number | null {
  const value = manualNumber(entry);
  if (value === null || value <= 0) return null;
  const unit = entry.unit.trim().toLowerCase();
  if (unit.includes("sec")) return value;
  if (unit.includes("min")) return value * 60;
  return null;
}

function contained(entry: ManualSummary, window: GlanceWindow): boolean {
  return entry.periodStart >= window.start && entry.periodStart <= window.end && entry.periodEnd <= window.boundEnd;
}

function asideSentence(sources: readonly string[]): string {
  const unique = sortSources(sources);
  if (unique.length === 1 && unique[0] !== "Manual import") {
    return `${unique[0]} kept. The manual import covers the same days, so it is not added again.`;
  }
  return "The day-by-day record kept. The manual import covers the same days, so it is not added again.";
}

type StepsMerge = {
  average: number | null;
  days: number;
  sources: string[];
  updated: { day: string; at: string | null; clock: boolean }[];
  approx: boolean;
  aside: string | null;
};

function mergeSteps(
  days: readonly StepDay[],
  manuals: readonly ManualSummary[],
  window: GlanceWindow,
  uses: Map<string, ManualUse>,
): StepsMerge {
  const inWindow = days.filter((day) => day.day >= window.start && day.day <= window.end);
  const covered = new Set(inWindow.map((day) => day.day));
  let sum = inWindow.reduce((total, day) => total + day.qty, 0);
  let count = inWindow.length;
  const sources = inWindow.flatMap((day) => day.sources);
  const updated = inWindow.flatMap((day) => day.updated);
  let approx = false;
  const asideSources: string[] = [];
  for (const entry of manuals.filter((item) => manualKind(item) === "steps" && contained(item, window))) {
    const value = manualNumber(entry);
    if (value === null || value < 0) continue;
    if (overlaps(entry.periodStart, entry.periodEnd, covered)) {
      uses.set(entry.id, "aside");
      asideSources.push(...sources);
      continue;
    }
    const periodDays = daysIn(entry.periodStart, entry.periodEnd);
    if (isAverageWording(entry)) {
      if (count > 0) continue;
      sum = value * periodDays.length;
      count = periodDays.length;
    } else {
      sum += value;
      count += periodDays.length;
    }
    for (const day of periodDays) covered.add(day);
    sources.push("Manual import");
    updated.push({ day: entry.periodEnd, at: entry.createdAt, clock: false });
    approx = approx || entry.approx;
    uses.set(entry.id, "used");
  }
  return {
    average: count > 0 ? sum / count : null,
    days: count,
    sources,
    updated,
    approx,
    aside: asideSources.length > 0 ? asideSentence(inWindow.flatMap((day) => day.sources)) : null,
  };
}

type MilesMerge = {
  miles: number | null;
  runs: number | null;
  pace: number | null;
  longest: number | null;
  movingSec: number | null;
  runHr: number | null;
  hrSources: string[];
  hrUpdated: { day: string; at: string | null; clock: boolean }[];
  sources: string[];
  paceSources: string[];
  longestSource: string[];
  updated: { day: string; at: string | null; clock: boolean }[];
  paceUpdated: { day: string; at: string | null; clock: boolean }[];
  approx: boolean;
  runsApprox: boolean;
  paceApprox: boolean;
  longestApprox: boolean;
  aside: string | null;
};

function runStamp(run: RunSample): { day: string; at: string | null; clock: boolean } {
  return { day: run.day, at: run.startedAt, clock: run.clockKnown };
}

function mergeMiles(
  runs: readonly RunSample[],
  manuals: readonly ManualSummary[],
  window: GlanceWindow,
  uses: Map<string, ManualUse>,
): MilesMerge {
  const inWindow = runs.filter((run) => run.kind === "run" && run.day >= window.start && run.day <= window.end);
  const mileDays = new Set(inWindow.filter((run) => run.miles !== null).map((run) => run.day));
  const runDays = new Set(inWindow.map((run) => run.day));
  let miles = inWindow.reduce((total, run) => total + (run.miles ?? 0), 0);
  let milesSeen = inWindow.some((run) => run.miles !== null);
  let runCount = inWindow.length;
  let runsSeen = inWindow.length > 0;
  let duration = 0;
  let durationMiles = 0;
  let durationSeen = false;
  for (const run of inWindow) {
    if (run.miles === null || run.durationSec === null || run.miles <= 0 || run.durationSec <= 0) continue;
    duration += run.durationSec;
    durationMiles += run.miles;
    durationSeen = true;
  }
  const hrRuns = inWindow.filter((run) => run.heartRateAvg !== null && run.heartRateAvg > 0);
  const hrValues = hrRuns.map((run) => run.heartRateAvg as number);
  let longest = inWindow.reduce((best, run) => Math.max(best, run.miles ?? 0), 0);
  let longestSeen = inWindow.some((run) => run.miles !== null && run.miles > 0);
  let longestSource = inWindow
    .filter((run) => run.miles !== null && run.miles === longest)
    .map((run) => runSource(run));
  const sources = inWindow.map((run) => runSource(run));
  const paceSources = inWindow
    .filter((run) => run.miles !== null && run.durationSec !== null)
    .map((run) => runSource(run));
  const updated = inWindow.map(runStamp);
  const paceUpdated = inWindow
    .filter((run) => run.miles !== null && run.durationSec !== null)
    .map(runStamp);
  let approx = false;
  let runsApprox = false;
  let paceApprox = false;
  let longestApprox = false;
  let aside = false;
  let moving = inWindow.reduce((total, run) => total + (run.durationSec ?? 0), 0);
  let movingSeen = inWindow.some((run) => run.durationSec !== null && run.durationSec > 0);

  for (const entry of manuals.filter((item) => contained(item, window))) {
    const kind = manualKind(entry);
    if (kind === "miles") {
      const extra = manualMiles(entry);
      if (extra === null) continue;
      if (overlaps(entry.periodStart, entry.periodEnd, mileDays)) {
        uses.set(entry.id, "aside");
        aside = true;
        continue;
      }
      miles += extra;
      milesSeen = true;
      for (const day of daysIn(entry.periodStart, entry.periodEnd)) mileDays.add(day);
      sources.push("Manual import");
      updated.push({ day: entry.periodEnd, at: entry.createdAt, clock: false });
      approx = approx || entry.approx;
      if (entry.periodStart === entry.periodEnd && extra > longest) {
        longest = extra;
        longestSeen = true;
        longestApprox = entry.approx;
        longestSource = ["Manual import"];
      }
      if (entry.periodStart === entry.periodEnd) {
        runCount += 1;
        runsSeen = true;
        runsApprox = runsApprox || entry.approx;
      }
      uses.set(entry.id, "used");
      continue;
    }
    if (kind === "runs") {
      const extra = manualNumber(entry);
      if (extra === null || extra < 0) continue;
      if (overlaps(entry.periodStart, entry.periodEnd, runDays)) {
        uses.set(entry.id, "aside");
        aside = true;
        continue;
      }
      runCount += extra;
      runsSeen = true;
      runsApprox = runsApprox || entry.approx;
      for (const day of daysIn(entry.periodStart, entry.periodEnd)) runDays.add(day);
      sources.push("Manual import");
      uses.set(entry.id, "used");
      continue;
    }
    if (kind === "pace") {
      const seconds = manualPaceSeconds(entry);
      if (seconds === null) continue;
      if (durationSeen || overlaps(entry.periodStart, entry.periodEnd, runDays)) {
        if (overlaps(entry.periodStart, entry.periodEnd, runDays)) {
          uses.set(entry.id, "aside");
          aside = true;
        }
        continue;
      }
      duration = seconds;
      durationMiles = 1;
      durationSeen = true;
      paceSources.push("Manual import");
      paceUpdated.push({ day: entry.periodEnd, at: entry.createdAt, clock: false });
      paceApprox = entry.approx;
      uses.set(entry.id, "used");
    }
  }

  const keptSources = inWindow.map((run) => runSource(run));
  return {
    miles: milesSeen && miles > 0 ? miles : null,
    runs: runsSeen && runCount > 0 ? runCount : null,
    pace: durationSeen && durationMiles > 0 ? duration / durationMiles : null,
    longest: longestSeen && longest > 0 ? longest : null,
    movingSec: movingSeen && moving > 0 ? moving : null,
    runHr: hrValues.length > 0 ? hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length : null,
    hrSources: hrRuns.map((run) => runSource(run)),
    hrUpdated: hrRuns.map(runStamp),
    sources,
    paceSources,
    longestSource,
    updated,
    paceUpdated,
    approx,
    runsApprox,
    paceApprox,
    longestApprox,
    aside: aside ? asideSentence(keptSources) : null,
  };
}

function activeDays(workouts: readonly RunSample[], manuals: readonly ManualSummary[], window: GlanceWindow): {
  count: number;
  sources: string[];
  updated: { day: string; at: string | null; clock: boolean }[];
} {
  const days = new Set(
    workouts
      .filter((workout) => workout.day >= window.start && workout.day <= window.end)
      .map((workout) => workout.day),
  );
  const sources = workouts
    .filter((workout) => days.has(workout.day))
    .map((workout) => runSource(workout));
  const updated = workouts.filter((workout) => days.has(workout.day)).map(runStamp);
  for (const entry of manuals) {
    if (entry.periodStart !== entry.periodEnd) continue;
    if (entry.periodStart < window.start || entry.periodStart > window.end) continue;
    if (manualKind(entry) === "other" || manualKind(entry) === "steps" || manualKind(entry) === "pace") continue;
    if (days.has(entry.periodStart)) continue;
    days.add(entry.periodStart);
    sources.push("Manual import");
    updated.push({ day: entry.periodStart, at: entry.createdAt, clock: false });
  }
  return { count: days.size, sources, updated };
}

function restingIn(days: readonly StepDay[], window: GlanceWindow): {
  value: number | null;
  sources: string[];
  updated: { day: string; at: string | null; clock: boolean }[];
} {
  const inWindow = days.filter((day) => day.day >= window.start && day.day <= window.end && day.qty > 0);
  if (inWindow.length === 0) return { value: null, sources: [], updated: [] };
  const value = inWindow.reduce((sum, day) => sum + day.qty, 0) / inWindow.length;
  return {
    value: value > 0 ? value : null,
    sources: inWindow.flatMap((day) => day.sources),
    updated: inWindow.flatMap((day) => day.updated),
  };
}

function movingLine(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min on runs`;
  if (hours > 0) return `${hours} hr on runs`;
  return `${Math.max(minutes, 1)} min on runs`;
}

function weekChange(current: number | null, previous: number | null): string | null {
  if (current === null) return null;
  if (previous === null) return "no runs last week";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "same as last week";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function figure(
  id: string,
  label: string,
  value: string,
  meta: string | null,
  publicMode: boolean,
): StoryFigure {
  return {
    id,
    label,
    value: clean(value, publicMode),
    meta: meta ? clean(meta, publicMode) || null : null,
  };
}

function buildPeriod(
  window: GlanceWindow,
  steps: readonly StepDay[],
  resting: readonly StepDay[],
  workouts: readonly RunSample[],
  manuals: readonly ManualSummary[],
  uses: Map<string, ManualUse>,
  publicMode: boolean,
  versus: string | null,
): StoryPeriod {
  const stepMerge = mergeSteps(steps, manuals, window, uses);
  const mileMerge = mergeMiles(workouts, manuals, window, uses);
  const active = activeDays(workouts, manuals, window);
  const heart = restingIn(resting, window);
  const stepMeta = stepMerge.average === null
    ? null
    : metaLine([
        `across ${stepMerge.days} ${stepMerge.days === 1 ? "day" : "days"}`,
        fromSources(stepMerge.sources),
        stepMerge.approx ? "approx" : null,
        describeUpdated(stepMerge.updated),
      ]);
  const runMeta = mileMerge.runs === null
    ? null
    : metaLine([
        fromSources(mileMerge.sources),
        mileMerge.runsApprox ? "approx" : null,
        describeUpdated(mileMerge.updated),
      ]);
  const mileMeta = mileMerge.miles === null
    ? null
    : metaLine([
        fromSources(mileMerge.sources),
        mileMerge.approx ? "approx" : null,
        describeUpdated(mileMerge.updated),
      ]);
  const paceMeta = mileMerge.pace === null
    ? null
    : metaLine([
        fromSources(mileMerge.paceSources),
        mileMerge.paceApprox ? "approx" : null,
        describeUpdated(mileMerge.paceUpdated),
      ]);
  const activeMeta = active.count === 0
    ? null
    : metaLine([fromSources(active.sources), describeUpdated(active.updated)]);
  const longestMeta = mileMerge.longest === null
    ? null
    : metaLine([
        fromSources(mileMerge.longestSource),
        mileMerge.longestApprox ? "approx" : null,
        describeUpdated(mileMerge.updated),
      ]);
  const figures: StoryFigure[] = [
    figure(
      "average-steps",
      "Average steps",
      stepMerge.average === null ? NOT_RECORDED : tilde(formatCount(stepMerge.average), stepMerge.approx, stepMerge.sources),
      stepMeta,
      publicMode,
    ),
    figure(
      "runs",
      "Runs",
      mileMerge.runs === null ? NOT_RECORDED : tilde(formatCount(mileMerge.runs), mileMerge.runsApprox, mileMerge.sources),
      runMeta,
      publicMode,
    ),
    figure(
      "miles",
      "Miles",
      mileMerge.miles === null ? NOT_RECORDED : tilde(formatMiles(mileMerge.miles), mileMerge.approx, mileMerge.sources),
      mileMeta,
      publicMode,
    ),
    figure(
      "pace",
      "Average pace",
      mileMerge.pace === null
        ? NOT_RECORDED
        : tilde(formatPaceSeconds(mileMerge.pace) ?? NOT_RECORDED, mileMerge.paceApprox, mileMerge.paceSources),
      paceMeta,
      publicMode,
    ),
    figure(
      "active-days",
      "Active days",
      `${formatCount(active.count)}/${formatCount(window.activeDenom)}`,
      activeMeta,
      publicMode,
    ),
    figure(
      "longest-run",
      "Longest run",
      mileMerge.longest === null
        ? NOT_RECORDED
        : tilde(formatMiles(mileMerge.longest), mileMerge.longestApprox, mileMerge.longestSource),
      longestMeta,
      publicMode,
    ),
  ];
  if (versus !== null || window.id === "week") {
    figures.push(
      figure(
        "versus-last-week",
        "Versus last week",
        versus ?? NOT_RECORDED,
        versus ? mileMeta : null,
        publicMode,
      ),
    );
  }
  const notes: string[] = [];
  if (!publicMode && heart.value !== null) {
    notes.push(
      clean(
        metaLine([
          `Resting heart ${formatCount(heart.value)} bpm`,
          fromSources(heart.sources),
          describeUpdated(heart.updated),
        ]) ?? "",
        publicMode,
      ),
    );
  }
  if (!publicMode && mileMerge.runHr !== null && mileMerge.runHr > 0) {
    notes.push(
      clean(
        metaLine([
          `Average heart on runs ${formatCount(mileMerge.runHr)} bpm`,
          fromSources(mileMerge.hrSources),
          describeUpdated(mileMerge.hrUpdated),
        ]) ?? "",
        publicMode,
      ),
    );
  }
  if (mileMerge.movingSec !== null) notes.push(clean(movingLine(mileMerge.movingSec), publicMode));
  const asideParts = [...new Set([stepMerge.aside, mileMerge.aside].filter((line): line is string => Boolean(line)))];
  return {
    id: window.id,
    title: window.title,
    span: window.span,
    figures,
    aside: asideParts.length > 0 ? clean(asideParts.join(" "), publicMode) : null,
    notes: notes.filter((note) => note.length > 0),
  };
}

function stepBars(days: readonly StepDay[], range: StoryRange, today: string): StoryBar[] {
  const start = chartStart(range, today);
  return days
    .filter((day) => day.day >= start && day.day <= today)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((day) => ({
      id: day.day,
      label: shortDay(day.day),
      value: day.qty,
      caption: `${formatCount(day.qty)} steps`,
    }));
}

function runBars(runs: readonly RunSample[], range: StoryRange, today: string): StoryBar[] {
  const start = chartStart(range, today);
  const byDay = new Map<string, number>();
  for (const run of runs) {
    if (run.kind !== "run" || run.miles === null || run.day < start || run.day > today) continue;
    byDay.set(run.day, (byDay.get(run.day) ?? 0) + run.miles);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, miles]) => ({
      id: day,
      label: shortDay(day),
      value: miles,
      caption: formatMiles(miles),
    }));
}

function recentRuns(runs: readonly RunSample[], manuals: readonly ManualSummary[], today: string): StoryRun[] {
  const listed: (StoryRun & { day: string })[] = runs
    .filter((run) => run.kind === "run" && run.day <= today)
    .map((run) => {
      const pace = run.miles !== null && run.durationSec !== null ? formatPaceSeconds(run.durationSec / run.miles) : null;
      return {
        id: run.id,
        day: run.day,
        date: formatCivilDate(run.day),
        miles: run.miles === null ? run.name : formatMiles(run.miles),
        pace,
        source: runSource(run),
        approx: false,
      };
    });
  const taken = new Set(runs.filter((run) => run.kind === "run").map((run) => run.day));
  for (const entry of manuals) {
    if (entry.periodStart !== entry.periodEnd || entry.periodStart > today) continue;
    if (manualKind(entry) !== "miles" || taken.has(entry.periodStart)) continue;
    const miles = manualMiles(entry);
    if (miles === null) continue;
    const paceEntry = manuals.find(
      (item) =>
        manualKind(item) === "pace" &&
        item.periodStart === entry.periodStart &&
        item.periodEnd === entry.periodEnd,
    );
    const paceSeconds = paceEntry ? manualPaceSeconds(paceEntry) : null;
    listed.push({
      id: `manual:${entry.id}`,
      day: entry.periodStart,
      date: formatCivilDate(entry.periodStart),
      miles: formatMiles(miles),
      pace: paceSeconds === null ? null : formatPaceSeconds(paceSeconds),
      source: "Manual import",
      approx: entry.approx || Boolean(paceEntry?.approx),
    });
    taken.add(entry.periodStart);
  }
  return listed
    .sort((a, b) => (a.day === b.day ? (a.id < b.id ? -1 : 1) : a.day < b.day ? 1 : -1))
    .slice(0, 12)
    .map(({ day: _day, ...run }) => ({
      ...run,
      miles: run.approx ? `~${run.miles}` : run.miles,
      source: run.approx ? `${run.source} · approx` : run.source,
    }));
}

function liftingBlock(workouts: readonly RunSample[], today: string, publicMode: boolean): StoryLifting {
  const lifts = workouts.filter((workout) => workout.kind === "strength" && workout.day <= today);
  if (lifts.length === 0) {
    return {
      href: "/n/fitness/lifting",
      title: "Lifting",
      value: "not connected yet",
      meta: clean("No lifting feed yet.", publicMode),
    };
  }
  const week = new Set(civilWeek(today));
  const thisWeek = lifts.filter((lift) => week.has(lift.day));
  const last = (thisWeek[0] ?? lifts[0])!;
  const value = thisWeek.length > 0 ? `${formatCount(thisWeek.length)} this week` : last.name;
  return {
    href: "/n/fitness/lifting",
    title: "Lifting",
    value: clean(value, publicMode),
    meta: clean(
      metaLine([last.name, shortDay(last.day), fromSources([runSource(last)]), describeUpdated([runStamp(last)])]) ?? "",
      publicMode,
    ),
  };
}

function manualText(
  manuals: readonly ManualSummary[],
  uses: Map<string, ManualUse>,
  publicMode: boolean,
): string {
  if (manuals.length === 0) return NOT_RECORDED;
  const latest = latestManualPeriod(manuals);
  const pending = latest.filter((entry) => uses.get(entry.id) !== "used" && uses.get(entry.id) !== "aside");
  if (pending.length === 0) return "";
  return pending
    .map((entry) => {
      const unit = clean(entry.unit, publicMode);
      const quantity = unit ? `${formatManualQuantity(entry.value)} ${unit}` : formatManualQuantity(entry.value);
      const app = clean(entry.app, publicMode);
      return [marked(quantity, entry.approx), app, manualPeriodLabel(entry.periodStart, entry.periodEnd), "Manual import", entry.approx ? "approx" : null]
        .filter((part): part is string => Boolean(part && part.length > 0))
        .join(" · ");
    })
    .join("; ");
}

function scrubStory(story: FitnessStory, publicMode: boolean): FitnessStory {
  if (!publicMode) return story;
  const text = (value: string) => clean(value, true);
  return {
    ...story,
    periods: story.periods.map((period) => ({
      ...period,
      aside: period.aside ? text(period.aside) : null,
      notes: period.notes.filter((note) => !/\bbpm\b/i.test(note)).map(text),
      figures: period.figures.map((item) => ({
        ...item,
        value: text(item.value),
        meta: item.meta ? text(item.meta) || null : null,
      })),
    })),
    recent: story.recent.map((run) => ({ ...run, miles: text(run.miles), source: text(run.source), pace: run.pace ? text(run.pace) : null })),
    lifting: { ...story.lifting, value: text(story.lifting.value), meta: story.lifting.meta ? text(story.lifting.meta) : null },
    manual: { ...story.manual, text: text(story.manual.text) },
  };
}

export function buildFitnessStory(input: {
  metrics: readonly FitnessMetricWrite[];
  workouts: readonly FitnessWorkoutWrite[];
  manuals: readonly ManualSummary[];
  today: string;
  publicMode?: boolean;
  stepsRange?: StoryRange;
  runsRange?: StoryRange;
}): FitnessStory {
  const publicMode = input.publicMode === true;
  const today = input.today;
  const steps = stepDays(input.metrics);
  const resting = restingDays(input.metrics);
  const workouts = workoutSamples(input.workouts);
  const windows = glanceWindows(today);
  const uses = new Map<string, ManualUse>();
  const lastWeekMiles = mergeMiles(workouts, input.manuals, windows.lastWeek, new Map()).miles;
  const thisWeekMiles = mergeMiles(workouts, input.manuals, windows.week, new Map()).miles;
  const week = buildPeriod(
    windows.week,
    steps,
    resting,
    workouts,
    input.manuals,
    uses,
    publicMode,
    weekChange(thisWeekMiles, lastWeekMiles),
  );
  const month = buildPeriod(windows.month, steps, resting, workouts, input.manuals, uses, publicMode, null);
  const stepsRange = input.stepsRange ?? "w";
  const runsRange = input.runsRange ?? "w";
  const story: FitnessStory = {
    periods: [week, month],
    steps: {
      id: "steps",
      title: "Steps",
      href: "/n/fitness/steps",
      range: stepsRange,
      bars: stepBars(steps, stepsRange, today),
      empty: NOT_RECORDED,
    },
    runs: {
      id: "runs",
      title: "Runs",
      href: "/n/fitness/runs",
      range: runsRange,
      bars: runBars(workouts, runsRange, today),
      empty: NOT_RECORDED,
    },
    recent: recentRuns(workouts, input.manuals, today).map((run) => ({
      ...run,
      date: clean(run.date, publicMode),
      miles: clean(run.miles, publicMode),
      pace: run.pace ? clean(run.pace, publicMode) : null,
      source: clean(run.source, publicMode),
    })),
    lifting: liftingBlock(workouts, today, publicMode),
    manual: {
      href: "/n/fitness/manual",
      text: clean(manualText(input.manuals, uses, publicMode), publicMode),
    },
  };
  return scrubStory(story, publicMode);
}
