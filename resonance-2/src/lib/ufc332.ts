import analysisFile from "@/data/ufc332/analysis.json";
import betFile from "@/data/ufc332/bets.json";
import bfoFile from "@/data/ufc332/bfo.json";
import fightFile from "@/data/ufc332/data.json";
import youtubeFile from "@/data/ufc332/youtube.json";
import { chicagoInstant, formatChicagoIso } from "@/lib/calendar-time";

export const UFC_332_ID = "ufc-332";
export const UFC_332_DATE = "2026-10-03";

/** Card facts stated in the fight-desk brief. Not a sleeve. */
export const UFC_332_EVENT = {
  id: UFC_332_ID,
  name: "UFC 332: Silva vs Wang",
  venue: "Delta Center",
  city: "Salt Lake City",
  date: UFC_332_DATE,
  segments: [
    {
      id: "early-prelims",
      label: "Early prelims",
      start: "3:00 PM CT",
    },
    { id: "prelims", label: "Prelims", start: "5:00 PM CT" },
    { id: "main-card", label: "Main card", start: "7:00 PM CT" },
  ],
} as const;

export type FightSegmentId = (typeof UFC_332_EVENT.segments)[number]["id"];

/**
 * BestFightOdds and YouTube files use a shorter name than the card file.
 * Both strings are in the source files. Bernardo Sopaj is not on this map:
 * bfo.json still has "Benardo Sopaj", and data.json does not.
 */
const SOURCE_NAME: Record<string, string> = {
  "Michael (Mick) Parkin": "Mick Parkin",
  "Imanol Rodriguez Pillado": "Imanol Rodriguez",
};

const BOOKS = [
  "FanDuel",
  "Caesars",
  "BetRivers",
  "BetWay",
  "Unibet",
  "Kalshi",
] as const;

export type OddsBook = (typeof BOOKS)[number];

type RawFighter = {
  name: string;
  record?: string;
  record_ufcstats?: string;
  ufc_record?: string;
  streak?: string;
  age?: string | number;
  height?: string;
  reach?: string;
  stance?: string;
  slpm?: string;
  stracc?: string;
  sapm?: string;
  strdef?: string;
  tdavg?: string;
  tdacc?: string;
  tddef?: string;
  subavg?: string;
  wins_ko?: string;
  wins_sub?: string;
  wins_dec?: string;
  loss_ko?: string;
  loss_sub?: string;
  loss_dec?: string;
  finish_rate?: string;
  last_fight?: string;
  days_since?: number | string;
  camp?: string;
  sherdog?: string;
  ufcstats?: string;
  last5?: string[];
  no_ufc_stats?: boolean;
};

type RawFight = {
  n: number;
  time: string;
  wc: string;
  A: RawFighter;
  B: RawFighter;
  cb?: number[];
  fair?: number[];
  ml_med?: number[];
  raw_imp?: number[];
};

type RawAnalysis = {
  edges?: string[];
  x?: string;
  lean?: string;
  conf?: string;
  why?: string;
};

export type FounderBetSeed = {
  id: string;
  fight: number;
  pick: string;
  stake: string;
  payout: string;
  oddsPct: number;
  estimated?: boolean;
  /** Optional stored override. Omitted seeds use the hub analysis lean. */
  hubLean?: string;
  agreesWithLean?: boolean;
};

export type FighterSide = {
  name: string;
  slug: string;
  stats: { label: string; value: string }[];
  last5: string[];
  sherdog?: string;
  ufcstats?: string;
  noUfcStats: boolean;
  coinbasePct?: number;
  noVigPct?: number;
  medianMoneyline?: number;
  rawImpliedPct?: number;
  books: { book: OddsBook; moneyline: number | null }[];
  highlight?: { url: string; title: string; channel: string };
};

export type CatalogFight = {
  n: number;
  time: string;
  iso: string;
  division: string;
  segment: FightSegmentId;
  slug: string;
  href: string;
  A: FighterSide;
  B: FighterSide;
  lean?: string;
  confidence?: string;
  why?: string;
  edges: string[];
  xFactor?: string;
};

const fightsRaw = fightFile as RawFight[];
const analysisRaw = analysisFile as Record<string, RawAnalysis>;
const bfoRaw = bfoFile as Record<string, Record<string, number>>;
const youtubeRaw = youtubeFile as Record<
  string,
  { url?: string; title?: string; channel?: string }
>;
const betSeedsRaw = betFile as FounderBetSeed[];

const STAT_FIELDS: { key: keyof RawFighter; label: string }[] = [
  { key: "record", label: "Record (Sherdog)" },
  { key: "record_ufcstats", label: "Record (UFCStats)" },
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
  { key: "finish_rate", label: "Finish rate" },
  { key: "last_fight", label: "Last fight" },
  { key: "days_since", label: "Days since" },
  { key: "camp", label: "Camp" },
];

export function sourceName(cardName: string): string {
  return SOURCE_NAME[cardName] ?? cardName;
}

export function personSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fightSlug(a: string, b: string): string {
  return `${personSlug(a)}-vs-${personSlug(b)}`;
}

/** Blank and "not found…" stay an em dash. Present text is shown as stored. */
export function displayValue(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  if (!text || text.toLowerCase().startsWith("not found")) return "—";
  return text;
}

function clock24(label: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!match) return "00:00";
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3].toUpperCase();
  if (suffix === "PM" && hour !== 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function segmentForTime(label: string): FightSegmentId {
  const clock = clock24(label);
  if (clock < "17:00") return "early-prelims";
  if (clock < "19:00") return "prelims";
  return "main-card";
}

function numberAt(values: number[] | undefined, index: number): number | undefined {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function methodLine(fighter: RawFighter, prefix: "wins" | "loss"): string {
  const ko = displayValue(fighter[`${prefix}_ko`]);
  const sub = displayValue(fighter[`${prefix}_sub`]);
  const dec = displayValue(fighter[`${prefix}_dec`]);
  if (ko === "—" && sub === "—" && dec === "—") return "—";
  return `${ko} / ${sub} / ${dec}`;
}

function booksFor(name: string): FighterSide["books"] {
  const row = bfoRaw[sourceName(name)] ?? {};
  return BOOKS.map((book) => ({
    book,
    moneyline: typeof row[book] === "number" ? row[book] : null,
  }));
}

function highlightFor(name: string): FighterSide["highlight"] {
  const row = youtubeRaw[sourceName(name)];
  if (!row?.url || !row.title) return undefined;
  return {
    url: row.url,
    title: row.title,
    channel: row.channel?.trim() || "—",
  };
}

function fighterSide(raw: RawFighter, index: 0 | 1, fight: RawFight): FighterSide {
  const stats = STAT_FIELDS.map((field) => ({
    label: field.label,
    value: displayValue(raw[field.key]),
  }));
  stats.push(
    { label: "Wins KO / Sub / Dec", value: methodLine(raw, "wins") },
    { label: "Losses KO / Sub / Dec", value: methodLine(raw, "loss") },
  );
  const side: FighterSide = {
    name: raw.name,
    slug: personSlug(raw.name),
    stats,
    last5: Array.isArray(raw.last5) ? raw.last5.filter((row) => row.trim()) : [],
    noUfcStats: raw.no_ufc_stats === true,
    books: booksFor(raw.name),
    coinbasePct: numberAt(fight.cb, index),
    noVigPct: numberAt(fight.fair, index),
    medianMoneyline: numberAt(fight.ml_med, index),
    rawImpliedPct: numberAt(fight.raw_imp, index),
  };
  if (typeof raw.sherdog === "string" && raw.sherdog.startsWith("http")) {
    side.sherdog = raw.sherdog;
  }
  if (typeof raw.ufcstats === "string" && raw.ufcstats.startsWith("http")) {
    side.ufcstats = raw.ufcstats;
  }
  const highlight = highlightFor(raw.name);
  if (highlight) side.highlight = highlight;
  return side;
}

function plainEdge(edge: string): string {
  return edge.replace(/\*\*/g, "").trim();
}

function buildFight(raw: RawFight): CatalogFight {
  const analysis = analysisRaw[String(raw.n)] ?? {};
  const slug = fightSlug(raw.A.name, raw.B.name);
  const iso = formatChicagoIso(chicagoInstant(UFC_332_DATE, clock24(raw.time)));
  return {
    n: raw.n,
    time: raw.time,
    iso,
    division: raw.wc,
    segment: segmentForTime(raw.time),
    slug,
    href: `/fights/${UFC_332_ID}/${slug}`,
    A: fighterSide(raw.A, 0, raw),
    B: fighterSide(raw.B, 1, raw),
    lean: analysis.lean?.trim() || undefined,
    confidence: analysis.conf?.trim() || undefined,
    why: analysis.why?.trim() || undefined,
    edges: (analysis.edges ?? []).map(plainEdge).filter(Boolean),
    xFactor: analysis.x?.trim() || undefined,
  };
}

export const ufc332Fights: CatalogFight[] = fightsRaw
  .slice()
  .sort((left, right) => left.n - right.n)
  .map(buildFight);

const bySlug = new Map(ufc332Fights.map((fight) => [fight.slug, fight]));
const byNumber = new Map(ufc332Fights.map((fight) => [fight.n, fight]));

export function fightBySlug(slug: string): CatalogFight | null {
  return bySlug.get(slug) ?? null;
}

export function fightByNumber(n: number): CatalogFight | null {
  return byNumber.get(n) ?? null;
}

export function fightsInSegment(segment: FightSegmentId): CatalogFight[] {
  return ufc332Fights.filter((fight) => fight.segment === segment);
}

export function founderBetSeeds(): FounderBetSeed[] {
  return betSeedsRaw.map((row) => ({ ...row }));
}

export function unmatchedOddsNames(): string[] {
  const used = new Set(
    ufc332Fights.flatMap((fight) => [
      sourceName(fight.A.name),
      sourceName(fight.B.name),
    ]),
  );
  return Object.keys(bfoRaw)
    .filter((name) => !used.has(name))
    .sort();
}

export function fightersMissingHighlights(): string[] {
  return ufc332Fights.flatMap((fight) =>
    [fight.A, fight.B]
      .filter((side) => !side.highlight)
      .map((side) => side.name),
  );
}
