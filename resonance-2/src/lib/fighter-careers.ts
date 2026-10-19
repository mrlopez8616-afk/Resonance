import type { CalendarEvent } from "@/data/calendar";
import type { FightResult } from "@/lib/fight-results";
import { fightOutcome } from "@/lib/fight-results";
import { personSlug } from "@/lib/ufc332";

export const NOT_RECORDED = "not recorded";

export const FIGHTER_RESULTS = ["win", "loss", "draw", "nc"] as const;
export type FighterResult = (typeof FIGHTER_RESULTS)[number];

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;
const NAME_MAX = 120;
const EVENT_MAX = 160;
const METHOD_MAX = 80;
const META_MAX = 4000;
const COUNT_MAX = 20000;
const CONTROL_MAX = 7200;

export class FighterCareerError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FighterCareerError";
    this.status = status;
  }
}

/** One stored UFC fight. Null stats were not posted. */
export type CareerFight = {
  date: string;
  event: string | null;
  opponent: string;
  result: FighterResult | null;
  method: string | null;
  round: number | null;
  time: string | null;
  sigStrikesLanded: number | null;
  sigStrikesAttempted: number | null;
  totalStrikesLanded: number | null;
  totalStrikesAttempted: number | null;
  takedownsLanded: number | null;
  takedownsAttempted: number | null;
  subAttempts: number | null;
  controlTimeSeconds: number | null;
  knockdowns: number | null;
  /** True when this row was filled from a settled fight result and is not stored yet. */
  fromResult?: boolean;
};

export type FighterProfile = {
  slug: string;
  name: string;
  metadata: Record<string, unknown> | null;
};

export type FighterCareerWrite = {
  slug: string;
  name: string;
  metadata: Record<string, unknown> | null;
  metadataProvided: boolean;
  fights: CareerFight[];
};

export type TrendDirection = "better" | "worse" | "same";

export type CareerTrend = {
  id: string;
  label: string;
  headline: string;
  status: string;
  direction: TrendDirection | null;
  lastN: number;
  careerN: number;
};

export type BoutDate = {
  event: string;
  fightSlug: string;
  date: string;
};

type CountPick = (fight: CareerFight) => number | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function civilDate(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readName(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > NAME_MAX) throw new FighterCareerError(`${label} is required.`);
  return text;
}

function readOptionalText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new FighterCareerError(`${label} must be a string.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new FighterCareerError(`${label} is too long.`);
  return text;
}

function readCount(value: unknown, label: string, max = COUNT_MAX): number | null {
  if (value == null || value === "") return null;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new FighterCareerError(`${label} must be a whole number or omitted.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new FighterCareerError(`${label} must be a whole number or omitted.`);
  }
  return parsed;
}

function readClock(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new FighterCareerError("time must look like 3:35.");
  const text = value.trim();
  if (!text) return null;
  const match = CLOCK.exec(text);
  if (!match || Number(match[2]) > 59) throw new FighterCareerError("time must look like 3:35.");
  return `${Number(match[1])}:${match[2]}`;
}

function readControl(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    return readCount(value, "control time", CONTROL_MAX);
  }
  if (typeof value !== "string") throw new FighterCareerError("control time must be seconds or m:ss.");
  const match = CLOCK.exec(value.trim());
  if (!match || Number(match[2]) > 59) throw new FighterCareerError("control time must be seconds or m:ss.");
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (seconds > CONTROL_MAX) throw new FighterCareerError("control time must be seconds or m:ss.");
  return seconds;
}

function readResult(value: unknown): FighterResult | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new FighterCareerError("result must be win, loss, draw, or nc.");
  const text = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return null;
  if (text === "no_contest" || text === "nocontest") return "nc";
  if ((FIGHTER_RESULTS as readonly string[]).includes(text)) return text as FighterResult;
  throw new FighterCareerError("result must be win, loss, draw, or nc.");
}

function readRound(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = readCount(value, "round", 5);
  if (parsed == null) return null;
  if (parsed < 1) throw new FighterCareerError("round must be an integer from 1 to 5.");
  return parsed;
}

function readMetadata(value: unknown): { metadata: Record<string, unknown> | null; provided: boolean } {
  if (value === undefined) return { metadata: null, provided: false };
  if (value === null) return { metadata: null, provided: true };
  if (!isRecord(value)) throw new FighterCareerError("metadata must be an object.");
  let encoded = "";
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new FighterCareerError("metadata must be an object.");
  }
  if (encoded.length > META_MAX) throw new FighterCareerError("metadata is too long.");
  return { metadata: value, provided: true };
}

function firstPresent(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function readFight(raw: unknown): CareerFight {
  if (!isRecord(raw)) throw new FighterCareerError("Each fight must be an object.");
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!civilDate(date)) throw new FighterCareerError("date must be YYYY-MM-DD.");
  const opponent = readName(raw.opponent, "opponent");
  return {
    date,
    event: readOptionalText(raw.event, "event", EVENT_MAX),
    opponent,
    result: readResult(raw.result),
    method: readOptionalText(raw.method, "method", METHOD_MAX),
    round: readRound(raw.round),
    time: readClock(raw.time),
    sigStrikesLanded: readCount(firstPresent(raw, ["sigStrikesLanded", "sig_strikes_landed", "sigLanded"]), "sig strikes landed"),
    sigStrikesAttempted: readCount(
      firstPresent(raw, ["sigStrikesAttempted", "sig_strikes_attempted", "sigAttempted"]),
      "sig strikes attempted",
    ),
    totalStrikesLanded: readCount(
      firstPresent(raw, ["totalStrikesLanded", "total_strikes_landed", "totalStrikes"]),
      "total strikes",
    ),
    totalStrikesAttempted: readCount(
      firstPresent(raw, ["totalStrikesAttempted", "total_strikes_attempted"]),
      "total strikes attempted",
    ),
    takedownsLanded: readCount(
      firstPresent(raw, ["takedownsLanded", "takedowns_landed", "tdLanded"]),
      "takedowns landed",
    ),
    takedownsAttempted: readCount(
      firstPresent(raw, ["takedownsAttempted", "takedowns_attempted", "tdAttempted"]),
      "takedowns attempted",
    ),
    subAttempts: readCount(firstPresent(raw, ["subAttempts", "sub_attempts"]), "sub attempts"),
    controlTimeSeconds: readControl(
      firstPresent(raw, ["controlTimeSeconds", "control_time_seconds", "control"]),
    ),
    knockdowns: readCount(firstPresent(raw, ["knockdowns", "kd"]), "knockdowns"),
  };
}

/** Body: { slug?, name, metadata?, fights: [...] }. The same date and opponent is one row. */
export function parseFighterCareer(body: unknown): FighterCareerWrite {
  if (!isRecord(body)) throw new FighterCareerError("JSON object is required.");
  const name = readName(body.name, "name");
  const explicit = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const slug = explicit || personSlug(name);
  if (!SLUG.test(slug)) throw new FighterCareerError("slug must be a lowercase slug.");
  const meta = readMetadata(body.metadata);
  const rawFights = body.fights ?? [];
  if (!Array.isArray(rawFights)) throw new FighterCareerError("fights must be an array.");
  const fights = rawFights.map(readFight);
  const seen = new Set<string>();
  for (const fight of fights) {
    const key = `${fight.date}\0${fight.opponent}`;
    if (seen.has(key)) throw new FighterCareerError("two fights share a date and opponent.");
    seen.add(key);
  }
  return { slug, name, metadata: meta.metadata, metadataProvided: meta.provided, fights };
}

export function sameCareerFight(left: CareerFight, right: CareerFight): boolean {
  const keys: (keyof CareerFight)[] = [
    "date",
    "event",
    "opponent",
    "result",
    "method",
    "round",
    "time",
    "sigStrikesLanded",
    "sigStrikesAttempted",
    "totalStrikesLanded",
    "totalStrikesAttempted",
    "takedownsLanded",
    "takedownsAttempted",
    "subAttempts",
    "controlTimeSeconds",
    "knockdowns",
  ];
  return keys.every((key) => left[key] === right[key]);
}

/** KO/TKO and submission are finishes. A decision is not. Anything else is left out. */
export function methodKind(method: string | null): "finish" | "decision" | null {
  if (!method?.trim()) return null;
  const text = method.trim().toLowerCase();
  if (/\b(dq|disqualification|overturned)\b/.test(text)) return null;
  if (/\b(decision|unanimous|split|majority)\b/.test(text) || /\bu-dec\b|\bs-dec\b|\bm-dec\b|\bdec\b/.test(text)) {
    return "decision";
  }
  if (/\b(ko|tko|knockout)\b/.test(text) || text.includes("submission") || /\bsub\b/.test(text)) return "finish";
  return null;
}

/** Minutes from the posted round and clock. UFC rounds are 5:00. A missing clock stays out. */
export function fightMinutes(round: number | null, time: string | null): number | null {
  if (round == null || round < 1 || round > 5 || !time) return null;
  const match = CLOCK.exec(time.trim());
  if (!match || Number(match[2]) > 59) return null;
  const minutes = (round - 1) * 5 + Number(match[1]) + Number(match[2]) / 60;
  return minutes > 0 ? minutes : null;
}

export function compareCareerFights(left: CareerFight, right: CareerFight): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  return left.opponent.localeCompare(right.opponent);
}

export function sortCareerFights(fights: readonly CareerFight[]): CareerFight[] {
  return [...fights].sort(compareCareerFights);
}

function recent(fights: readonly CareerFight[]): CareerFight[] {
  return sortCareerFights(fights).slice(0, 3);
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function percent(numerator: number, denominator: number): string {
  return `${oneDecimal((numerator * 100) / denominator)}%`;
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function arrow(direction: TrendDirection | null): string {
  if (direction === "better") return "↑";
  if (direction === "worse") return "↓";
  if (direction === "same") return "·";
  return "";
}

function directionFor(last: number, career: number, higherIsBetter: boolean): TrendDirection {
  const left = Math.round(last * 10) / 10;
  const right = Math.round(career * 10) / 10;
  if (left === right) return "same";
  const up = left > right;
  if (higherIsBetter) return up ? "better" : "worse";
  return up ? "worse" : "better";
}

function trendStatus(direction: TrendDirection | null, careerText: string, lastN: number, careerN: number): string {
  if (lastN === 0 && careerN === 0) return NOT_RECORDED;
  const mark = arrow(direction);
  const career = careerText === NOT_RECORDED ? NOT_RECORDED : `career ${careerText}`;
  const head = mark ? `${mark} ${career}` : career;
  return `${head} · n=${lastN}/${careerN}`;
}

type Ratio = { numerator: number; denominator: number };

function finishRatio(fights: readonly CareerFight[], kind: "finish" | "finished"): Ratio {
  let numerator = 0;
  let denominator = 0;
  for (const fight of fights) {
    if (fight.result !== "win" && fight.result !== "loss" && fight.result !== "draw") continue;
    const method = methodKind(fight.method);
    if (!method) continue;
    denominator += 1;
    if (kind === "finish" && fight.result === "win" && method === "finish") numerator += 1;
    if (kind === "finished" && fight.result === "loss" && method === "finish") numerator += 1;
  }
  return { numerator, denominator };
}

function perFifteen(fights: readonly CareerFight[], pick: CountPick): { value: number; n: number } | null {
  let total = 0;
  let minutes = 0;
  let n = 0;
  for (const fight of fights) {
    const stat = pick(fight);
    const span = fightMinutes(fight.round, fight.time);
    if (stat == null || span == null) continue;
    total += stat;
    minutes += span;
    n += 1;
  }
  if (n === 0 || minutes <= 0) return null;
  return { value: (total / minutes) * 15, n };
}

function mean(fights: readonly CareerFight[], pick: CountPick): { value: number; n: number } | null {
  let total = 0;
  let n = 0;
  for (const fight of fights) {
    const stat = pick(fight);
    if (stat == null) continue;
    total += stat;
    n += 1;
  }
  if (n === 0) return null;
  return { value: total / n, n };
}

function ratioTrend(id: string, label: string, fights: readonly CareerFight[], kind: "finish" | "finished"): CareerTrend {
  const lastFights = recent(fights);
  const last = finishRatio(lastFights, kind);
  const career = finishRatio(fights, kind);
  const higherIsBetter = kind === "finish";
  const headline = last.denominator > 0 ? `${last.numerator} of ${last.denominator}` : NOT_RECORDED;
  const careerText = career.denominator > 0 ? `${career.numerator} of ${career.denominator}` : NOT_RECORDED;
  const direction =
    last.denominator > 0 && career.denominator > 0
      ? directionFor(
          (last.numerator / last.denominator) * 100,
          (career.numerator / career.denominator) * 100,
          higherIsBetter,
        )
      : null;
  const shown =
    kind === "finish" && last.denominator > 0 ? percent(last.numerator, last.denominator) : headline;
  const careerShown =
    kind === "finish" && career.denominator > 0 ? percent(career.numerator, career.denominator) : careerText;
  return {
    id,
    label,
    headline: shown,
    status: trendStatus(direction, kind === "finish" ? careerShown : careerText, last.denominator, career.denominator),
    direction,
    lastN: last.denominator,
    careerN: career.denominator,
  };
}

function rateTrend(
  id: string,
  label: string,
  fights: readonly CareerFight[],
  last: { value: number; n: number } | null,
  career: { value: number; n: number } | null,
  format: (value: number) => string,
  higherIsBetter: boolean,
): CareerTrend {
  const direction = last && career ? directionFor(last.value, career.value, higherIsBetter) : null;
  return {
    id,
    label,
    headline: last ? format(last.value) : NOT_RECORDED,
    status: trendStatus(direction, career ? format(career.value) : NOT_RECORDED, last?.n ?? 0, career?.n ?? 0),
    direction,
    lastN: last?.n ?? 0,
    careerN: career?.n ?? 0,
  };
}

function sigTrend(fights: readonly CareerFight[]): CareerTrend {
  const lastFights = recent(fights);
  const lastPer = perFifteen(lastFights, (fight) => fight.sigStrikesLanded);
  const careerPer = perFifteen(fights, (fight) => fight.sigStrikesLanded);
  if (lastPer || careerPer) {
    return rateTrend("sig-strikes", "Sig strikes/15", fights, lastPer, careerPer, oneDecimal, true);
  }
  return rateTrend(
    "sig-strikes",
    "Sig strikes/fight",
    fights,
    mean(lastFights, (fight) => fight.sigStrikesLanded),
    mean(fights, (fight) => fight.sigStrikesLanded),
    oneDecimal,
    true,
  );
}

/** Last 3 fights against the career. Averages use only fights that posted that stat. */
export function careerTrends(fights: readonly CareerFight[]): CareerTrend[] {
  const lastFights = recent(fights);
  return [
    ratioTrend("finish-rate", "Finish rate", fights, "finish"),
    ratioTrend("times-finished", "Times finished", fights, "finished"),
    rateTrend(
      "td-per-15",
      "TD per 15",
      fights,
      perFifteen(lastFights, (fight) => fight.takedownsLanded),
      perFifteen(fights, (fight) => fight.takedownsLanded),
      oneDecimal,
      true,
    ),
    sigTrend(fights),
    rateTrend(
      "control-time",
      "Control time",
      fights,
      mean(lastFights, (fight) => fight.controlTimeSeconds),
      mean(fights, (fight) => fight.controlTimeSeconds),
      clock,
      true,
    ),
  ];
}

/** Wins, losses, draws, and no contests that were posted. A blank result stays out of the mark. */
export function careerRecord(fights: readonly CareerFight[]): string {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let nc = 0;
  let missing = 0;
  for (const fight of fights) {
    if (fight.result === "win") wins += 1;
    else if (fight.result === "loss") losses += 1;
    else if (fight.result === "draw") draws += 1;
    else if (fight.result === "nc") nc += 1;
    else missing += 1;
  }
  if (wins + losses + draws + nc === 0) return NOT_RECORDED;
  const parts = [`${wins}-${losses}`];
  if (draws > 0) parts.push(`${draws} draw`);
  if (nc > 0) parts.push(`${nc} nc`);
  if (missing > 0) parts.push(`${missing} not recorded`);
  return parts.join(" · ");
}

export function strikePair(landed: number | null, attempted: number | null): string {
  if (landed == null) return NOT_RECORDED;
  if (attempted == null) return String(landed);
  return `${landed} of ${attempted}`;
}

export function controlLabel(seconds: number | null): string {
  if (seconds == null) return NOT_RECORDED;
  return clock(seconds);
}

function dayFromStart(start: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(start.trim());
  if (!match) return null;
  const day = match[1] ?? "";
  return civilDate(day) ? day : null;
}

function namesOnResult(result: FightResult): string[] {
  if (result.fighters && result.fighters.length >= 2) return [...result.fighters];
  if (result.winner && result.opponent) return [result.winner, result.opponent];
  return [];
}

function resultForFighter(result: FightResult, slug: string): FighterResult | null {
  const outcome = fightOutcome(result);
  if (outcome === "draw") return "draw";
  if (outcome === "no_contest") return "nc";
  if (!result.winner) return null;
  if (personSlug(result.winner) === slug) return "win";
  return "loss";
}

function opponentName(result: FightResult, slug: string): string | null {
  const names = namesOnResult(result);
  const other = names.find((name) => personSlug(name) !== slug);
  if (other) return other;
  if (result.opponent && personSlug(result.opponent) !== slug) return result.opponent;
  return null;
}

function eventDay(
  eventSlug: string,
  fightSlug: string,
  events: readonly CalendarEvent[],
  boutDates: readonly BoutDate[],
): { date: string; title: string | null } | null {
  const matched = events.filter((event) => event.eventSlug === eventSlug && event.datePrecision !== "month" && event.datePrecision !== "window");
  const days = new Map<string, string | null>();
  for (const event of matched) {
    const day = dayFromStart(event.start);
    if (!day) continue;
    days.set(day, event.title?.trim() || null);
  }
  if (days.size === 1) {
    const [date, title] = [...days.entries()][0]!;
    return { date, title };
  }
  if (days.size > 1) return null;
  const posted = boutDates.filter((row) => row.event === eventSlug && row.fightSlug === fightSlug && civilDate(row.date));
  const unique = new Set(posted.map((row) => row.date));
  if (unique.size !== 1) return null;
  return { date: [...unique][0]!, title: null };
}

/**
 * A settled fight result can add one career row when the bout date is already known.
 * Stats stay empty. A posted row is not replaced. Blank result, method, round, and time are filled.
 */
export function appendSettledResults(
  fights: readonly CareerFight[],
  input: {
    slug: string;
    results: readonly FightResult[];
    events?: readonly CalendarEvent[];
    boutDates?: readonly BoutDate[];
  },
): CareerFight[] {
  const next = fights.map((fight) => ({ ...fight }));
  const events = input.events ?? [];
  const boutDates = input.boutDates ?? [];
  for (const result of input.results) {
    if (result.status !== "final") continue;
    const names = namesOnResult(result);
    const involved =
      names.some((name) => personSlug(name) === input.slug) ||
      personSlug(result.winner) === input.slug ||
      (result.opponent ? personSlug(result.opponent) === input.slug : false);
    if (!involved) continue;
    const opponent = opponentName(result, input.slug);
    const when = eventDay(result.event, result.fightSlug, events, boutDates);
    if (!opponent || !when) continue;
    const mark = resultForFighter(result, input.slug);
    const stored = next.find(
      (fight) => fight.date === when.date && personSlug(fight.opponent) === personSlug(opponent),
    );
    if (stored) {
      if (stored.result == null && mark) stored.result = mark;
      if (stored.method == null && result.method) stored.method = result.method;
      if (stored.round == null) stored.round = result.round;
      if (stored.time == null) stored.time = result.time;
      if (stored.event == null && when.title) stored.event = when.title;
      continue;
    }
    next.push({
      date: when.date,
      event: when.title ?? result.event,
      opponent,
      result: mark,
      method: result.method,
      round: result.round,
      time: result.time,
      sigStrikesLanded: null,
      sigStrikesAttempted: null,
      totalStrikesLanded: null,
      totalStrikesAttempted: null,
      takedownsLanded: null,
      takedownsAttempted: null,
      subAttempts: null,
      controlTimeSeconds: null,
      knockdowns: null,
      fromResult: true,
    });
  }
  return sortCareerFights(next);
}
