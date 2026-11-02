import {
  addCivilDays,
  adjacentMonth,
  civilMonthLastDay,
  civilWeek,
  civilWeekdayShort,
  formatCivilDate,
  formatCivilMonth,
} from "@/lib/calendar-time";
import { metricSamples, workoutSamples } from "@/lib/fitness-board";
import type { FitnessMetricWrite, FitnessWorkoutWrite } from "@/lib/fitness-types";

/**
 * Days at or above this count build the step streak and the consistency score.
 * Change this constant to move the goal. The pages read it from here.
 */
export const STEP_GOAL = 8000;

/** Five kilometers in miles. A 5K mark needs a run at least this far. */
const FIVE_K_MILES = 5 / 1.609344;

export type StepSpan = "d" | "w" | "m" | "6m" | "y";

export type StepBarModel = {
  id: string;
  label: string;
  value: number;
  caption: string;
};

export type HistoryLine = {
  id: string;
  value: string;
  href?: string;
};

export type HistoryDay = {
  id: string;
  label: string;
  value: string;
  href?: string;
  lines?: HistoryLine[];
};

export type HistoryWeek = {
  id: string;
  label: string;
  summary: string;
  days: HistoryDay[];
};

export type HistoryMonth = {
  id: string;
  label: string;
  summary: string;
  weeks: HistoryWeek[];
};

export type HistoryYear = {
  id: string;
  label: string;
  summary: string;
  months: HistoryMonth[];
};

/**
 * Weeks of the current month stay open as rows.
 * Earlier months of this year collapse to a month.
 * Earlier years collapse to a year, then months, then weeks.
 */
export type ActivityHistory = {
  monthLabel: string | null;
  weeks: HistoryWeek[];
  months: HistoryMonth[];
  years: HistoryYear[];
};

export type StepsView = {
  span: StepSpan;
  average: string | null;
  averageLabel: string;
  trend: string | null;
  trendTone: "" | "up" | "down" | "flat";
  hourlyNote: string | null;
  bars: StepBarModel[];
  highlights: { id: string; text: string }[];
  records: PrModel[];
  history: ActivityHistory;
  days: { id: string; label: string; steps: string }[];
  empty: string | null;
};

export type RunCardModel = {
  id: string;
  href: string;
  date: string;
  distance: string;
  duration: string;
  pace: string;
  energy: string | null;
  /** Present only for the signed-in private view. Public view omits the field. */
  avgHeart?: string;
};

export type MonthTotalModel = {
  id: string;
  label: string;
  runs: string;
  miles: string;
  time: string;
  pace: string;
};

export type PrModel = {
  id: string;
  label: string;
  value: string;
  when: string;
};

export type RunsView = {
  span: StepSpan;
  average: string | null;
  averageLabel: string;
  trend: string | null;
  trendTone: "" | "up" | "down" | "flat";
  hourlyNote: string | null;
  bars: StepBarModel[];
  rangeEmpty: string | null;
  cards: RunCardModel[];
  months: MonthTotalModel[];
  prs: PrModel[];
  prNote: string | null;
  history: ActivityHistory;
  empty: string | null;
};

export type SplitModel = {
  id: string;
  label: string;
  distance: string;
  pace: string;
};

export type RunDetailView = {
  id: string;
  date: string;
  distance: string;
  duration: string;
  pace: string;
  energy: string | null;
  splits: SplitModel[];
  splitsNote: string | null;
  avgHeart?: string;
  maxHeart?: string;
};

/**
 * One analytics card. Add a builder to `ANALYTICS_BUILDERS` to grow the section.
 * `heart` cards are omitted entirely in Public view.
 */
export type AnalyticsMetric = {
  id: string;
  title: string;
  value: string;
  detail: string | null;
  how: string;
  bars: StepBarModel[];
};

type RunFact = {
  id: string;
  day: string;
  startedAt: string;
  miles: number | null;
  durationSec: number | null;
  energyKcal: number | null;
  heartAvg: number | null;
  heartMax: number | null;
  splits: { miles: number; durationSec: number }[];
};

type AnalyticsContext = {
  steps: Map<string, number>;
  resting: Map<string, number>;
  runs: RunFact[];
  today: string;
};

const NOT_RECORDED = "not recorded";
const NOT_CONNECTED = "Not connected yet";

export type FitnessTab = "steps" | "runs";

export function parseStepSpan(value: string | string[] | undefined): StepSpan {
  const raw = typeof value === "string" ? value : value?.[0];
  if (raw === "d" || raw === "w" || raw === "m" || raw === "6m" || raw === "y") return raw;
  return "w";
}

export function parseFitnessTab(value: string | string[] | undefined): FitnessTab {
  const raw = typeof value === "string" ? value : value?.[0];
  return raw === "runs" ? "runs" : "steps";
}

/** Steps is the fitness page. Runs is the same page with `tab=runs`. */
export function fitnessTabHref(tab: FitnessTab, span?: StepSpan): string {
  const params = new URLSearchParams();
  if (tab === "runs") params.set("tab", "runs");
  if (span && span !== "w") params.set("span", span);
  const text = params.toString();
  return text ? `/n/fitness?${text}` : "/n/fitness";
}

export function fitnessRangeHref(base: string, span: StepSpan): string {
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("span", span);
  return `${path}?${params.toString()}`;
}

/** True when text carries a heart-rate field or a bpm reading. */
export function textHasHeartRate(text: string): boolean {
  return /\bbpm\b/i.test(text) || /heart[_ -]?rate/i.test(text) || /resting_heart/i.test(text);
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

function formatPace(miles: number, durationSec: number): string | null {
  if (!(miles > 0) || !(durationSec > 0)) return null;
  const total = Math.round(durationSec / miles);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function formatClock(durationSec: number): string {
  const rounded = Math.max(0, Math.round(durationSec));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function shortDay(day: string): string {
  return formatCivilDate(day).replace(/ \d{4}$/, "");
}

function monthShort(day: string): string {
  return formatCivilDate(`${day.slice(0, 7)}-01`).split(" ")[1] ?? day.slice(5, 7);
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addCivilDays(day, 1)) days.push(day);
  return days;
}

function finite(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stepsMap(metrics: readonly FitnessMetricWrite[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of metricSamples(metrics)) {
    if (row.metric !== "step_count") continue;
    const units = row.units.trim().toLowerCase();
    if (units && units !== "count" && units !== "steps" && units !== "step") continue;
    if (!Number.isFinite(row.qty) || row.qty < 0) continue;
    map.set(row.day, (map.get(row.day) ?? 0) + row.qty);
  }
  return map;
}

function restingMap(metrics: readonly FitnessMetricWrite[]): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const row of metricSamples(metrics)) {
    if (row.metric !== "resting_heart_rate" || !(row.qty > 0)) continue;
    const list = grouped.get(row.day) ?? [];
    list.push(row.qty);
    grouped.set(row.day, list);
  }
  const map = new Map<string, number>();
  for (const [day, values] of grouped) {
    map.set(day, values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return map;
}

function readSplits(payload: unknown): { miles: number; durationSec: number }[] {
  const raw = asRecord(payload)?.splits;
  if (!Array.isArray(raw)) return [];
  const splits: { miles: number; durationSec: number }[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const miles = Number(record.miles);
    const durationSec = Number(record.durationSec);
    if (!Number.isFinite(miles) || miles <= 0) continue;
    if (!Number.isFinite(durationSec) || durationSec <= 0) continue;
    splits.push({ miles, durationSec });
  }
  return splits;
}

function runFacts(workouts: readonly FitnessWorkoutWrite[], today: string): RunFact[] {
  const writes = new Map(workouts.map((row) => [`${row.source}:${row.externalId}`, row]));
  return workoutSamples(workouts)
    .filter((row) => row.kind === "run" && row.day <= today)
    .map((row) => {
      const write = writes.get(row.id);
      return {
        id: row.id,
        day: row.day,
        startedAt: row.startedAt,
        miles: row.miles,
        durationSec: row.durationSec,
        energyKcal: row.energyKcal,
        heartAvg: row.heartRateAvg,
        heartMax: finite(write?.heartRateMax),
        splits: readSplits(write?.payload),
      };
    });
}

function averageRecorded(days: readonly string[], steps: ReadonlyMap<string, number>): number | null {
  const values: number[] = [];
  for (const day of days) {
    const value = steps.get(day);
    if (value === undefined) continue;
    values.push(value);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanIn(map: ReadonlyMap<string, number>, start: string, end: string): number | null {
  const values: number[] = [];
  for (const [day, value] of map) {
    if (day >= start && day <= end) values.push(value);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type SpanWindow = {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  compare: string;
};

function spanWindow(span: StepSpan, today: string): SpanWindow {
  if (span === "d") {
    const yesterday = addCivilDays(today, -1);
    return { start: today, end: today, previousStart: yesterday, previousEnd: yesterday, compare: "yesterday" };
  }
  if (span === "w") {
    const start = civilWeek(today)[0] ?? today;
    const previousEnd = addCivilDays(start, -1);
    const previousStart = civilWeek(previousEnd)[0] ?? previousEnd;
    return { start, end: today, previousStart, previousEnd, compare: "last week" };
  }
  if (span === "m") {
    const start = `${today.slice(0, 7)}-01`;
    const previousEnd = addCivilDays(start, -1);
    return {
      start,
      end: today,
      previousStart: `${previousEnd.slice(0, 7)}-01`,
      previousEnd,
      compare: "last month",
    };
  }
  if (span === "6m") {
    const start = `${adjacentMonth(today, -5).slice(0, 7)}-01`;
    const previousEnd = addCivilDays(start, -1);
    return {
      start,
      end: today,
      previousStart: `${adjacentMonth(previousEnd, -5).slice(0, 7)}-01`,
      previousEnd,
      compare: "the previous 6 months",
    };
  }
  const start = `${today.slice(0, 4)}-01-01`;
  const previousEnd = addCivilDays(start, -1);
  return {
    start,
    end: today,
    previousStart: `${previousEnd.slice(0, 4)}-01-01`,
    previousEnd,
    compare: "last year",
  };
}

function trendLine(
  current: number | null,
  previous: number | null,
  compare: string,
): { text: string; tone: StepsView["trendTone"] } | null {
  if (current === null || previous === null || !(previous > 0)) return null;
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.5) return { text: `Same as ${compare}`, tone: "flat" };
  const rounded = Math.abs(Math.round(pct));
  if (pct > 0) return { text: `Up ${rounded}% from ${compare}`, tone: "up" };
  return { text: `Down ${rounded}% from ${compare}`, tone: "down" };
}

type BarCopy = {
  point: (value: number) => string;
  average: (value: number) => string;
};

const STEP_COPY: BarCopy = {
  point: (value) => `${formatCount(value)} steps`,
  average: (value) => `avg ${formatCount(value)}`,
};

const MILE_COPY: BarCopy = {
  point: (value) => formatMiles(value),
  average: (value) => `avg ${formatMiles(value)}`,
};

function dayBars(
  days: readonly string[],
  values: ReadonlyMap<string, number>,
  labelOf: (day: string) => string,
  copy: BarCopy,
): StepBarModel[] {
  return days.flatMap((day) => {
    const value = values.get(day);
    if (value === undefined) return [];
    return [{ id: day, label: labelOf(day), value, caption: copy.point(value) }];
  });
}

function weekAverageBars(start: string, end: string, values: ReadonlyMap<string, number>, copy: BarCopy): StepBarModel[] {
  const bars: StepBarModel[] = [];
  for (let monday = civilWeek(start)[0] ?? start; monday <= end; monday = addCivilDays(monday, 7)) {
    const days = civilWeek(monday).filter((day) => day >= start && day <= end);
    const average = averageRecorded(days, values);
    if (average === null) continue;
    bars.push({ id: monday, label: shortDay(monday), value: average, caption: copy.average(average) });
  }
  return bars;
}

function monthAverageBars(start: string, end: string, values: ReadonlyMap<string, number>, copy: BarCopy): StepBarModel[] {
  const bars: StepBarModel[] = [];
  for (let cursor = start; cursor <= end; cursor = addCivilDays(civilMonthLastDay(cursor), 1)) {
    const last = civilMonthLastDay(cursor);
    const days = eachDay(cursor, last < end ? last : end);
    const average = averageRecorded(days, values);
    if (average === null) continue;
    bars.push({
      id: cursor.slice(0, 7),
      label: monthShort(cursor),
      value: average,
      caption: copy.average(average),
    });
  }
  return bars;
}

function chartBars(
  span: StepSpan,
  window: SpanWindow,
  values: ReadonlyMap<string, number>,
  copy: BarCopy = STEP_COPY,
): StepBarModel[] {
  if (span === "d") return [];
  if (span === "6m") return weekAverageBars(window.start, window.end, values, copy);
  if (span === "y") return monthAverageBars(window.start, window.end, values, copy);
  const days = eachDay(window.start, window.end);
  if (span === "w") return dayBars(days, values, civilWeekdayShort, copy);
  return dayBars(days, values, (day) => String(Number(day.slice(8, 10))), copy);
}

function weekRangeLabel(monday: string, today: string): string {
  const sunday = addCivilDays(monday, 6);
  const end = sunday < today ? sunday : today;
  if (monday === end) return shortDay(monday);
  return `${shortDay(monday)} – ${shortDay(end)}`;
}

function emptyHistory(): ActivityHistory {
  return { monthLabel: null, weeks: [], months: [], years: [] };
}

/**
 * File each week by its latest recorded day. The current month shows those
 * weeks. Older months of this year collapse. Older years collapse above that.
 */
function buildActivityHistory<T extends { day: string }>(
  today: string,
  rows: readonly T[],
  present: (row: T) => { value: string; href?: string; lines?: HistoryLine[] },
  summarize: (rows: readonly T[]) => string,
): ActivityHistory {
  const byWeek = new Map<string, T[]>();
  for (const row of rows) {
    if (row.day > today) continue;
    const monday = civilWeek(row.day)[0] ?? row.day;
    const list = byWeek.get(monday) ?? [];
    list.push(row);
    byWeek.set(monday, list);
  }
  if (byWeek.size === 0) return emptyHistory();

  type Bucket = { monday: string; latest: string; rows: T[] };
  const buckets: Bucket[] = [];
  for (const [monday, list] of byWeek) {
    const sorted = [...list].sort((left, right) => (left.day < right.day ? 1 : -1));
    const latest = sorted.reduce((max, row) => (row.day > max ? row.day : max), sorted[0]?.day ?? monday);
    buckets.push({ monday, latest, rows: sorted });
  }
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const current: Bucket[] = [];
  const months = new Map<string, Bucket[]>();
  const years = new Map<string, Map<string, Bucket[]>>();
  for (const bucket of buckets) {
    const monthKey = bucket.latest.slice(0, 7);
    const yearKey = bucket.latest.slice(0, 4);
    if (monthKey === currentMonth) current.push(bucket);
    else if (yearKey === currentYear) {
      const list = months.get(monthKey) ?? [];
      list.push(bucket);
      months.set(monthKey, list);
    } else {
      const yearMonths = years.get(yearKey) ?? new Map<string, Bucket[]>();
      const list = yearMonths.get(monthKey) ?? [];
      list.push(bucket);
      yearMonths.set(monthKey, list);
      years.set(yearKey, yearMonths);
    }
  }

  const toWeek = (bucket: Bucket): HistoryWeek => ({
    id: bucket.monday,
    label: weekRangeLabel(bucket.monday, today),
    summary: summarize(bucket.rows),
    days: bucket.rows.map((row) => {
      const view = present(row);
      const day: HistoryDay = {
        id: row.day,
        label: `${civilWeekdayShort(row.day)}, ${formatCivilDate(row.day)}`,
        value: view.value,
      };
      if (view.href) day.href = view.href;
      if (view.lines && view.lines.length > 0) day.lines = view.lines;
      return day;
    }),
  });
  const sortBuckets = (list: Bucket[]) => [...list].sort((left, right) => (left.monday < right.monday ? 1 : -1));
  const toMonth = (key: string, list: Bucket[]): HistoryMonth => {
    const sorted = sortBuckets(list);
    return {
      id: key,
      label: formatCivilMonth(`${key}-01`),
      summary: summarize(sorted.flatMap((bucket) => bucket.rows)),
      weeks: sorted.map(toWeek),
    };
  };
  const weeks = sortBuckets(current).map(toWeek);
  return {
    monthLabel: weeks.length > 0 ? formatCivilMonth(today) : null,
    weeks,
    months: [...months.entries()]
      .sort((left, right) => (left[0] < right[0] ? 1 : -1))
      .map(([key, list]) => toMonth(key, list)),
    years: [...years.entries()]
      .sort((left, right) => (left[0] < right[0] ? 1 : -1))
      .map(([year, monthMap]) => {
        const yearMonths = [...monthMap.entries()]
          .sort((left, right) => (left[0] < right[0] ? 1 : -1))
          .map(([key, list]) => toMonth(key, list));
        const yearRows = [...monthMap.values()].flatMap((list) => list.flatMap((bucket) => bucket.rows));
        return {
          id: year,
          label: year,
          summary: summarize(yearRows),
          months: yearMonths,
        };
      }),
  };
}

function stepRecords(steps: ReadonlyMap<string, number>, today: string): PrModel[] {
  const days = [...steps.entries()].filter(([day]) => day <= today);
  if (days.length === 0) return [];
  const bestDay = days.reduce((best, entry) => {
    if (entry[1] > best[1]) return entry;
    if (entry[1] === best[1] && entry[0] > best[0]) return entry;
    return best;
  });
  const weeks = new Map<string, number>();
  for (const [day, count] of days) {
    const monday = civilWeek(day)[0] ?? day;
    weeks.set(monday, (weeks.get(monday) ?? 0) + count);
  }
  const bestWeek = [...weeks.entries()].reduce((best, entry) => {
    if (entry[1] > best[1]) return entry;
    if (entry[1] === best[1] && entry[0] > best[0]) return entry;
    return best;
  });
  return [
    {
      id: "most-steps",
      label: "Most steps",
      value: formatCount(bestDay[1]),
      when: formatCivilDate(bestDay[0]),
    },
    {
      id: "best-week",
      label: "Best week",
      value: formatCount(bestWeek[1]),
      when: weekRangeLabel(bestWeek[0], today),
    },
  ];
}

function stepHighlights(steps: ReadonlyMap<string, number>, today: string, windowDays: readonly string[]): { id: string; text: string }[] {
  const notes: { id: string; text: string }[] = [];
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthEnd = addCivilDays(monthStart, -1);
  const monthAvg = averageRecorded(eachDay(monthStart, today), steps);
  const previousMonthAvg = averageRecorded(eachDay(`${previousMonthEnd.slice(0, 7)}-01`, previousMonthEnd), steps);
  if (monthAvg !== null && previousMonthAvg !== null && monthAvg !== previousMonthAvg) {
    notes.push({
      id: monthAvg > previousMonthAvg ? "month-up" : "month-down",
      text:
        monthAvg > previousMonthAvg
          ? "You're averaging more steps this month than last."
          : "You're averaging fewer steps this month than last.",
    });
  }
  const recorded = windowDays.filter((day) => steps.has(day));
  if (recorded.length > 1) {
    const best = recorded.reduce((top, day) => ((steps.get(day) ?? 0) > (steps.get(top) ?? 0) ? day : top));
    notes.push({
      id: "best-day",
      text: `Your highest day in this range is ${formatCivilDate(best)}, with ${formatCount(steps.get(best) ?? 0)} steps.`,
    });
  }
  const hits = windowDays.filter((day) => (steps.get(day) ?? -1) >= STEP_GOAL).length;
  if (hits > 0) {
    notes.push({
      id: "goal-days",
      text: `You reached ${formatCount(STEP_GOAL)} steps on ${hits} ${hits === 1 ? "day" : "days"} in this range.`,
    });
  }
  return notes.slice(0, 3);
}

export function buildStepsView(input: {
  metrics: readonly FitnessMetricWrite[];
  today: string;
  span?: StepSpan;
  publicMode?: boolean;
}): StepsView {
  const span = input.span ?? "w";
  const steps = stepsMap(input.metrics);
  const window = spanWindow(span, input.today);
  const currentDays = eachDay(window.start, window.end);
  const previousDays = eachDay(window.previousStart, window.previousEnd);
  const average = averageRecorded(currentDays, steps);
  const previous = averageRecorded(previousDays, steps);
  const trend = trendLine(average, previous, window.compare);
  const bars = chartBars(span, window, steps);
  const days = [...currentDays]
    .reverse()
    .flatMap((day) => {
      const value = steps.get(day);
      if (value === undefined) return [];
      return [{ id: day, label: formatCivilDate(day), steps: formatCount(value) }];
    });
  const recorded = [...steps.entries()]
    .filter(([day]) => day <= input.today)
    .map(([day, count]) => ({ day, steps: count }));
  return {
    span,
    average: average === null ? null : formatCount(average),
    averageLabel: span === "d" ? "today" : "daily average",
    trend: trend?.text ?? null,
    trendTone: trend?.tone ?? "",
    hourlyNote: span === "d" ? "Hourly steps are not in this export." : null,
    bars,
    highlights: stepHighlights(steps, input.today, currentDays),
    records: stepRecords(steps, input.today),
    history: buildActivityHistory(
      input.today,
      recorded,
      (row) => ({ value: formatCount(row.steps) }),
      (rows) => {
        const total = rows.reduce((sum, row) => sum + row.steps, 0);
        const count = rows.length;
        return `${formatCount(total)} steps · ${count} ${count === 1 ? "day" : "days"}`;
      },
    ),
    days,
    empty: average === null ? (span === "d" ? "No steps for today yet." : "No steps in this range yet.") : null,
  };
}

function paceOf(run: RunFact): number | null {
  if (run.miles === null || run.miles < 0.05 || run.durationSec === null || !(run.durationSec > 0)) return null;
  return run.durationSec / run.miles;
}

function heartLabel(avg: number | null, max: number | null): { avgHeart?: string; maxHeart?: string } {
  const fields: { avgHeart?: string; maxHeart?: string } = {};
  if (avg !== null && avg > 0) fields.avgHeart = `${formatCount(avg)} bpm`;
  if (max !== null && max > 0) fields.maxHeart = `${formatCount(max)} bpm`;
  return fields;
}

function runCard(run: RunFact, publicMode: boolean): RunCardModel {
  const pace = run.miles !== null && run.durationSec !== null ? formatPace(run.miles, run.durationSec) : null;
  const card: RunCardModel = {
    id: run.id,
    href: `/n/fitness/runs/${encodeURIComponent(run.id)}`,
    date: `${civilWeekdayShort(run.day)}, ${formatCivilDate(run.day)}`,
    distance: run.miles === null ? "distance not recorded" : formatMiles(run.miles),
    duration: run.durationSec === null ? "—" : formatClock(run.durationSec),
    pace: pace ?? "—",
    energy: run.energyKcal !== null && run.energyKcal > 0 ? `${formatCount(run.energyKcal)} kcal` : null,
  };
  if (!publicMode && run.heartAvg !== null && run.heartAvg > 0) card.avgHeart = `${formatCount(run.heartAvg)} bpm`;
  return card;
}

function monthTotals(runs: readonly RunFact[]): MonthTotalModel[] {
  const groups = new Map<string, RunFact[]>();
  for (const run of runs) {
    const key = run.day.slice(0, 7);
    const list = groups.get(key) ?? [];
    list.push(run);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((left, right) => (left[0] < right[0] ? 1 : -1))
    .map(([key, list]) => {
      const miles = list.reduce((sum, run) => sum + (run.miles !== null && run.miles >= 0.05 ? run.miles : 0), 0);
      const timed = list.filter((run) => paceOf(run) !== null);
      const mileSum = timed.reduce((sum, run) => sum + (run.miles ?? 0), 0);
      const timeSum = timed.reduce((sum, run) => sum + (run.durationSec ?? 0), 0);
      const durationSum = list.reduce((sum, run) => sum + (run.durationSec !== null && run.durationSec > 0 ? run.durationSec : 0), 0);
      const pace = mileSum > 0 && timeSum > 0 ? formatPace(mileSum, timeSum) : null;
      return {
        id: key,
        label: formatCivilMonth(`${key}-01`),
        runs: String(list.length),
        miles: miles > 0 ? formatMiles(miles) : "—",
        time: durationSum > 0 ? formatClock(durationSum) : "—",
        pace: pace ?? "—",
      };
    });
}

function bestPace(runs: readonly RunFact[], minimumMiles: number): RunFact | null {
  let best: { run: RunFact; pace: number } | null = null;
  for (const run of runs) {
    if (run.miles === null || run.miles < minimumMiles) continue;
    const pace = paceOf(run);
    if (pace === null) continue;
    if (!best || pace < best.pace) best = { run, pace };
  }
  return best?.run ?? null;
}

function prWhen(run: RunFact): string {
  const miles = run.miles !== null && run.miles >= 0.05 ? formatMiles(run.miles) : null;
  return [formatCivilDate(run.day), miles].filter(Boolean).join(" · ");
}

function personalRecords(runs: readonly RunFact[]): { prs: PrModel[]; note: string | null } {
  const prs: PrModel[] = [];
  const withMiles = runs.filter((run) => run.miles !== null && run.miles >= 0.05);
  if (withMiles.length > 0) {
    const longest = withMiles.reduce((best, run) => ((run.miles ?? 0) > (best.miles ?? 0) ? run : best));
    prs.push({
      id: "longest",
      label: "Longest run",
      value: formatMiles(longest.miles ?? 0),
      when: formatCivilDate(longest.day),
    });
  }
  const fastest = bestPace(runs, 0.05);
  if (fastest) {
    const pace = formatPace(fastest.miles ?? 0, fastest.durationSec ?? 0);
    if (pace) prs.push({ id: "fastest-pace", label: "Fastest pace", value: pace, when: prWhen(fastest) });
  }
  const mile = bestPace(runs, 1);
  if (mile) {
    const pace = formatPace(mile.miles ?? 0, mile.durationSec ?? 0);
    if (pace) prs.push({ id: "fastest-mile", label: "Fastest mile", value: pace, when: prWhen(mile) });
  }
  const fiveK = bestPace(runs, FIVE_K_MILES);
  if (fiveK) {
    const pace = formatPace(fiveK.miles ?? 0, fiveK.durationSec ?? 0);
    if (pace) prs.push({ id: "fastest-5k", label: "Fastest 5K", value: pace, when: prWhen(fiveK) });
  }
  const marked = prs.some((pr) => pr.id === "fastest-mile" || pr.id === "fastest-5k");
  return {
    prs,
    note: marked
      ? "Mile and 5K use that run's average pace, and only when the run is at least that far. Splits are not estimated."
      : null,
  };
}

function milesMap(runs: readonly RunFact[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const run of runs) {
    if (run.miles === null) continue;
    map.set(run.day, (map.get(run.day) ?? 0) + run.miles);
  }
  return map;
}

function runsSummary(runs: readonly RunFact[]): string {
  const miles = runs.reduce((sum, run) => sum + (run.miles ?? 0), 0);
  const timed = runs.filter((run) => paceOf(run) !== null);
  const mileSum = timed.reduce((sum, run) => sum + (run.miles ?? 0), 0);
  const timeSum = timed.reduce((sum, run) => sum + (run.durationSec ?? 0), 0);
  const durationSum = runs.reduce((sum, run) => sum + (run.durationSec !== null && run.durationSec > 0 ? run.durationSec : 0), 0);
  const pace = mileSum > 0 && timeSum > 0 ? formatPace(mileSum, timeSum) : null;
  const parts = [`${runs.length} ${runs.length === 1 ? "run" : "runs"}`];
  if (miles > 0) parts.push(formatMiles(miles));
  if (durationSum > 0) parts.push(formatClock(durationSum));
  if (pace) parts.push(pace);
  return parts.join(" · ");
}

function runLine(run: RunFact, publicMode: boolean): string {
  const pace = run.miles !== null && run.durationSec !== null ? formatPace(run.miles, run.durationSec) : null;
  const parts = [
    run.miles === null ? "distance not recorded" : formatMiles(run.miles),
    run.durationSec === null ? null : formatClock(run.durationSec),
    pace,
    run.energyKcal !== null && run.energyKcal > 0 ? `${formatCount(run.energyKcal)} kcal` : null,
    publicMode || run.heartAvg === null || !(run.heartAvg > 0) ? null : `${formatCount(run.heartAvg)} bpm`,
  ];
  return parts.filter((part) => part !== null).join(" · ");
}

function runsByDay(runs: readonly RunFact[]): { day: string; runs: RunFact[] }[] {
  const map = new Map<string, RunFact[]>();
  for (const run of runs) {
    const list = map.get(run.day) ?? [];
    list.push(run);
    map.set(run.day, list);
  }
  return [...map.entries()].map(([day, list]) => ({ day, runs: list }));
}

export function buildRunsView(input: {
  workouts: readonly FitnessWorkoutWrite[];
  today: string;
  span?: StepSpan;
  publicMode?: boolean;
}): RunsView {
  const publicMode = input.publicMode === true;
  const span = input.span ?? "w";
  const runs = runFacts(input.workouts, input.today);
  const records = personalRecords(runs);
  const miles = milesMap(runs);
  const window = spanWindow(span, input.today);
  const currentDays = eachDay(window.start, window.end);
  const previousDays = eachDay(window.previousStart, window.previousEnd);
  const average = averageRecorded(currentDays, miles);
  const previous = averageRecorded(previousDays, miles);
  const trend = trendLine(average, previous, window.compare);
  return {
    span,
    average: average === null ? null : formatMiles(average),
    averageLabel: span === "d" ? "today" : "daily average",
    trend: trend?.text ?? null,
    trendTone: trend?.tone ?? "",
    hourlyNote: span === "d" ? "Hourly distance is not in this export." : null,
    bars: chartBars(span, window, miles, MILE_COPY),
    rangeEmpty:
      runs.length === 0
        ? null
        : average === null
          ? span === "d"
            ? "No runs for today yet."
            : "No runs in this range yet."
          : null,
    cards: runs.map((run) => runCard(run, publicMode)),
    months: monthTotals(runs),
    prs: records.prs,
    prNote: records.note,
    history: buildActivityHistory(
      input.today,
      runsByDay(runs),
      (row) => {
        const first = row.runs[0];
        if (row.runs.length === 1 && first) {
          return { value: runLine(first, publicMode), href: `/n/fitness/runs/${encodeURIComponent(first.id)}` };
        }
        return {
          value: runsSummary(row.runs),
          lines: row.runs.map((run) => ({
            id: run.id,
            value: runLine(run, publicMode),
            href: `/n/fitness/runs/${encodeURIComponent(run.id)}`,
          })),
        };
      },
      (rows) => runsSummary(rows.flatMap((row) => row.runs)),
    ),
    empty: runs.length === 0 ? "No runs yet." : null,
  };
}

export function buildRunDetail(input: {
  workouts: readonly FitnessWorkoutWrite[];
  today: string;
  id: string;
  publicMode?: boolean;
}): RunDetailView | null {
  const run = runFacts(input.workouts, input.today).find((item) => item.id === input.id);
  if (!run) return null;
  const publicMode = input.publicMode === true;
  const pace = run.miles !== null && run.durationSec !== null ? formatPace(run.miles, run.durationSec) : null;
  const splits = run.splits.map((split, index) => ({
    id: `${run.id}:${index + 1}`,
    label: `Split ${index + 1}`,
    distance: formatMiles(split.miles),
    pace: formatPace(split.miles, split.durationSec) ?? "—",
  }));
  const detail: RunDetailView = {
    id: run.id,
    date: `${civilWeekdayShort(run.day)}, ${formatCivilDate(run.day)}`,
    distance: run.miles === null ? "distance not recorded" : formatMiles(run.miles),
    duration: run.durationSec === null ? "—" : formatClock(run.durationSec),
    pace: pace ?? "—",
    energy: run.energyKcal !== null && run.energyKcal > 0 ? `${formatCount(run.energyKcal)} kcal` : null,
    splits,
    splitsNote: splits.length === 0 ? "No splits in this export." : null,
  };
  if (!publicMode) Object.assign(detail, heartLabel(run.heartAvg, run.heartMax));
  return detail;
}

function weeksBack(today: string, count: number): string[] {
  const monday = civilWeek(today)[0] ?? today;
  const starts: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) starts.push(addCivilDays(monday, -7 * index));
  return starts;
}

function milesOnWeek(runs: readonly RunFact[], monday: string): number {
  const days = new Set(civilWeek(monday));
  return runs.reduce((sum, run) => {
    if (!days.has(run.day) || run.miles === null || run.miles < 0.05) return sum;
    return sum + run.miles;
  }, 0);
}

function stepStreak(steps: ReadonlyMap<string, number>, today: string): number | null {
  if (steps.size === 0) return null;
  let cursor = steps.has(today) ? today : addCivilDays(today, -1);
  let count = 0;
  while (steps.has(cursor)) {
    if ((steps.get(cursor) ?? 0) < STEP_GOAL) break;
    count += 1;
    cursor = addCivilDays(cursor, -1);
  }
  return count;
}

function consistencyScore(steps: ReadonlyMap<string, number>, today: string): number | null {
  if (steps.size === 0) return null;
  const days = eachDay(addCivilDays(today, -29), today);
  const hits = days.filter((day) => (steps.get(day) ?? -1) >= STEP_GOAL).length;
  return (hits / days.length) * 100;
}

function paceSeconds(runs: readonly RunFact[]): { run: RunFact; pace: number }[] {
  return [...runs]
    .reverse()
    .flatMap((run) => {
      const pace = paceOf(run);
      return pace === null ? [] : [{ run, pace }];
    });
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bpmDelta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null;
  const delta = Math.round(current - previous);
  if (delta === 0) return "Same as the prior 30 days";
  if (delta > 0) return `Up ${delta} bpm from the prior 30 days`;
  return `Down ${Math.abs(delta)} bpm from the prior 30 days`;
}

/**
 * Builders in order. A new card is another entry.
 * Heart cards stay out of Public view.
 */
const ANALYTICS_BUILDERS: {
  id: string;
  heart: boolean;
  build: (context: AnalyticsContext) => AnalyticsMetric;
}[] = [
  {
    id: "step-streak",
    heart: false,
    build: (context) => {
      const streak = stepStreak(context.steps, context.today);
      return {
        id: "step-streak",
        title: "Step streak",
        value: streak === null ? NOT_RECORDED : `${formatCount(streak)} ${streak === 1 ? "day" : "days"}`,
        detail: streak === null ? null : `Goal ${formatCount(STEP_GOAL)} steps`,
        how: `Chicago days in a row at or above ${formatCount(STEP_GOAL)} steps, through today. A day with no sample does not count, and it ends the streak once a sample lands under the goal.`,
        bars: [],
      };
    },
  },
  {
    id: "step-consistency",
    heart: false,
    build: (context) => {
      const score = consistencyScore(context.steps, context.today);
      return {
        id: "step-consistency",
        title: "Step consistency",
        value: score === null ? NOT_RECORDED : `${Math.round(score)}%`,
        detail: score === null ? null : `Last 30 days at ${formatCount(STEP_GOAL)}`,
        how: `Days at or above ${formatCount(STEP_GOAL)} steps, divided by the last 30 Chicago days. A day with no sample counts as under the goal.`,
        bars: [],
      };
    },
  },
  {
    id: "weekly-mileage",
    heart: false,
    build: (context) => {
      const mondays = weeksBack(context.today, 8);
      const bars = mondays.map((monday) => {
        const miles = milesOnWeek(context.runs, monday);
        return { id: monday, label: shortDay(monday), value: miles, caption: formatMiles(miles) };
      });
      const latest = bars.at(-1)?.value ?? 0;
      const prior = bars.at(-2)?.value ?? 0;
      const any = context.runs.some((run) => run.miles !== null && run.miles >= 0.05);
      let detail: string | null = null;
      if (any && latest !== prior) {
        const delta = Math.abs(latest - prior);
        detail = latest > prior ? `Up ${delta.toFixed(1)} mi from last week` : `Down ${delta.toFixed(1)} mi from last week`;
      } else if (any) detail = "Same miles as last week";
      return {
        id: "weekly-mileage",
        title: "Weekly mileage",
        value: any ? formatMiles(latest) : NOT_RECORDED,
        detail,
        how: "Run miles added up for each of the last 8 Chicago weeks, Monday through Sunday. A week with no run is zero.",
        bars: any ? bars : [],
      };
    },
  },
  {
    id: "pace-progression",
    heart: false,
    build: (context) => {
      const paced = paceSeconds(context.runs);
      if (paced.length === 0) {
        return {
          id: "pace-progression",
          title: "Pace progression",
          value: NOT_RECORDED,
          detail: null,
          how: "Average pace of the last 5 runs that have distance and time, set next to the 5 before that.",
          bars: [],
        };
      }
      const recent = paced.slice(-5);
      const prior = paced.slice(-10, -5);
      const recentAvg = mean(recent.map((item) => item.pace));
      const priorAvg = prior.length === 5 ? mean(prior.map((item) => item.pace)) : null;
      const value = recentAvg === null ? NOT_RECORDED : (formatPace(1, recentAvg) ?? NOT_RECORDED);
      let detail: string | null = recent.length < 5 ? `Based on ${recent.length} ${recent.length === 1 ? "run" : "runs"}` : null;
      if (recentAvg !== null && priorAvg !== null) {
        const delta = Math.round(recentAvg - priorAvg);
        if (delta === 0) detail = "Same as the prior 5 runs";
        else if (delta < 0) detail = `${Math.abs(delta)} sec/mi faster than the prior 5 runs`;
        else detail = `${delta} sec/mi slower than the prior 5 runs`;
      }
      return {
        id: "pace-progression",
        title: "Pace progression",
        value,
        detail,
        how: "Average pace of the last 5 runs that have distance and time, set next to the 5 before that. The bars are each run's own pace.",
        bars: paced.slice(-12).map((item) => ({
          id: item.run.id,
          label: shortDay(item.run.day),
          value: item.pace,
          caption: formatPace(1, item.pace) ?? "",
        })),
      };
    },
  },
  {
    id: "long-run-share",
    heart: false,
    build: (context) => {
      const mondays = weeksBack(context.today, 8);
      let longest = 0;
      let total = 0;
      const bars: StepBarModel[] = [];
      for (const monday of mondays) {
        const days = new Set(civilWeek(monday));
        const miles = context.runs.flatMap((run) =>
          days.has(run.day) && run.miles !== null && run.miles >= 0.05 ? [run.miles] : [],
        );
        if (miles.length === 0) continue;
        const weekMiles = miles.reduce((sum, value) => sum + value, 0);
        const weekLong = Math.max(...miles);
        longest += weekLong;
        total += weekMiles;
        const share = weekMiles > 0 ? (weekLong / weekMiles) * 100 : 0;
        bars.push({ id: monday, label: shortDay(monday), value: share, caption: `${Math.round(share)}%` });
      }
      const share = total > 0 ? (longest / total) * 100 : null;
      return {
        id: "long-run-share",
        title: "Long-run portion",
        value: share === null ? NOT_RECORDED : `${Math.round(share)}%`,
        detail: share === null ? null : "Longest run in each week",
        how: "Miles from each week's longest run, divided by all run miles in the last 8 Chicago weeks.",
        bars,
      };
    },
  },
  {
    id: "resting-heart",
    heart: true,
    build: (context) => {
      if (context.resting.size === 0) {
        return {
          id: "resting-heart",
          title: "Resting heart rate",
          value: NOT_CONNECTED,
          detail: "Add resting_heart_rate in Health Auto Export.",
          how: "One resting_heart_rate for each Chicago day. A later export for that day replaces the stored value. No number is filled in before it arrives.",
          bars: [],
        };
      }
      const start = addCivilDays(context.today, -29);
      const priorEnd = addCivilDays(start, -1);
      const current = meanIn(context.resting, start, context.today);
      const previous = meanIn(context.resting, addCivilDays(priorEnd, -29), priorEnd);
      const latestDay = [...context.resting.keys()].filter((day) => day <= context.today).sort().at(-1);
      const latest = latestDay ? context.resting.get(latestDay) : null;
      const days = [...context.resting.keys()].filter((day) => day <= context.today).sort().slice(-14);
      return {
        id: "resting-heart",
        title: "Resting heart rate",
        value: latest === null || latest === undefined ? NOT_RECORDED : `${formatCount(latest)} bpm`,
        detail: bpmDelta(current, previous),
        how: "Latest resting_heart_rate, with the average of the last 30 Chicago days beside the 30 days before that.",
        bars: days.flatMap((day) => {
          const value = context.resting.get(day);
          if (value === undefined) return [];
          return [{ id: day, label: shortDay(day), value, caption: `${formatCount(value)} bpm` }];
        }),
      };
    },
  },
  {
    id: "average-heart",
    heart: true,
    build: (context) => {
      const withHeart = context.runs.filter((run) => run.heartAvg !== null && run.heartAvg > 0);
      if (withHeart.length === 0) {
        return {
          id: "average-heart",
          title: "Average heart rate",
          value: NOT_RECORDED,
          detail: null,
          how: "Average of each workout's average heart rate over the last 30 Chicago days, beside the 30 days before.",
          bars: [],
        };
      }
      const inWindow = (start: string, end: string) =>
        withHeart.filter((run) => run.day >= start && run.day <= end).map((run) => run.heartAvg as number);
      const start = addCivilDays(context.today, -29);
      const priorEnd = addCivilDays(start, -1);
      const current = mean(inWindow(start, context.today));
      const previous = mean(inWindow(addCivilDays(priorEnd, -29), priorEnd));
      const recent = withHeart.slice(0, 12).reverse();
      return {
        id: "average-heart",
        title: "Average heart rate",
        value: current === null ? `${formatCount(withHeart[0]?.heartAvg ?? 0)} bpm` : `${formatCount(current)} bpm`,
        detail: bpmDelta(current, previous) ?? "From workouts",
        how: "Average of each workout's average heart rate over the last 30 Chicago days, beside the 30 days before.",
        bars: recent.flatMap((run) => {
          if (run.heartAvg === null) return [];
          return [{ id: run.id, label: shortDay(run.day), value: run.heartAvg, caption: `${formatCount(run.heartAvg)} bpm` }];
        }),
      };
    },
  },
];

export function buildAnalytics(input: {
  metrics: readonly FitnessMetricWrite[];
  workouts: readonly FitnessWorkoutWrite[];
  today: string;
  publicMode?: boolean;
}): AnalyticsMetric[] {
  const context: AnalyticsContext = {
    steps: stepsMap(input.metrics),
    resting: restingMap(input.metrics),
    runs: runFacts(input.workouts, input.today),
    today: input.today,
  };
  const publicMode = input.publicMode === true;
  return ANALYTICS_BUILDERS.filter((builder) => !publicMode || !builder.heart).map((builder) => builder.build(context));
}
