import type { Fill } from "@/data/fills";
import { fightByNumber, founderBetSeeds, UFC_332_EVENT } from "@/lib/ufc332";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";

export const BET_VENUE = "coinbase-predict" as const;
export const BET_TICKER = "UFC" as const;
export const BET_STATUSES = ["open", "won", "lost", "void"] as const;

export type BetStatus = (typeof BET_STATUSES)[number];
export type SettleStatus = Exclude<BetStatus, "open">;

export type Bet = {
  id: string;
  event: string;
  fight: string;
  fightSlug: string;
  pick: string;
  stake: string;
  oddsPct: number;
  /** Ticket payout if the bet hits. Coria's is estimated. */
  payout: string;
  estimated?: boolean;
  status: BetStatus;
  /** Set on won when the settle call sends an actual payout. */
  settledPayout?: string;
  realizedPnl?: string;
  settledAt?: string;
  venue: typeof BET_VENUE;
  ticker: typeof BET_TICKER;
  time: string;
};

export type FightDeskSummary = {
  open: number;
  staked: string;
  stakedLabel: string;
  potential: string;
  potentialLabel: string;
  wins: number;
  losses: number;
  record: string;
  estimated: boolean;
};

export class BetWriteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BetWriteError";
    this.status = status;
  }
}

/** USD with two fraction digits. Sleeve decimal math strips trailing zeros. */
export function money(value: string): string {
  const trimmed = value.trim();
  if (!isDecimalString(trimmed)) {
    throw new BetWriteError("amount must be a decimal string.");
  }
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = abs.split(".");
  return `${negative ? "-" : ""}${whole}.${(frac + "00").slice(0, 2)}`;
}

export function formatUsd(value: string): string {
  const printed = money(value);
  return printed.startsWith("-") ? `-$${printed.slice(1)}` : `$${printed}`;
}

export function sumMoney(values: readonly string[]): string {
  return values.reduce((total, value) => addDecimal(total, money(value)), "0.00");
}

export function realizedPnl(
  stake: string,
  status: SettleStatus,
  payout: string,
): string {
  if (status === "lost") return money(`-${money(stake).replace(/^-/, "")}`);
  if (status === "void") return "0.00";
  return money(subtractDecimal(money(payout), money(stake)));
}

/** Open ticket book. Settled rows stay in the record and leave this sum. */
export function summarizeBets(bets: readonly Bet[]): FightDeskSummary {
  const open = bets.filter((bet) => bet.status === "open");
  const staked = sumMoney(open.map((bet) => bet.stake));
  const potential = sumMoney(open.map((bet) => bet.payout));
  const wins = bets.filter((bet) => bet.status === "won").length;
  const losses = bets.filter((bet) => bet.status === "lost").length;
  return {
    open: open.length,
    staked: money(staked),
    stakedLabel: formatUsd(staked),
    potential: money(potential),
    potentialLabel: formatUsd(potential),
    wins,
    losses,
    record: `${wins}-${losses}`,
    estimated: open.some((bet) => bet.estimated),
  };
}

export function betSeed(): Bet[] {
  return founderBetSeeds().map((row) => {
    const fight = fightByNumber(row.fight);
    if (!fight) {
      throw new BetWriteError(`bet ${row.id} points at missing fight ${row.fight}.`);
    }
    if (fight.A.name !== row.pick && fight.B.name !== row.pick) {
      throw new BetWriteError(
        `bet ${row.id} pick ${row.pick} is not on fight ${row.fight}.`,
      );
    }
    const bet: Bet = {
      id: row.id,
      event: UFC_332_EVENT.name,
      fight: `${fight.A.name} vs ${fight.B.name}`,
      fightSlug: fight.slug,
      pick: row.pick,
      stake: money(row.stake),
      oddsPct: row.oddsPct,
      payout: money(row.payout),
      status: "open",
      venue: BET_VENUE,
      ticker: BET_TICKER,
      time: fight.iso,
    };
    if (row.estimated) bet.estimated = true;
    return bet;
  });
}

export function betToFill(bet: Bet): Fill {
  const fill: Fill = {
    kind: "bet",
    time: bet.time,
    symbol: bet.ticker,
    orderId: bet.id,
    result: bet.status,
    venue: bet.venue,
    idempotencyKey: bet.id,
    event: bet.event,
    fight: bet.fight,
    fightSlug: bet.fightSlug,
    pick: bet.pick,
    stake: bet.stake,
    oddsPct: bet.oddsPct,
    payout: bet.payout,
    betStatus: bet.status,
  };
  if (bet.estimated) {
    fill.estimated = true;
    fill.note = "Payout estimated.";
  }
  if (bet.settledPayout) fill.settledPayout = bet.settledPayout;
  if (bet.realizedPnl) fill.realizedPnl = bet.realizedPnl;
  if (bet.settledAt) fill.settledAt = bet.settledAt;
  return fill;
}

export type SettleRequest = {
  id: string;
  status: SettleStatus;
  settledAt?: string;
  payout?: string;
};

function sameSettlement(current: Bet, next: Bet, request: SettleRequest): boolean {
  if (current.status !== next.status) return false;
  if (current.realizedPnl !== next.realizedPnl) return false;
  if ((current.settledPayout ?? "") !== (next.settledPayout ?? "")) return false;
  if (request.settledAt && current.settledAt !== request.settledAt) return false;
  return current.status !== "open";
}

/**
 * One settlement. The same id + outcome is a no-op.
 * A different status replaces the row. P&L is recomputed, not added.
 */
export function settleBet(
  bet: Bet,
  request: SettleRequest,
  now: string,
): { bet: Bet; deduped: boolean } {
  const wonPayout =
    request.status === "won" ? money(request.payout ?? bet.payout) : undefined;
  const next: Bet = {
    ...bet,
    status: request.status,
    realizedPnl: realizedPnl(bet.stake, request.status, wonPayout ?? bet.payout),
    settledAt: request.settledAt ?? bet.settledAt ?? now,
  };
  if (wonPayout) next.settledPayout = wonPayout;
  else delete next.settledPayout;
  if (sameSettlement(bet, next, request)) {
    return { bet, deduped: true };
  }
  return { bet: next, deduped: false };
}

export function betsOnFight(bets: readonly Bet[], fightSlug: string): Bet[] {
  return bets.filter((bet) => bet.fightSlug === fightSlug);
}

const BET_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ISO_ZONED =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseSettleRequest(raw: unknown): SettleRequest {
  if (!isRecord(raw)) throw new BetWriteError("Each settlement must be an object.");
  const id = asTrimmed(raw.id).toLowerCase();
  if (!BET_ID.test(id)) {
    throw new BetWriteError("id must be a lowercase slug.");
  }
  const status = asTrimmed(raw.status).toLowerCase();
  if (status !== "won" && status !== "lost" && status !== "void") {
    throw new BetWriteError("status must be won, lost, or void.");
  }
  const request: SettleRequest = { id, status };
  const settledAt = asTrimmed(raw.settledAt);
  if (settledAt) {
    if (!ISO_ZONED.test(settledAt) || Number.isNaN(Date.parse(settledAt))) {
      throw new BetWriteError("settledAt must be an ISO-8601 timestamp with an offset or Z.");
    }
    request.settledAt = settledAt;
  }
  const payout = asTrimmed(raw.payout);
  if (payout) {
    if (status !== "won") {
      throw new BetWriteError("payout is only used when status is won.");
    }
    if (!isDecimalString(payout) || payout.startsWith("-")) {
      throw new BetWriteError("payout must be a non-negative decimal string.");
    }
    request.payout = money(payout);
  }
  return request;
}

/** One object, `{ bets: [...] }`, or a bare array. */
export function parseSettleBody(body: unknown): SettleRequest[] {
  if (Array.isArray(body)) {
    if (body.length === 0) throw new BetWriteError("At least one settlement is required.");
    return body.map((item) => parseSettleRequest(item));
  }
  if (!isRecord(body)) throw new BetWriteError("JSON object is required.");
  if (Array.isArray(body.bets)) {
    if (body.bets.length === 0) throw new BetWriteError("At least one settlement is required.");
    return body.bets.map((item) => parseSettleRequest(item));
  }
  return [parseSettleRequest(body)];
}
