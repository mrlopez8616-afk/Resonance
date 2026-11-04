import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A bridge snapshot is a few kilobytes. Reject anything larger before parse. */
export const FACTORIO_BODY_LIMIT = 256_000;

/** Wall-clock age that marks a connected save as stale. */
export const FACTORIO_STALE_MS = 30 * 60 * 1000;

export const FACTORIO_HEADER = "x-factorio-token";
export const FACTORIO_HEADER_NAME = "X-Factorio-Token";
export const FACTORIO_URL = "https://resonance3.vercel.app/api/ingest/factorio";

const NAME_LIMIT = 80;
const RATE_LIMIT = 15;
const MAP_LIMIT = 24;
const PLAYER_LIMIT = 16;

const SCIENCE_ORDER = [
  "automation-science-pack",
  "logistic-science-pack",
  "military-science-pack",
  "chemical-science-pack",
  "production-science-pack",
  "utility-science-pack",
  "space-science-pack",
];

const MACHINE_ORDER = ["assembling-machine", "furnace", "mining-drill", "lab"];

export type FactorioRate = { name: string; perMin: number };
export type FactorioCount = { name: string; total: number };
export type FactorioPlayer = {
  name: string;
  connected: boolean;
  onlineHours: number | null;
  afkMinutes: number | null;
};

export type FactorioSnapshot = {
  tick: number;
  playHours: number;
  rockets: number;
  technologies: number;
  currentResearch: string | null;
  researchProgress: number | null;
  players: FactorioPlayer[];
  production: FactorioRate[];
  consumption: FactorioRate[];
  science: FactorioCount[];
  machines: FactorioCount[];
  surfaces: string[];
  gameTime: string | null;
  reason: string | null;
  source: string;
  version: string | null;
};

export type FactorioHomeModel = {
  unavailable: boolean;
  playHours: number | null;
  rockets: number | null;
  stale: boolean;
};

export type FactorioChartPoint = {
  tick: number;
  playHours: number;
  rockets: number;
};

/** One stored snapshot, ready for the node page. */
export type FactorioLatest = {
  tick: number;
  playHours: number;
  rockets: number;
  technologies: number;
  currentResearch: string | null;
  researchProgress: number | null;
  players: FactorioPlayer[];
  production: FactorioRate[];
  science: FactorioCount[];
  machines: FactorioCount[];
  receivedAt: string;
};

export type FactorioChartGeometry = {
  rockets: string;
  hours: string;
};

export function newFactorioToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashFactorioToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compare a presented token with the stored sha256 hex digest. */
export function factorioTokenMatches(provided: string, storedHex: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = /^[0-9a-f]{64}$/i.test(storedHex) ? Buffer.from(storedHex, "hex") : Buffer.alloc(0);
  if (right.length !== left.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function factorioItemLabel(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPlayHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}h`;
}

export function formatPerMinute(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 1;
  const rounded = Number(value.toFixed(digits));
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(rounded)}/min`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function factorioPlaying(players: readonly FactorioPlayer[]): boolean {
  return players.some((player) => player.connected);
}

/** Stale only while the latest snapshot still says a player is connected. */
export function factorioFeedStale(input: { receivedAt: string; playing: boolean; now: number }): boolean {
  if (!input.playing) return false;
  const stamp = Date.parse(input.receivedAt);
  if (!Number.isFinite(stamp)) return false;
  return input.now - stamp > FACTORIO_STALE_MS;
}

export function sampleChartPoints<T>(points: readonly T[], max = 240): T[] {
  if (points.length <= max) return [...points];
  const last = points.length - 1;
  const picked = new Set<number>([0, last]);
  for (let index = 1; index < max - 1; index += 1) {
    picked.add(Math.round((index * last) / (max - 1)));
  }
  return [...picked]
    .sort((left, right) => left - right)
    .map((index) => points[index] as T);
}

/**
 * Two polylines on their own scales. Null until a second snapshot exists,
 * because one point is not a trend.
 */
export function factorioChartGeometry(points: readonly FactorioChartPoint[]): FactorioChartGeometry | null {
  if (points.length < 2) return null;
  const shown = sampleChartPoints(points);
  return {
    rockets: polyline(shown.map((point) => point.rockets)),
    hours: polyline(shown.map((point) => point.playHours)),
  };
}

function polyline(values: readonly number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const left = 8;
  const right = 312;
  const top = 10;
  const bottom = 78;
  return values
    .map((value, index) => {
      const x = left + (index * (right - left)) / (values.length - 1);
      const y = bottom - ((value - min) / span) * (bottom - top);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function wholeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > NAME_LIMIT) return null;
  return name;
}

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function rates(value: unknown): FactorioRate[] {
  if (!Array.isArray(value)) return [];
  const rows: FactorioRate[] = [];
  for (const item of value) {
    if (rows.length >= RATE_LIMIT) break;
    const record = asRecord(item);
    if (!record) continue;
    const name = cleanName(record.name);
    const perMin = finiteNumber(record.per_min);
    if (!name || perMin === null) continue;
    rows.push({ name, perMin });
  }
  return rows;
}

function counts(value: unknown): FactorioCount[] {
  const record = asRecord(value);
  if (!record) return [];
  const rows: FactorioCount[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (rows.length >= MAP_LIMIT) break;
    const name = cleanName(key);
    const total = finiteNumber(raw);
    if (!name || total === null || total < 0) continue;
    rows.push({ name, total });
  }
  return rows;
}

function players(value: unknown): FactorioPlayer[] {
  if (!Array.isArray(value)) return [];
  const rows: FactorioPlayer[] = [];
  for (const item of value) {
    if (rows.length >= PLAYER_LIMIT) break;
    const record = asRecord(item);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name.trim().slice(0, NAME_LIMIT) : "";
    const online = finiteNumber(record.online_hours);
    const afk = finiteNumber(record.afk_minutes);
    rows.push({
      name,
      connected: record.connected === true,
      onlineHours: online !== null && online >= 0 ? online : null,
      afkMinutes: afk !== null && afk >= 0 ? afk : null,
    });
  }
  return rows;
}

function surfaces(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const rows: string[] = [];
  for (const item of value) {
    const name = cleanName(item);
    if (!name || rows.length >= 12) continue;
    rows.push(name);
  }
  return rows;
}

/** Null when the body is not a bridge snapshot with a tick. */
export function parseFactorioSnapshot(body: unknown): FactorioSnapshot | null {
  const record = asRecord(body);
  if (!record) return null;
  const tick = wholeNumber(record.tick);
  const playHours = finiteNumber(record.play_hours);
  const force = asRecord(record.force);
  const rockets = force ? wholeNumber(force.rockets_launched) : null;
  const technologies = force ? wholeNumber(force.technologies_researched) : null;
  if (
    tick === null ||
    tick < 0 ||
    tick > Number.MAX_SAFE_INTEGER ||
    playHours === null ||
    playHours < 0 ||
    rockets === null ||
    rockets < 0 ||
    technologies === null ||
    technologies < 0
  ) {
    return null;
  }
  const progress = force ? finiteNumber(force.research_progress) : null;
  const research = force ? cleanName(force.current_research) : null;
  return {
    tick,
    playHours,
    rockets,
    technologies,
    currentResearch: research,
    researchProgress: progress === null ? null : Math.min(1, Math.max(0, progress)),
    players: players(record.players),
    production: rates(record.production),
    consumption: rates(record.consumption),
    science: orderCounts(counts(record.science_produced), SCIENCE_ORDER),
    machines: orderCounts(counts(record.machines), MACHINE_ORDER),
    surfaces: surfaces(record.surfaces),
    gameTime: shortText(record.timestamp, 80),
    reason: shortText(record.reason, 40),
    source: shortText(record.source, 80) ?? "resonance-bridge",
    version: shortText(record.version, 40),
  };
}

function orderCounts(rows: FactorioCount[], order: readonly string[]): FactorioCount[] {
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...rows].sort((left, right) => {
    const leftRank = rank.get(left.name) ?? order.length;
    const rightRank = rank.get(right.name) ?? order.length;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name);
  });
}

export function numericText(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, "") || "0";
}
