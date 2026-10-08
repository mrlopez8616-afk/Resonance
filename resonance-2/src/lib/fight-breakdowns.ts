import type { Bet, BetTier } from "@/lib/bets";
import {
  betEventSlug,
  fightersFromTitle,
  segmentHint,
  sortCardFights,
  type BoutSegment,
  type DeskFight,
} from "@/lib/fight-desk";
import type { FightResult } from "@/lib/fight-results";
import {
  fightBySlug,
  personSlug,
  UFC_332_ID,
  type CatalogFight,
  type FighterSide,
  type FightSegmentId,
  type OddsBook,
} from "@/lib/ufc332";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CLOCK = /^\d{1,2}:\d{2}\s*(?:AM|PM)$/i;
const BOOKS = ["FanDuel", "Caesars", "BetRivers", "BetWay", "Unibet", "Kalshi"] as const;

const STAT_ORDER = [
  "Record (Sherdog)",
  "UFC record",
  "Streak",
  "Age",
  "Height",
  "Reach",
  "Stance",
  "Sig. str. landed/min",
  "Striking accuracy",
  "Sig. str. absorbed/min",
  "Striking defense",
  "Takedowns/15 min",
  "TD accuracy",
  "TD defense",
  "Sub attempts/15 min",
  "Wins (KO/Sub/Dec)",
  "Last fight",
  "Days since",
  "Camp",
];

const FIGHTER_STATS: { key: string; label: string }[] = [
  { key: "record", label: "Record (Sherdog)" },
  { key: "ufc_record", label: "UFC record" },
  { key: "streak", label: "Streak" },
  { key: "age", label: "Age" },
  { key: "height", label: "Height" },
  { key: "reach", label: "Reach" },
  { key: "stance", label: "Stance" },
  { key: "slpm", label: "Sig. str. landed/min" },
  { key: "stracc", label: "Striking accuracy" },
  { key: "sapm", label: "Sig. str. absorbed/min" },
  { key: "strdef", label: "Striking defense" },
  { key: "tdavg", label: "Takedowns/15 min" },
  { key: "tdacc", label: "TD accuracy" },
  { key: "tddef", label: "TD defense" },
  { key: "subavg", label: "Sub attempts/15 min" },
  { key: "last_fight", label: "Last fight" },
  { key: "days_since", label: "Days since" },
  { key: "camp", label: "Camp" },
];

export class BreakdownWriteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BreakdownWriteError";
    this.status = status;
  }
}

export type BreakdownOdds = {
  pick?: string;
  betPct?: number;
  noVigPct?: number;
  kalshiFairPct?: number;
  medianMl?: { a?: number; b?: number };
};

export type BreakdownSideLinks = {
  sherdog?: string;
  ufcstats?: string;
  ufccom?: string;
  highlight?: { url: string; title: string; channel?: string };
  last3?: string[];
  books?: Record<string, number>;
  noVigPct?: number;
  medianMl?: number;
};

export type BreakdownLinks = {
  a?: BreakdownSideLinks;
  b?: BreakdownSideLinks;
};

export type BreakdownStats = {
  a: Record<string, string>;
  b: Record<string, string>;
};

/** One stored row. Text fields are null when the post omitted them. */
export type FightBreakdown = {
  eventSlug: string;
  fightSlug: string;
  fightN: number | null;
  card: string | null;
  slot: string | null;
  division: string | null;
  rounds: number | null;
  aName: string | null;
  bName: string | null;
  lean: string | null;
  conf: string | null;
  tier: BetTier | null;
  method: string | null;
  why: string | null;
  xFactor: string | null;
  edges: string[];
  odds: BreakdownOdds | null;
  stats: BreakdownStats | null;
  links: BreakdownLinks | null;
  /**
   * 1 is the first fight of the night.
   * Null when the post omitted it. Display then derives it from fightN.
   */
  boutOrder: number | null;
};

export type BreakdownWriteResult = {
  eventSlug: string;
  fightSlug: string;
  deduped: boolean;
  breakdown: FightBreakdown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortKeys(value[key]);
  return sorted;
}

export function canonicalBreakdown(row: FightBreakdown): string {
  return JSON.stringify(sortKeys(row));
}

export function sameBreakdown(left: FightBreakdown, right: FightBreakdown): boolean {
  return canonicalBreakdown(left) === canonicalBreakdown(right);
}

function readSlug(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!SLUG.test(text)) {
    throw new BreakdownWriteError(`${label} must be a lowercase slug.`);
  }
  return text;
}

function readText(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new BreakdownWriteError(`${label} must be a string.`);
  const text = value.trim();
  return text || null;
}

function readInt(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BreakdownWriteError(`${label} must be an integer.`);
  }
  return value;
}

/** 1 is the first fight of the night. Omitted stays null so display can derive it. */
function readBoutOrder(value: unknown): number | null {
  const order = readInt(value, "boutOrder");
  if (order != null && order < 1) {
    throw new BreakdownWriteError("boutOrder must be a positive integer.");
  }
  return order;
}

function readNumber(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BreakdownWriteError(`${label} must be a number.`);
  }
  return value;
}

function readTier(value: unknown): BetTier | null {
  if (value == null) return null;
  if (value === "STRONG" || value === "LEAN") return value;
  throw new BreakdownWriteError("tier must be STRONG, LEAN, or null.");
}

function readEdges(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BreakdownWriteError("edges must be an array of strings.");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readStatMap(value: unknown, label: string): Record<string, string> {
  if (value == null) return {};
  if (!isRecord(value)) throw new BreakdownWriteError(`${label} must be an object.`);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && Number.isFinite(item)) {
      out[key] = String(item);
      continue;
    }
    if (typeof item === "string" && item.trim()) {
      out[key] = item.trim();
      continue;
    }
    throw new BreakdownWriteError(`${label}.${key} must be a string or number.`);
  }
  return out;
}

function readStats(value: unknown): BreakdownStats | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new BreakdownWriteError("stats must be an object.");
  const stats = { a: readStatMap(value.a, "stats.a"), b: readStatMap(value.b, "stats.b") };
  if (Object.keys(stats.a).length === 0 && Object.keys(stats.b).length === 0) return null;
  return stats;
}

function readBooks(value: unknown, label: string): Record<string, number> | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) throw new BreakdownWriteError(`${label} must be an object.`);
  const books: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new BreakdownWriteError(`${label}.${key} must be a number.`);
    }
    books[key] = item;
  }
  return Object.keys(books).length ? books : undefined;
}

function readSideLinks(value: unknown, label: string): BreakdownSideLinks | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) throw new BreakdownWriteError(`${label} must be an object.`);
  const side: BreakdownSideLinks = {};
  const sherdog = readText(value.sherdog, `${label}.sherdog`);
  const ufcstats = readText(value.ufcstats, `${label}.ufcstats`);
  const ufccom = readText(value.ufccom, `${label}.ufccom`);
  if (sherdog) side.sherdog = sherdog;
  if (ufcstats) side.ufcstats = ufcstats;
  if (ufccom) side.ufccom = ufccom;
  if (value.highlight != null) {
    if (!isRecord(value.highlight) || typeof value.highlight.url !== "string" || !value.highlight.url.trim()) {
      throw new BreakdownWriteError(`${label}.highlight needs a url.`);
    }
    side.highlight = {
      url: value.highlight.url.trim(),
      title: typeof value.highlight.title === "string" ? value.highlight.title.trim() : "",
      channel: typeof value.highlight.channel === "string" ? value.highlight.channel.trim() : "",
    };
  }
  if (value.last3 != null) {
    if (!Array.isArray(value.last3) || value.last3.some((item) => typeof item !== "string")) {
      throw new BreakdownWriteError(`${label}.last3 must be an array of strings.`);
    }
    const last3 = value.last3.map((item) => item.trim()).filter(Boolean);
    if (last3.length) side.last3 = last3;
  }
  const books = readBooks(value.books, `${label}.books`);
  if (books) side.books = books;
  const noVigPct = readNumber(value.noVigPct, `${label}.noVigPct`);
  const medianMl = readNumber(value.medianMl, `${label}.medianMl`);
  if (noVigPct != null) side.noVigPct = noVigPct;
  if (medianMl != null) side.medianMl = medianMl;
  return Object.keys(side).length ? side : undefined;
}

function readLinks(value: unknown): BreakdownLinks | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new BreakdownWriteError("links must be an object.");
  const links: BreakdownLinks = {};
  const a = readSideLinks(value.a, "links.a");
  const b = readSideLinks(value.b, "links.b");
  if (a) links.a = a;
  if (b) links.b = b;
  return links.a || links.b ? links : null;
}

function readMedian(value: unknown): BreakdownOdds["medianMl"] | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) throw new BreakdownWriteError("odds.medianMl must be an object.");
  const median: { a?: number; b?: number } = {};
  const a = readNumber(value.a, "odds.medianMl.a");
  const b = readNumber(value.b, "odds.medianMl.b");
  if (a != null) median.a = a;
  if (b != null) median.b = b;
  return median.a == null && median.b == null ? undefined : median;
}

function readOdds(value: unknown): BreakdownOdds | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new BreakdownWriteError("odds must be an object.");
  const odds: BreakdownOdds = {};
  const pick = readText(value.pick, "odds.pick");
  const betPct = readNumber(value.betPct, "odds.betPct");
  const noVigPct = readNumber(value.noVigPct, "odds.noVigPct");
  const kalshiFairPct = readNumber(value.kalshiFairPct, "odds.kalshiFairPct");
  const medianMl = readMedian(value.medianMl);
  if (pick) odds.pick = pick;
  if (betPct != null) odds.betPct = betPct;
  if (noVigPct != null) odds.noVigPct = noVigPct;
  if (kalshiFairPct != null) odds.kalshiFairPct = kalshiFairPct;
  if (medianMl) odds.medianMl = medianMl;
  return Object.keys(odds).length ? odds : null;
}

function blankBreakdown(eventSlug: string, fightSlug: string): FightBreakdown {
  return {
    eventSlug,
    fightSlug,
    fightN: null,
    card: null,
    slot: null,
    division: null,
    rounds: null,
    aName: null,
    bName: null,
    lean: null,
    conf: null,
    tier: null,
    method: null,
    why: null,
    xFactor: null,
    edges: [],
    odds: null,
    stats: null,
    links: null,
    boutOrder: null,
  };
}

function breakdownFromCamel(raw: unknown): FightBreakdown {
  if (!isRecord(raw)) throw new BreakdownWriteError("each breakdown must be an object.");
  const row = blankBreakdown(readSlug(raw.eventSlug, "eventSlug"), readSlug(raw.fightSlug, "fightSlug"));
  row.fightN = readInt(raw.fightN, "fightN");
  row.card = readText(raw.card, "card");
  row.slot = readText(raw.slot, "slot");
  row.division = readText(raw.division, "division");
  row.rounds = readInt(raw.rounds, "rounds");
  row.aName = readText(raw.aName, "aName");
  row.bName = readText(raw.bName, "bName");
  row.lean = readText(raw.lean, "lean");
  row.conf = readText(raw.conf, "conf");
  row.tier = readTier(raw.tier);
  row.method = readText(raw.method, "method");
  row.why = readText(raw.why, "why");
  row.xFactor = readText(raw.xFactor, "xFactor");
  row.edges = readEdges(raw.edges);
  row.odds = readOdds(raw.odds);
  row.stats = readStats(raw.stats);
  row.links = readLinks(raw.links);
  row.boutOrder = readBoutOrder(raw.boutOrder);
  return row;
}

function statMapFromFighter(fighter: Record<string, unknown>): Record<string, string> {
  const stats: Record<string, string> = {};
  for (const field of FIGHTER_STATS) {
    const value = fighter[field.key];
    if (typeof value === "number" && Number.isFinite(value)) stats[field.label] = String(value);
    else if (typeof value === "string") {
      const text = value.trim();
      if (text && !text.toLowerCase().startsWith("not found")) stats[field.label] = text;
    }
  }
  const ko = fighter.wins_ko;
  const sub = fighter.wins_sub;
  const dec = fighter.wins_dec;
  const parts = [ko, sub, dec].map((value) =>
    typeof value === "number" || typeof value === "string" ? String(value).trim() : "",
  );
  if (parts.some(Boolean)) stats["Wins (KO/Sub/Dec)"] = parts.map((part) => part || "—").join(" / ");
  return stats;
}

function numberAt(value: unknown, index: number): number | undefined {
  if (!Array.isArray(value)) return undefined;
  const item = value[index];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function sideLinksFromFighter(
  fighter: Record<string, unknown>,
  index: number,
  card: Record<string, unknown>,
): BreakdownSideLinks | undefined {
  const side: BreakdownSideLinks = {};
  if (typeof fighter.sherdog === "string" && fighter.sherdog.trim()) side.sherdog = fighter.sherdog.trim();
  if (typeof fighter.ufcstats === "string" && fighter.ufcstats.trim()) side.ufcstats = fighter.ufcstats.trim();
  if (typeof fighter.ufccom === "string" && fighter.ufccom.trim()) side.ufccom = fighter.ufccom.trim();
  if (isRecord(fighter.yt) && typeof fighter.yt.url === "string" && fighter.yt.url.trim()) {
    side.highlight = {
      url: fighter.yt.url.trim(),
      title: typeof fighter.yt.title === "string" ? fighter.yt.title.trim() : "",
      channel: typeof fighter.yt.channel === "string" ? fighter.yt.channel.trim() : "",
    };
  }
  if (Array.isArray(fighter.last3) && fighter.last3.every((item) => typeof item === "string")) {
    const last3 = fighter.last3.map((item) => item.trim()).filter(Boolean);
    if (last3.length) side.last3 = last3;
  }
  const books: Record<string, number> = {};
  if (isRecord(fighter.ml_books)) {
    for (const [key, item] of Object.entries(fighter.ml_books)) {
      if (typeof item === "number" && Number.isFinite(item)) books[key] = item;
    }
  }
  if (typeof fighter.kalshi_bfo === "number" && Number.isFinite(fighter.kalshi_bfo)) {
    books.Kalshi = fighter.kalshi_bfo;
  }
  if (Object.keys(books).length) side.books = books;
  const noVigPct = numberAt(card.fair, index);
  const medianMl = numberAt(card.ml_med, index);
  if (noVigPct != null) side.noVigPct = noVigPct;
  if (medianMl != null) side.medianMl = medianMl;
  return Object.keys(side).length ? side : undefined;
}

function dataByNumber(value: unknown): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>();
  if (value == null) return map;
  if (!Array.isArray(value)) throw new BreakdownWriteError("data must be an array of card fights.");
  for (const row of value) {
    if (!isRecord(row) || typeof row.n !== "number" || !Number.isInteger(row.n)) {
      throw new BreakdownWriteError("each data row needs an integer n.");
    }
    map.set(row.n, row);
  }
  return map;
}

function breakdownFromSiteFight(
  eventSlug: string,
  fightN: number,
  fight: Record<string, unknown>,
  card: Record<string, unknown> | null,
): FightBreakdown {
  const row = blankBreakdown(eventSlug, readSlug(fight.fightSlug, "fightSlug"));
  row.fightN = fightN;
  row.boutOrder = readBoutOrder(fight.boutOrder);
  row.lean = readText(fight.lean, "lean");
  row.conf = readText(fight.conf, "conf");
  row.tier = readTier(fight.tier);
  row.method = readText(fight.method, "method");
  row.why = readText(fight.why, "why");
  row.xFactor = readText(fight.x, "x");
  row.edges = readEdges(fight.edges);
  const odds: BreakdownOdds = {};
  const pick = readText(fight.pick, "pick");
  const betPct = readNumber(fight.oddsAsBetPct, "oddsAsBetPct");
  const noVigPct = readNumber(fight.ourNoVigPct, "ourNoVigPct");
  const kalshiFairPct = readNumber(fight.kalshiFairPct, "kalshiFairPct");
  if (pick) odds.pick = pick;
  if (betPct != null) odds.betPct = betPct;
  if (noVigPct != null) odds.noVigPct = noVigPct;
  if (kalshiFairPct != null) odds.kalshiFairPct = kalshiFairPct;
  if (card) {
    const a = numberAt(card.ml_med, 0);
    const b = numberAt(card.ml_med, 1);
    if (a != null || b != null) odds.medianMl = { ...(a != null ? { a } : {}), ...(b != null ? { b } : {}) };
    row.card = readText(card.card, "card");
    row.slot = readText(card.slot, "slot");
    row.division = readText(card.wc, "wc");
    row.rounds = readInt(card.rounds, "rounds");
    if (isRecord(card.A) && typeof card.A.name === "string") row.aName = card.A.name.trim() || null;
    if (isRecord(card.B) && typeof card.B.name === "string") row.bName = card.B.name.trim() || null;
    const links: BreakdownLinks = {};
    if (isRecord(card.A)) {
      const side = sideLinksFromFighter(card.A, 0, card);
      if (side) links.a = side;
    }
    if (isRecord(card.B)) {
      const side = sideLinksFromFighter(card.B, 1, card);
      if (side) links.b = side;
    }
    row.links = links.a || links.b ? links : null;
    const stats = {
      a: isRecord(card.A) ? statMapFromFighter(card.A) : {},
      b: isRecord(card.B) ? statMapFromFighter(card.B) : {},
    };
    row.stats = Object.keys(stats.a).length || Object.keys(stats.b).length ? stats : null;
  }
  row.odds = Object.keys(odds).length ? odds : null;
  return row;
}

function looksLikeDataFile(body: unknown[]): boolean {
  const first = body[0];
  return isRecord(first) && isRecord(first.A) && isRecord(first.B) && typeof first.n === "number" && first.fightSlug == null;
}

/**
 * Accepts `{breakdowns:[...]}`, a bare camelCase array, or a site_analysis.json
 * object (`eventSlug` + `fights` keyed by fight number). An optional `data`
 * array on that object is the data.json card (names, stats, books).
 */
export function parseBreakdownBody(body: unknown): FightBreakdown[] {
  if (Array.isArray(body)) {
    if (body.length === 0) throw new BreakdownWriteError("at least one breakdown is required.");
    if (looksLikeDataFile(body)) {
      throw new BreakdownWriteError(
        "This looks like data.json. POST site_analysis.json, or add this array as data on that object.",
      );
    }
    return body.map((row) => breakdownFromCamel(row));
  }
  if (!isRecord(body)) throw new BreakdownWriteError("JSON object or array is required.");
  if (Array.isArray(body.breakdowns)) {
    if (body.breakdowns.length === 0) throw new BreakdownWriteError("at least one breakdown is required.");
    return body.breakdowns.map((row) => breakdownFromCamel(row));
  }
  const fights = body.fights;
  if (typeof body.eventSlug === "string" && isRecord(fights)) {
    const eventSlug = readSlug(body.eventSlug, "eventSlug");
    const cards = dataByNumber(body.data);
    const keys = Object.keys(fights);
    if (keys.length === 0) throw new BreakdownWriteError("at least one breakdown is required.");
    return keys.map((key) => {
      const fightN = Number(key);
      if (!Number.isInteger(fightN)) {
        throw new BreakdownWriteError(`fight key ${key} must be an integer.`);
      }
      const fight = fights[key];
      if (!isRecord(fight)) throw new BreakdownWriteError(`fight ${key} must be an object.`);
      return breakdownFromSiteFight(eventSlug, fightN, fight, cards.get(fightN) ?? null);
    });
  }
  throw new BreakdownWriteError(
    "Body must be {breakdowns:[...]}, a bare array, or site_analysis.json ({eventSlug, fights}).",
  );
}

function jsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

function intValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function positiveInt(value: unknown): number | null {
  const order = intValue(value);
  return order != null && order >= 1 ? order : null;
}

/** Pull a stored boutOrder out of the links jsonb. The links object itself stays link fields. */
function splitStoredLinks(value: unknown): { boutOrder: number | null; links: unknown } {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "boutOrder")) {
    return { boutOrder: null, links: value };
  }
  const rest: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== "boutOrder") rest[key] = item;
  }
  return {
    boutOrder: positiveInt(value.boutOrder),
    links: Object.keys(rest).length ? rest : null,
  };
}

/** Postgres has no bout_order column. The explicit order rides in the links jsonb. */
export function linksColumn(row: FightBreakdown): unknown {
  if (row.boutOrder == null) return row.links;
  return { ...(row.links ?? {}), boutOrder: row.boutOrder };
}

/** Rebuild a row from fight_breakdowns columns. A bad row is dropped. */
export function breakdownFromColumns(raw: Record<string, unknown>): FightBreakdown | null {
  if (typeof raw.event_slug !== "string" || typeof raw.fight_slug !== "string") return null;
  try {
    const storedLinks = splitStoredLinks(jsonValue(raw.links));
    return breakdownFromCamel({
      eventSlug: raw.event_slug,
      fightSlug: raw.fight_slug,
      fightN: intValue(raw.fight_n),
      card: raw.card,
      slot: raw.slot,
      division: raw.division,
      rounds: intValue(raw.rounds),
      aName: raw.a_name,
      bName: raw.b_name,
      lean: raw.lean,
      conf: raw.conf,
      tier: raw.tier,
      method: raw.method,
      why: raw.why,
      xFactor: raw.x_factor,
      edges: jsonValue(raw.edges) ?? [],
      odds: jsonValue(raw.odds),
      stats: jsonValue(raw.stats),
      links: storedLinks.links,
      boutOrder: storedLinks.boutOrder,
    });
  } catch {
    return null;
  }
}

export function applyBreakdowns(
  rows: readonly FightBreakdown[],
  incoming: readonly FightBreakdown[],
): { rows: FightBreakdown[]; results: BreakdownWriteResult[]; changed: boolean } {
  const next = rows.slice();
  const results: BreakdownWriteResult[] = [];
  let changed = false;
  for (const row of incoming) {
    const index = next.findIndex(
      (stored) => stored.eventSlug === row.eventSlug && stored.fightSlug === row.fightSlug,
    );
    if (index === -1) {
      next.push(row);
      changed = true;
      results.push({ eventSlug: row.eventSlug, fightSlug: row.fightSlug, deduped: false, breakdown: row });
      continue;
    }
    const stored = next[index];
    if (stored && sameBreakdown(stored, row)) {
      results.push({
        eventSlug: row.eventSlug,
        fightSlug: row.fightSlug,
        deduped: true,
        breakdown: stored,
      });
      continue;
    }
    next[index] = row;
    changed = true;
    results.push({ eventSlug: row.eventSlug, fightSlug: row.fightSlug, deduped: false, breakdown: row });
  }
  return { rows: next, results, changed };
}

/**
 * Explicit boutOrder wins.
 * Otherwise boutOrder = max(n) - n + 1 inside the event.
 * site_analysis `n` counts down from the main event, so this is the running order.
 */
export function derivedBoutOrder(
  row: Pick<FightBreakdown, "boutOrder" | "fightN">,
  eventRows: readonly Pick<FightBreakdown, "fightN">[],
): number | null {
  if (row.boutOrder != null) return row.boutOrder;
  if (row.fightN == null) return null;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of eventRows) {
    if (item.fightN != null && item.fightN > max) max = item.fightN;
  }
  if (!Number.isFinite(max)) return null;
  return max - row.fightN + 1;
}

function rowSegment(row: FightBreakdown): BoutSegment | null {
  return row.card ? segmentHint(row.card) : null;
}

export function breakdownsForEvent(
  rows: readonly FightBreakdown[],
  eventSlug: string,
): FightBreakdown[] {
  const eventRows = rows.filter((row) => row.eventSlug === eventSlug);
  return sortCardFights(
    eventRows.map((row) => ({
      row,
      segment: rowSegment(row),
      boutOrder: derivedBoutOrder(row, eventRows),
    })),
  ).map((item) => item.row);
}

function namesFromSlug(slug: string): [string, string] | null {
  const parts = slug.split("-vs-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const label = (part: string) =>
    part
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  return [label(parts[0]), label(parts[1])];
}

function betsOnThisFight(
  bets: readonly Bet[],
  eventSlug: string,
  fightSlug: string,
  events: Parameters<typeof betEventSlug>[1],
): Bet[] {
  return bets.filter(
    (bet) => bet.fightSlug === fightSlug && betEventSlug(bet, events) === eventSlug,
  );
}

function pairedStats(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): { label: string; value: string }[][] {
  const a = left ?? {};
  const b = right ?? {};
  const labels = [
    ...STAT_ORDER.filter((label) => label in a || label in b),
    ...Object.keys({ ...a, ...b })
      .filter((label) => !STAT_ORDER.includes(label))
      .sort(),
  ];
  return [
    labels.map((label) => ({ label, value: a[label] ?? "—" })),
    labels.map((label) => ({ label, value: b[label] ?? "—" })),
  ];
}

function bookRows(books: Record<string, number> | undefined): FighterSide["books"] {
  if (!books) return [];
  const rows: FighterSide["books"] = [];
  for (const book of BOOKS) {
    const moneyline = books[book];
    if (typeof moneyline === "number" && Number.isFinite(moneyline)) {
      rows.push({ book: book as OddsBook, moneyline });
    }
  }
  return rows;
}

function sideFromBreakdown(
  name: string,
  stats: { label: string; value: string }[],
  links: BreakdownSideLinks | undefined,
): FighterSide {
  return {
    name,
    slug: personSlug(name),
    stats,
    last5: links?.last3 ?? [],
    sherdog: links?.sherdog,
    ufcstats: links?.ufcstats,
    noUfcStats: false,
    noVigPct: links?.noVigPct,
    medianMoneyline: links?.medianMl,
    books: bookRows(links?.books),
    highlight: links?.highlight
      ? {
          url: links.highlight.url,
          title: links.highlight.title || links.highlight.url,
          channel: links.highlight.channel || "",
        }
      : undefined,
  };
}

function catalogSegment(card: string | null): FightSegmentId {
  const hint = card ? segmentHint(card) : null;
  if (hint === "early-prelims" || hint === "prelims" || hint === "main-card") return hint;
  return "main-card";
}

function plainEdge(edge: string): string {
  return edge.replace(/\*\*/g, "").trim();
}

function catalogFromParts(
  eventSlug: string,
  fightSlug: string,
  breakdown: FightBreakdown | null,
  bets: readonly Bet[],
): CatalogFight {
  const fromTitle = fightersFromTitle(bets[0]?.fight ?? "");
  const fromSlug = namesFromSlug(fightSlug);
  const aName = breakdown?.aName || fromTitle[0] || fromSlug?.[0] || "Fighter A";
  const bName = breakdown?.bName || fromTitle[1] || fromSlug?.[1] || "Fighter B";
  const [aStats, bStats] = pairedStats(breakdown?.stats?.a, breakdown?.stats?.b);
  const a = sideFromBreakdown(aName, aStats ?? [], breakdown?.links?.a);
  const b = sideFromBreakdown(bName, bStats ?? [], breakdown?.links?.b);
  const pick = breakdown?.odds?.pick ?? null;
  const pickSlug = pick ? personSlug(pick) : "";
  const slugParts = fightSlug.split("-vs-");
  const applyPick = (side: FighterSide, part: string | undefined) => {
    if (!pickSlug || (pickSlug !== side.slug && pickSlug !== part)) return;
    if (side.noVigPct == null && breakdown?.odds?.noVigPct != null) side.noVigPct = breakdown.odds.noVigPct;
  };
  applyPick(a, slugParts[0]);
  applyPick(b, slugParts[1]);
  return {
    n: breakdown?.fightN ?? 0,
    time: breakdown?.slot ?? "",
    iso: "",
    division: breakdown?.division ?? "",
    segment: catalogSegment(breakdown?.card ?? null),
    slug: fightSlug,
    href: `/fights/${eventSlug}/${fightSlug}`,
    A: a,
    B: b,
    lean: breakdown?.lean ?? undefined,
    confidence: breakdown?.conf ?? undefined,
    why: breakdown?.why ?? undefined,
    edges: (breakdown?.edges ?? []).map(plainEdge).filter(Boolean),
    xFactor: breakdown?.xFactor ?? undefined,
  };
}

export type ResolvedFightView =
  | { status: "static"; fight: CatalogFight }
  | { status: "ready"; fight: CatalogFight; bets: Bet[]; eventTitle: string }
  | { status: "missing" };

/**
 * UFC 332 stays on the static catalog.
 * Any other event is ready when a breakdown or a bet exists for that fight slug.
 */
export function resolveFightView(input: {
  eventSlug: string;
  fightSlug: string;
  breakdowns?: readonly FightBreakdown[];
  bets?: readonly Bet[];
  events?: Parameters<typeof betEventSlug>[1];
}): ResolvedFightView {
  const eventSlug = input.eventSlug.trim().toLowerCase();
  const fightSlug = input.fightSlug.trim().toLowerCase();
  if (eventSlug === UFC_332_ID) {
    const fight = fightBySlug(fightSlug);
    return fight ? { status: "static", fight } : { status: "missing" };
  }
  const breakdown =
    (input.breakdowns ?? []).find(
      (row) => row.eventSlug === eventSlug && row.fightSlug === fightSlug,
    ) ?? null;
  const bets = betsOnThisFight(input.bets ?? [], eventSlug, fightSlug, input.events ?? []);
  if (!breakdown && bets.length === 0) return { status: "missing" };
  return {
    status: "ready",
    fight: catalogFromParts(eventSlug, fightSlug, breakdown, bets),
    bets,
    eventTitle: bets[0]?.event || eventSlug,
  };
}

export type FightDetailVisibility = {
  result: boolean;
  matchup: boolean;
  stats: boolean;
  lean: boolean;
  odds: boolean;
  highlights: boolean;
  stake: boolean;
};

function sideHasOdds(side: FighterSide): boolean {
  return (
    side.coinbasePct != null ||
    side.noVigPct != null ||
    side.medianMoneyline != null ||
    side.books.some((row) => row.moneyline != null)
  );
}

/** Empty analysis blocks stay off the page. UFC 332 does not use this. */
export function fightDetailVisibility(
  fight: CatalogFight,
  bets: readonly Bet[],
  result: FightResult | null | undefined,
): FightDetailVisibility {
  const stakes = bets.filter((bet) => bet.fightSlug === fight.slug);
  const statValues = [...fight.A.stats, ...fight.B.stats].some((row) => row.value && row.value !== "—");
  return {
    result: result?.status === "final" || stakes.length > 0,
    matchup: [fight.A, fight.B].some((side) => side.sherdog || side.ufcstats || side.noUfcStats),
    stats: statValues || fight.A.last5.length > 0 || fight.B.last5.length > 0,
    lean: Boolean(fight.lean || fight.confidence || fight.why || fight.xFactor || fight.edges.length),
    odds: sideHasOdds(fight.A) || sideHasOdds(fight.B),
    highlights: Boolean(fight.A.highlight || fight.B.highlight),
    stake: stakes.length > 0,
  };
}

export function detailTimeLabel(time: string): string {
  if (!time) return "";
  return CLOCK.test(time) ? `${time} CT` : time;
}

/** Lean, conf, tier, and why on the bet's fight card, plus a link to the fight page. */
export function annotateDeskFights(
  fights: readonly DeskFight[],
  eventSlug: string,
  breakdowns: readonly FightBreakdown[],
): DeskFight[] {
  const eventRows = breakdowns.filter((row) => row.eventSlug === eventSlug);
  const bySlug = new Map(eventRows.map((row) => [row.fightSlug, row]));
  const annotated = fights.map((fight) => {
    const row = bySlug.get(fight.slug);
    const next: DeskFight = {
      ...fight,
      href: `/fights/${eventSlug}/${fight.slug}`,
    };
    if (!row) return next;
    if (row.lean) next.lean = row.lean;
    if (row.conf) next.conf = row.conf;
    if (row.tier) next.tier = row.tier;
    if (row.why) next.why = row.why;
    if (!next.detail && row.division) next.detail = row.division;
    if (!next.kicker && row.slot) next.kicker = row.slot;
    if (!next.segment && row.card) {
      const hint = segmentHint(row.card);
      if (hint) next.segment = hint;
    }
    const order = derivedBoutOrder(row, eventRows);
    if (order != null) next.boutOrder = order;
    return next;
  });
  return sortCardFights(annotated);
}

export function fightsFromBreakdowns(
  eventSlug: string,
  breakdowns: readonly FightBreakdown[],
): DeskFight[] {
  const rows = breakdownsForEvent(breakdowns, eventSlug);
  return annotateDeskFights(
    rows.map((row) => ({
      slug: row.fightSlug,
      title: row.aName && row.bName ? `${row.aName} vs ${row.bName}` : row.fightSlug,
      kicker: row.slot ?? "",
      detail: row.division ?? "",
      segment: (row.card ? segmentHint(row.card) : null) as BoutSegment | null,
      bets: [],
    })),
    eventSlug,
    rows,
  );
}

/**
 * Breakdown rows are the card. Bets join on fight slug and add stakes.
 * A bet with no breakdown stays on the card, last inside its segment.
 */
export function deskFightsForEvent(
  eventSlug: string,
  betFights: readonly DeskFight[],
  breakdowns: readonly FightBreakdown[],
): DeskFight[] {
  const fromBreakdowns = fightsFromBreakdowns(eventSlug, breakdowns);
  const annotated = annotateDeskFights(betFights, eventSlug, breakdowns);
  const bySlug = new Map(annotated.map((fight) => [fight.slug, fight]));
  const seen = new Set<string>();
  const merged: DeskFight[] = [];
  for (const fight of fromBreakdowns) {
    seen.add(fight.slug);
    const bet = bySlug.get(fight.slug);
    if (!bet) {
      merged.push(fight);
      continue;
    }
    merged.push({
      ...fight,
      ...bet,
      title: bet.title || fight.title,
      detail: bet.detail || fight.detail,
      kicker: bet.kicker || fight.kicker,
      segment: bet.segment ?? fight.segment,
      boutOrder: bet.boutOrder ?? fight.boutOrder,
      bets: bet.bets,
    });
  }
  for (const fight of annotated) {
    if (!seen.has(fight.slug)) merged.push(fight);
  }
  return sortCardFights(merged);
}
