import resultFile from "@/data/ufc332/results.json";
import { fightByNumber, fightBySlug, UFC_332_ID, ufc332Fights } from "@/lib/ufc332";

export const FIGHT_RESULT_STATUSES = ["final", "pending"] as const;
export type FightResultStatus = (typeof FIGHT_RESULT_STATUSES)[number];

export type FightResult = {
  event: string;
  fightSlug: string;
  winner: string;
  method: string;
  round: number;
  time: string;
  opponent?: string;
  source?: string;
  status: FightResultStatus;
};

type FightResultSeed = {
  fight: number;
  winner: string;
  method: string;
  round: number;
  time: string;
  source?: string;
};

const TIME = /^(\d{1,2}):(\d{2})$/;

export class FightResultWriteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FightResultWriteError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readTime(value: unknown): string {
  const time = asTrimmed(value);
  const match = TIME.exec(time);
  if (!match) throw new FightResultWriteError("time must look like 3:35.");
  const seconds = Number(match[2]);
  if (seconds > 59) throw new FightResultWriteError("time seconds must be 00 through 59.");
  return `${Number(match[1])}:${match[2]}`;
}

function readRound(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new FightResultWriteError("round must be an integer from 1 to 5.");
  }
  return value;
}

/** Card facts for UFC 332. Talbott and Silva vs Wang Cong are omitted on purpose. */
export function fightResultSeed(): FightResult[] {
  return (resultFile as FightResultSeed[]).map((row) => {
    const fight = fightByNumber(row.fight);
    if (!fight) {
      throw new FightResultWriteError(`result seed points at missing fight ${row.fight}.`);
    }
    if (row.winner !== fight.A.name && row.winner !== fight.B.name) {
      throw new FightResultWriteError(
        `result seed winner ${row.winner} is not on fight ${row.fight}.`,
      );
    }
    const result: FightResult = {
      event: UFC_332_ID,
      fightSlug: fight.slug,
      winner: row.winner,
      opponent: row.winner === fight.A.name ? fight.B.name : fight.A.name,
      method: row.method.trim(),
      round: readRound(row.round),
      time: readTime(row.time),
      status: "final",
    };
    if (row.source?.trim()) result.source = row.source.trim();
    return result;
  });
}

export function fallbackFightResults(): FightResult[] {
  return fightResultSeed();
}

export function parseFightResult(raw: unknown): FightResult {
  if (!isRecord(raw)) throw new FightResultWriteError("Each result must be an object.");
  const event = asTrimmed(raw.event).toLowerCase();
  if (event !== UFC_332_ID) throw new FightResultWriteError("event must be ufc-332.");
  const fightSlug = asTrimmed(raw.fightSlug).toLowerCase();
  const fight = fightBySlug(fightSlug);
  if (!fight) throw new FightResultWriteError(`Unknown fight slug ${fightSlug || "(blank)"}.`);
  const winner = asTrimmed(raw.winner);
  if (winner !== fight.A.name && winner !== fight.B.name) {
    throw new FightResultWriteError("winner must be a fighter on that bout.");
  }
  const method = asTrimmed(raw.method);
  if (!method || method.length > 80) {
    throw new FightResultWriteError("method is required.");
  }
  const statusText = asTrimmed(raw.status).toLowerCase();
  let status: FightResultStatus = "final";
  if (statusText) {
    if (statusText !== "final" && statusText !== "pending") {
      throw new FightResultWriteError("status must be final or pending.");
    }
    status = statusText;
  }
  const result: FightResult = {
    event,
    fightSlug: fight.slug,
    winner,
    opponent: winner === fight.A.name ? fight.B.name : fight.A.name,
    method,
    round: readRound(raw.round),
    time: readTime(raw.time),
    status,
  };
  const opponent = asTrimmed(raw.opponent);
  if (opponent) {
    if (opponent !== fight.A.name && opponent !== fight.B.name) {
      throw new FightResultWriteError("opponent must be a fighter on that bout.");
    }
    if (opponent === winner) throw new FightResultWriteError("opponent must be the other fighter.");
    result.opponent = opponent;
  }
  const source = asTrimmed(raw.source);
  if (source) {
    if (source.length > 500) throw new FightResultWriteError("source is too long.");
    result.source = source;
  }
  return result;
}

/** One object or a bare array. Does not settle bets. */
export function parseFightResultBody(body: unknown): FightResult[] {
  if (Array.isArray(body)) {
    if (body.length === 0) throw new FightResultWriteError("At least one result is required.");
    return body.map((item) => parseFightResult(item));
  }
  return [parseFightResult(body)];
}

export function mergeFightResult(current: FightResult, incoming: FightResult): FightResult {
  return {
    ...incoming,
    opponent: incoming.opponent ?? current.opponent,
    source: incoming.source ?? current.source,
  };
}

export function sameFightResult(current: FightResult, incoming: FightResult): boolean {
  const merged = mergeFightResult(current, incoming);
  return (
    current.event === merged.event &&
    current.fightSlug === merged.fightSlug &&
    current.winner === merged.winner &&
    current.method === merged.method &&
    current.round === merged.round &&
    current.time === merged.time &&
    current.status === merged.status &&
    (current.opponent ?? "") === (merged.opponent ?? "") &&
    (current.source ?? "") === (merged.source ?? "")
  );
}

export function formatFightResult(result: FightResult | null | undefined): string {
  if (!result || result.status !== "final") return "Pending";
  const who = result.opponent ? `${result.winner} def. ${result.opponent}` : result.winner;
  return `${who} · ${result.method} · R${result.round} ${result.time}`;
}

export function formatEventResultLine(
  fights: readonly { slug: string }[],
  results: readonly FightResult[],
): string {
  const bySlug = new Map(results.map((row) => [row.fightSlug, row]));
  let finals = 0;
  for (const fight of fights) {
    if (bySlug.get(fight.slug)?.status === "final") finals += 1;
  }
  const pending = fights.length - finals;
  if (finals === 0) return "Pending";
  const finalLabel = finals === 1 ? "1 final" : `${finals} finals`;
  if (pending === 0) return finalLabel;
  return `${finalLabel} · ${pending} pending`;
}

export function resultForFight(
  results: readonly FightResult[],
  fightSlug: string,
): FightResult | null {
  return results.find((row) => row.fightSlug === fightSlug) ?? null;
}

export function ufc332ResultLine(results: readonly FightResult[]): string {
  return formatEventResultLine(ufc332Fights, results);
}
