import type { BetFill } from "@/data/fills";
import { fightByNumber, fightBySlug, founderBetSeeds, UFC_332_EVENT } from "@/lib/ufc332";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";

export const BET_VENUE = "coinbase-predict" as const;
export const BET_TICKER = "UFC" as const;
export const BET_STATUSES = ["open", "won", "lost", "void", "sold"] as const;

export type BetStatus = (typeof BET_STATUSES)[number];
export type SettleStatus = Exclude<BetStatus, "open">;

export type Bet = {
  id: string;
  event: string;
  fight: string;
  fightSlug: string;
  pick: string;
  /** Full name of the fighter the hub analysis leaned to. */
  hubLean?: string;
  /** True when the founder pick is that lean. */
  agreesWithLean?: boolean;
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
  /**
   * Coinbase order id. Null means it is not in yet; the log prints pending.
   * Omitted rows use the bet id.
   */
  orderId?: string | null;
  /** Highest seed-correction version already applied. A later edit is left alone. */
  correctionVersion?: number;
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

/** Realized P&L. Zero stays unsigned. A gain gets a plus. */
export function formatSignedUsd(value: string): string {
  const printed = money(value);
  if (printed.startsWith("-")) return `-$${printed.slice(1)}`;
  if (printed === "0.00") return "$0.00";
  return `+$${printed}`;
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
  // won and sold: proceeds minus stake. Sold proceeds live in payout.
  return money(subtractDecimal(money(payout), money(stake)));
}

/** Log and fight pages say sold early. The stored status stays sold. */
export function betStatusLabel(status: BetStatus): string {
  return status === "sold" ? "sold early" : status;
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

export type WinLoss = {
  wins: number;
  losses: number;
  record: string;
};

function winLoss(wins: number, losses: number): WinLoss {
  return { wins, losses, record: `${wins}-${losses}` };
}

export type LeanScorecard = {
  founder: WinLoss;
  hub: WinLoss;
  withLean: WinLoss;
  againstLean: WinLoss;
  voids: number;
  /** Closed early. Not a win or a loss. */
  sold: number;
  open: number;
};

/**
 * Settled tickets only. A void is neither a win nor a loss.
 * Hub lean won when the lean fighter won: the bet result when the pick
 * agreed, and the inverse when the founder went against the lean.
 */
export function scoreBets(bets: readonly Bet[]): LeanScorecard {
  let founderWins = 0;
  let founderLosses = 0;
  let hubWins = 0;
  let hubLosses = 0;
  let withWins = 0;
  let withLosses = 0;
  let againstWins = 0;
  let againstLosses = 0;
  let voids = 0;
  let sold = 0;
  let open = 0;

  for (const bet of bets) {
    if (bet.status === "open") {
      open += 1;
      continue;
    }
    if (bet.status === "void") {
      voids += 1;
      continue;
    }
    if (bet.status === "sold") {
      sold += 1;
      continue;
    }
    const won = bet.status === "won";
    if (won) founderWins += 1;
    else founderLosses += 1;
    if (typeof bet.agreesWithLean !== "boolean") continue;
    const hubWon = bet.agreesWithLean ? won : !won;
    if (hubWon) hubWins += 1;
    else hubLosses += 1;
    if (bet.agreesWithLean) {
      if (won) withWins += 1;
      else withLosses += 1;
    } else if (won) againstWins += 1;
    else againstLosses += 1;
  }

  return {
    founder: winLoss(founderWins, founderLosses),
    hub: winLoss(hubWins, hubLosses),
    withLean: winLoss(withWins, withLosses),
    againstLean: winLoss(againstWins, againstLosses),
    voids,
    sold,
    open,
  };
}

export type UfcBookSummary = {
  count: number;
  wins: number;
  losses: number;
  voids: number;
  sold: number;
  record: string;
  totalStaked: string;
  totalStakedLabel: string;
  realizedPnl: string;
  realizedPnlLabel: string;
  open: number;
  openStake: string;
  openStakeLabel: string;
  openPotential: string;
  openPotentialLabel: string;
  estimated: boolean;
  tileLabel: string;
};

function settledPnlAmount(bet: Bet): string | null {
  if (bet.status === "open") return null;
  if (bet.realizedPnl && isDecimalString(bet.realizedPnl)) return money(bet.realizedPnl);
  return realizedPnl(bet.stake, bet.status, bet.settledPayout ?? bet.payout);
}

/** Whole UFC book from the bets store. Realized P&L is the sum of settled rows. */
export function summarizeUfcBook(bets: readonly Bet[]): UfcBookSummary {
  const wins = bets.filter((bet) => bet.status === "won").length;
  const losses = bets.filter((bet) => bet.status === "lost").length;
  const voids = bets.filter((bet) => bet.status === "void").length;
  const sold = bets.filter((bet) => bet.status === "sold").length;
  const openBets = bets.filter((bet) => bet.status === "open");
  const totalStaked = money(sumMoney(bets.map((bet) => bet.stake)));
  const openStake = money(sumMoney(openBets.map((bet) => bet.stake)));
  const openPotential = money(sumMoney(openBets.map((bet) => bet.payout)));
  const realized = money(
    sumMoney(
      bets.flatMap((bet) => {
        const pnl = settledPnlAmount(bet);
        return pnl ? [pnl] : [];
      }),
    ),
  );
  const record = `${wins}-${losses}`;
  const realizedPnlLabel = formatSignedUsd(realized);
  return {
    count: bets.length,
    wins,
    losses,
    voids,
    sold,
    record,
    totalStaked,
    totalStakedLabel: formatUsd(totalStaked),
    realizedPnl: realized,
    realizedPnlLabel,
    open: openBets.length,
    openStake,
    openStakeLabel: formatUsd(openStake),
    openPotential,
    openPotentialLabel: formatUsd(openPotential),
    estimated: openBets.some((bet) => bet.estimated),
    tileLabel: `${record} · ${realizedPnlLabel}`,
  };
}

export type OptionalLean = {
  hubLean?: string;
  agreesWithLean?: boolean;
};

export function readOptionalLean(raw: Record<string, unknown>): OptionalLean {
  const lean: OptionalLean = {};
  if (typeof raw.hubLean === "string" && raw.hubLean.trim()) {
    lean.hubLean = raw.hubLean.trim();
  }
  if (typeof raw.agreesWithLean === "boolean") lean.agreesWithLean = raw.agreesWithLean;
  return lean;
}

/** Hub analysis lean for a catalog fight. Null when this card has no lean. */
export function catalogLean(
  bet: Pick<Bet, "fightSlug" | "pick">,
): { hubLean: string; agreesWithLean: boolean } | null {
  const hubLean = fightBySlug(bet.fightSlug)?.lean?.trim();
  if (!hubLean) return null;
  return { hubLean, agreesWithLean: bet.pick === hubLean };
}

/**
 * Keep a stored lean. Fill only missing fields from the catalog.
 * An explicit hubLean or agreesWithLean is left as written.
 */
export function withStoredLean(bet: Bet, override?: OptionalLean): Bet {
  const writtenHub =
    typeof override?.hubLean === "string" && override.hubLean.trim()
      ? override.hubLean.trim()
      : bet.hubLean?.trim();
  const writtenAgrees =
    typeof override?.agreesWithLean === "boolean" ? override.agreesWithLean : bet.agreesWithLean;

  let hubLean = writtenHub || undefined;
  let agreesWithLean = typeof writtenAgrees === "boolean" ? writtenAgrees : undefined;
  if (!hubLean || typeof agreesWithLean !== "boolean") {
    const derived = catalogLean(bet);
    if (!hubLean && derived) hubLean = derived.hubLean;
    if (typeof agreesWithLean !== "boolean" && hubLean) agreesWithLean = bet.pick === hubLean;
  }
  if (!hubLean || typeof agreesWithLean !== "boolean") return bet;
  if (bet.hubLean === hubLean && bet.agreesWithLean === agreesWithLean) return bet;
  return { ...bet, hubLean, agreesWithLean };
}

/** Optional lean on a future bet write. Omitted fields are filled from the catalog. */
export function applyOptionalLean(bet: Bet, raw: unknown): Bet {
  if (!isRecord(raw)) return withStoredLean(bet);
  return withStoredLean(bet, readOptionalLean(raw));
}

export function betSeed(): Bet[] {
  return founderBetSeeds().map((row) => {
    const fight = fightByNumber(row.fight);
    if (!fight) {
      throw new BetWriteError(`bet ${row.id} points at missing fight ${row.fight}.`);
    }
    const onCard =
      fight.A.name === row.pick ||
      fight.B.name === row.pick ||
      row.pick.includes(fight.A.name) ||
      row.pick.includes(fight.B.name);
    if (!onCard) {
      throw new BetWriteError(
        `bet ${row.id} pick ${row.pick} is not on fight ${row.fight}.`,
      );
    }
    const status = row.status ?? "open";
    if (!BET_STATUSES.includes(status)) {
      throw new BetWriteError(`bet ${row.id} status ${status} is not a bet status.`);
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
      status,
      venue: BET_VENUE,
      ticker: BET_TICKER,
      time: fight.iso,
    };
    if (row.estimated) bet.estimated = true;
    if (row.orderId === null) bet.orderId = null;
    else if (typeof row.orderId === "string" && row.orderId.trim()) bet.orderId = row.orderId.trim();
    if (status !== "open") {
      bet.realizedPnl = realizedPnl(bet.stake, status, bet.payout);
    }
    return withStoredLean(bet, {
      hubLean: row.hubLean,
      agreesWithLean: row.agreesWithLean,
    });
  });
}

export function betToFill(bet: Bet): BetFill {
  const fill: BetFill = {
    kind: "bet",
    time: bet.time,
    symbol: bet.ticker,
    orderId: bet.orderId === null ? "pending" : bet.orderId?.trim() || bet.id,
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
  if (bet.hubLean) fill.hubLean = bet.hubLean;
  if (typeof bet.agreesWithLean === "boolean") fill.agreesWithLean = bet.agreesWithLean;
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
  /** Present only when the caller sent override: true. */
  stake?: string;
  override?: boolean;
};

function sameSettlement(current: Bet, next: Bet, request: SettleRequest): boolean {
  if (current.status !== next.status) return false;
  if (current.stake !== next.stake) return false;
  if (current.payout !== next.payout) return false;
  if (current.realizedPnl !== next.realizedPnl) return false;
  if ((current.settledPayout ?? "") !== (next.settledPayout ?? "")) return false;
  if (request.settledAt && current.settledAt !== request.settledAt) return false;
  return current.status !== "open";
}

/**
 * One settlement. The same id + outcome is a no-op.
 * A different status replaces the row. P&L is recomputed, not added.
 * Stake changes require override. Without it, status and payout behave as before.
 */
export function settleBet(
  bet: Bet,
  request: SettleRequest,
  now: string,
): { bet: Bet; deduped: boolean } {
  if (request.stake && !request.override) {
    throw new BetWriteError("Changing stake requires override: true.");
  }
  const stake = request.stake ? money(request.stake) : bet.stake;
  const usesPayout = request.status === "won" || request.status === "sold";
  const proceeds = usesPayout ? money(request.payout ?? bet.payout) : undefined;
  const next: Bet = {
    ...bet,
    stake,
    status: request.status,
    realizedPnl: realizedPnl(stake, request.status, proceeds ?? bet.payout),
    settledAt: request.settledAt ?? bet.settledAt ?? now,
  };
  if (request.status === "sold" && proceeds) {
    next.payout = proceeds;
    next.settledPayout = proceeds;
  } else if (proceeds) {
    next.settledPayout = proceeds;
  } else {
    delete next.settledPayout;
  }
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
  if (status !== "won" && status !== "lost" && status !== "void" && status !== "sold") {
    throw new BetWriteError("status must be won, lost, void, or sold.");
  }
  const request: SettleRequest = { id, status };
  if (raw.override !== undefined && raw.override !== true && raw.override !== false) {
    throw new BetWriteError("override must be true or false.");
  }
  if (raw.override === true) request.override = true;
  const settledAt = asTrimmed(raw.settledAt);
  if (settledAt) {
    if (!ISO_ZONED.test(settledAt) || Number.isNaN(Date.parse(settledAt))) {
      throw new BetWriteError("settledAt must be an ISO-8601 timestamp with an offset or Z.");
    }
    request.settledAt = settledAt;
  }
  const payout = asTrimmed(raw.payout);
  if (status === "sold" && !payout) {
    throw new BetWriteError("payout is required when status is sold.");
  }
  if (payout) {
    if (status !== "won" && status !== "sold") {
      throw new BetWriteError("payout is only used when status is won or sold.");
    }
    if (!isDecimalString(payout) || payout.startsWith("-")) {
      throw new BetWriteError("payout must be a non-negative decimal string.");
    }
    request.payout = money(payout);
  }
  if (raw.stake !== undefined && raw.stake !== null && asTrimmed(raw.stake) !== "") {
    if (request.override !== true) {
      throw new BetWriteError("Changing stake requires override: true.");
    }
    const stake = asTrimmed(raw.stake);
    if (!isDecimalString(stake) || stake.startsWith("-")) {
      throw new BetWriteError("stake must be a non-negative decimal string.");
    }
    request.stake = money(stake);
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
