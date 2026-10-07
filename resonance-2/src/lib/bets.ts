import type { BetFill } from "@/data/fills";
import { fightByNumber, fightBySlug, founderBetSeeds, UFC_332_EVENT } from "@/lib/ufc332";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";

export const BET_VENUE = "coinbase-predict" as const;
export const BET_TICKER = "UFC" as const;
export const BET_STATUSES = ["open", "won", "lost", "void", "sold"] as const;
export const BET_TIERS = ["STRONG", "LEAN"] as const;

export type BetStatus = (typeof BET_STATUSES)[number];
export type BetTier = (typeof BET_TIERS)[number];
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
  /**
   * Broker order id. POST /api/bets is idempotent on this key.
   * Null means it is not in yet; the log prints pending.
   * Rows seeded before order ids existed use `id` as the key.
   */
  orderId?: string | null;
  /** Ticket note. Fees and contract count live here when recorded. */
  note?: string;
  stake: string;
  oddsPct: number;
  /** Ticket payout if the bet hits. Coria's is estimated. */
  payout: string;
  estimated?: boolean;
  status: BetStatus;
  /** Set on won or sold when the settle call sends an actual payout. */
  settledPayout?: string;
  realizedPnl?: string;
  settledAt?: string;
  /** Highest seed-correction version already applied. A later edit is left alone. */
  correctionVersion?: number;
  /** Desk conviction. Omitted on rows that were logged before the field existed. */
  tier?: BetTier;
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

export type CardMoney = {
  /** Dollar headline, or "No bets" when the card has no tickets. */
  headline: string;
  /** Open count, settled record, or both. Empty when there are no tickets. */
  detail: string;
};

function settledPnlOf(bet: Bet): string | null {
  if (bet.status === "open") return null;
  if (bet.realizedPnl && isDecimalString(bet.realizedPnl)) return money(bet.realizedPnl);
  return realizedPnl(bet.stake, bet.status, bet.settledPayout ?? bet.payout);
}

function recordDetail(wins: number, losses: number, sold: number): string {
  if (wins + losses === 0 && sold > 0) return `${sold} sold`;
  const record = `${wins}-${losses}`;
  return sold > 0 ? `${record} · ${sold} sold` : record;
}

/**
 * Promotion and event card face.
 * Open stake is the headline while any ticket is open.
 * A fully settled card leads with realized P/L and a W-L record.
 * Sold changes P/L and is counted on its own. It is not a win or a loss.
 */
export function cardMoney(bets: readonly Bet[]): CardMoney {
  if (bets.length === 0) return { headline: "No bets", detail: "" };
  const open = bets.filter((bet) => bet.status === "open");
  const wins = bets.filter((bet) => bet.status === "won").length;
  const losses = bets.filter((bet) => bet.status === "lost").length;
  const sold = bets.filter((bet) => bet.status === "sold").length;
  const record = recordDetail(wins, losses, sold);
  if (open.length === 0) {
    const pnl = sumMoney(
      bets.flatMap((bet) => {
        const amount = settledPnlOf(bet);
        return amount ? [amount] : [];
      }),
    );
    return { headline: formatSignedUsd(pnl), detail: record };
  }
  const staked = formatUsd(sumMoney(open.map((bet) => bet.stake)));
  if (open.length === bets.length) return { headline: staked, detail: `${open.length} open` };
  const pnl = sumMoney(
    bets.flatMap((bet) => {
      const amount = settledPnlOf(bet);
      return amount ? [amount] : [];
    }),
  );
  return {
    headline: staked,
    detail: `${open.length} open · ${formatSignedUsd(pnl)} · ${record}`,
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
    const placed = row.time?.trim() ?? "";
    if (placed && (!ISO_ZONED.test(placed) || Number.isNaN(Date.parse(placed)))) {
      throw new BetWriteError(`bet ${row.id} time must be an ISO-8601 timestamp with an offset or Z.`);
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
      time: placed || fight.iso,
    };
    if (row.orderId === null) bet.orderId = null;
    else if (typeof row.orderId === "string" && row.orderId.trim()) {
      bet.orderId = row.orderId.trim().toLowerCase();
    }
    if (row.note?.trim()) bet.note = row.note.trim();
    if (row.estimated) bet.estimated = true;
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
  if (bet.note) fill.note = bet.note;
  if (bet.estimated) {
    fill.estimated = true;
    fill.note = bet.note ? `${bet.note} Payout estimated.` : "Payout estimated.";
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

export type PublicBet = {
  id: string;
  event: string;
  fight: string;
  fightSlug: string;
  pick: string;
  stake: string;
  oddsPct: number;
  payout: string;
  status: BetStatus;
  venue: typeof BET_VENUE;
  ticker: typeof BET_TICKER;
  time: string;
  tier?: BetTier;
  hubLean?: string;
  agreesWithLean?: boolean;
  note?: string;
  estimated?: boolean;
  settledPayout?: string;
  realizedPnl?: string;
  settledAt?: string;
};

/** Fields the fight pages already render. Broker order ids stay off this view. */
export function publicBet(bet: Bet): PublicBet {
  const view: PublicBet = {
    id: bet.id,
    event: bet.event,
    fight: bet.fight,
    fightSlug: bet.fightSlug,
    pick: bet.pick,
    stake: bet.stake,
    oddsPct: bet.oddsPct,
    payout: bet.payout,
    status: bet.status,
    venue: bet.venue,
    ticker: bet.ticker,
    time: bet.time,
  };
  if (bet.tier) view.tier = bet.tier;
  if (bet.hubLean) view.hubLean = bet.hubLean;
  if (typeof bet.agreesWithLean === "boolean") view.agreesWithLean = bet.agreesWithLean;
  if (bet.note) view.note = bet.note;
  if (bet.estimated) view.estimated = true;
  if (bet.settledPayout) view.settledPayout = bet.settledPayout;
  if (bet.realizedPnl) view.realizedPnl = bet.realizedPnl;
  if (bet.settledAt) view.settledAt = bet.settledAt;
  return view;
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

function settleOverrideRows(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return null;
  if (Array.isArray(body.bets)) return body.bets;
  return [body];
}

/**
 * True when the body is a settlement correction, not a new ticket.
 * A full bet post carries orderId or fight and stays on the append path.
 */
export function isBetSettleOverride(body: unknown): boolean {
  const rows = settleOverrideRows(body);
  if (!rows || rows.length === 0) return false;
  return rows.every((row) => {
    if (!isRecord(row) || row.override !== true) return false;
    if (row.orderId != null || row.fight != null || row.fightSlug != null) return false;
    return typeof row.id === "string" && typeof row.status === "string";
  });
}

export type BetPost = {
  orderId: string;
  id: string;
  event: string;
  fight: string;
  fightSlug: string;
  pick: string;
  stake: string;
  oddsPct: number;
  payout: string;
  time: string;
  status: BetStatus;
  hubLean?: string;
  agreesWithLean?: boolean;
  estimated?: boolean;
  note?: string;
  settledAt?: string;
  tier?: BetTier;
  /** When true, a matching stored row is corrected instead of returned unchanged. */
  override?: boolean;
};

/** Idempotency key. A row without a broker id uses its slug. */
export function betOrderKey(bet: Pick<Bet, "id" | "orderId">): string {
  return (bet.orderId ?? bet.id).trim().toLowerCase();
}

function requireText(raw: Record<string, unknown>, key: string, label: string): string {
  const value = asTrimmed(raw[key]);
  if (!value) throw new BetWriteError(`${label} is required.`);
  if (value.length > 200) throw new BetWriteError(`${label} is too long.`);
  return value;
}

function requireMoney(raw: Record<string, unknown>, key: string): string {
  const value = asTrimmed(raw[key]);
  if (!value) throw new BetWriteError(`${key} is required.`);
  if (!isDecimalString(value) || value.startsWith("-")) {
    throw new BetWriteError(`${key} must be a non-negative decimal string.`);
  }
  return money(value);
}

export function parseBetPost(raw: unknown): BetPost {
  if (!isRecord(raw)) throw new BetWriteError("Each bet must be an object.");
  const orderId = asTrimmed(raw.orderId).toLowerCase();
  if (!BET_ID.test(orderId)) {
    throw new BetWriteError("orderId must be a lowercase slug or uuid.");
  }
  const explicitId = asTrimmed(raw.id).toLowerCase();
  const id = explicitId || orderId;
  if (!BET_ID.test(id)) throw new BetWriteError("id must be a lowercase slug.");

  const event = requireText(raw, "event", "event");
  const fight = requireText(raw, "fight", "fight");
  const fightSlug = requireText(raw, "fightSlug", "fightSlug").toLowerCase();
  const pick = requireText(raw, "pick", "pick");
  const catalog = fightBySlug(fightSlug);
  if (catalog && catalog.A.name !== pick && catalog.B.name !== pick) {
    throw new BetWriteError(`pick ${pick} is not on ${fightSlug}.`);
  }

  const stake = requireMoney(raw, "stake");
  const payout = requireMoney(raw, "payout");
  if (typeof raw.oddsPct !== "number" || !Number.isFinite(raw.oddsPct) || raw.oddsPct < 0 || raw.oddsPct > 100) {
    throw new BetWriteError("oddsPct must be a number from 0 to 100.");
  }

  const time = asTrimmed(raw.time);
  if (!ISO_ZONED.test(time) || Number.isNaN(Date.parse(time))) {
    throw new BetWriteError("time must be an ISO-8601 timestamp with an offset or Z.");
  }

  const statusRaw = asTrimmed(raw.status).toLowerCase() || "open";
  if (!BET_STATUSES.includes(statusRaw as BetStatus)) {
    throw new BetWriteError("status must be open, won, lost, void, or sold.");
  }
  const status = statusRaw as BetStatus;
  if (raw.override !== undefined && raw.override !== true && raw.override !== false) {
    throw new BetWriteError("override must be true or false.");
  }

  if ("venue" in raw && raw.venue != null && raw.venue !== BET_VENUE) {
    throw new BetWriteError("venue must be coinbase-predict.");
  }
  if ("ticker" in raw && raw.ticker != null && raw.ticker !== BET_TICKER) {
    throw new BetWriteError("ticker must be UFC.");
  }
  if ("estimated" in raw && raw.estimated != null && typeof raw.estimated !== "boolean") {
    throw new BetWriteError("estimated must be a boolean.");
  }
  if ("hubLean" in raw && raw.hubLean != null && typeof raw.hubLean !== "string") {
    throw new BetWriteError("hubLean must be a string.");
  }
  if ("agreesWithLean" in raw && raw.agreesWithLean != null && typeof raw.agreesWithLean !== "boolean") {
    throw new BetWriteError("agreesWithLean must be a boolean.");
  }
  const tier = readTier(raw.tier);

  const settledAt = asTrimmed(raw.settledAt);
  if (settledAt) {
    if (status === "open") {
      throw new BetWriteError("settledAt is only used when status is won, lost, void, or sold.");
    }
    if (!ISO_ZONED.test(settledAt) || Number.isNaN(Date.parse(settledAt))) {
      throw new BetWriteError("settledAt must be an ISO-8601 timestamp with an offset or Z.");
    }
  }

  const note = asTrimmed(raw.note);
  if (note.length > 500) throw new BetWriteError("note is too long.");
  const hubLean = typeof raw.hubLean === "string" ? raw.hubLean.trim() : "";

  const post: BetPost = {
    orderId,
    id,
    event,
    fight,
    fightSlug,
    pick,
    stake,
    oddsPct: raw.oddsPct,
    payout,
    time,
    status,
  };
  if (hubLean) post.hubLean = hubLean;
  if (typeof raw.agreesWithLean === "boolean") post.agreesWithLean = raw.agreesWithLean;
  if (raw.estimated === true) post.estimated = true;
  if (note) post.note = note;
  if (settledAt) post.settledAt = settledAt;
  if (tier) post.tier = tier;
  if (raw.override === true) post.override = true;
  return post;
}

function readTier(value: unknown): BetTier | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new BetWriteError("tier must be STRONG or LEAN.");
  const tier = value.trim().toUpperCase();
  if (tier !== "STRONG" && tier !== "LEAN") {
    throw new BetWriteError("tier must be STRONG or LEAN.");
  }
  return tier;
}

/** One bet, `{ bets: [...] }`, or a bare array. */
export function parseBetPostBody(body: unknown): BetPost[] {
  if (Array.isArray(body)) {
    if (body.length === 0) throw new BetWriteError("At least one bet is required.");
    return body.map((item) => parseBetPost(item));
  }
  if (!isRecord(body)) throw new BetWriteError("JSON object is required.");
  if (Array.isArray(body.bets)) {
    if (body.bets.length === 0) throw new BetWriteError("At least one bet is required.");
    return body.bets.map((item) => parseBetPost(item));
  }
  return [parseBetPost(body)];
}

function postedBet(post: BetPost, now: string): Bet {
  const bet: Bet = {
    id: post.id,
    orderId: post.orderId,
    event: post.event,
    fight: post.fight,
    fightSlug: post.fightSlug,
    pick: post.pick,
    stake: post.stake,
    oddsPct: post.oddsPct,
    payout: post.payout,
    status: "open",
    venue: BET_VENUE,
    ticker: BET_TICKER,
    time: post.time,
  };
  if (post.estimated) bet.estimated = true;
  if (post.note) bet.note = post.note;
  if (post.tier) bet.tier = post.tier;
  const leaned = applyOptionalLean(bet, {
    hubLean: post.hubLean,
    agreesWithLean: post.agreesWithLean,
  });
  const status = post.status;
  if (status === "open") return leaned;
  return settleBet(
    leaned,
    {
      id: leaned.id,
      status,
      ...(status === "won" || status === "sold" ? { payout: leaned.payout } : {}),
      ...(post.settledAt ? { settledAt: post.settledAt } : {}),
    },
    now,
  ).bet;
}

function correctPlacedBet(
  bets: readonly Bet[],
  existing: Bet,
  post: BetPost,
  now: string,
): { bets: Bet[]; bet: Bet; deduped: boolean } {
  const status = post.status;
  if (status === "open") {
    throw new BetWriteError("override status must be won, lost, void, or sold.");
  }
  const base = post.tier ? { ...existing, tier: post.tier } : existing;
  const written = settleBet(
    base,
    {
      id: existing.id,
      status,
      stake: post.stake,
      override: true,
      ...(status === "won" || status === "sold" ? { payout: post.payout } : {}),
      ...(post.settledAt ? { settledAt: post.settledAt } : {}),
    },
    now,
  );
  if (written.deduped) {
    if (base.tier !== existing.tier) {
      return {
        bets: bets.map((bet) => (bet.id === existing.id ? base : bet)),
        bet: base,
        deduped: false,
      };
    }
    return { bets: [...bets], bet: existing, deduped: true };
  }
  return {
    bets: bets.map((bet) => (bet.id === existing.id ? written.bet : bet)),
    bet: written.bet,
    deduped: false,
  };
}

/**
 * Insert one bet. Re-posting the same orderId is a no-op: the stored row is
 * returned unchanged and is not rewritten, so a later settlement stays put.
 * override: true corrects that row's status, payout, and stake instead.
 */
export function placeBet(
  bets: readonly Bet[],
  post: BetPost,
  now: string,
): { bets: Bet[]; bet: Bet; deduped: boolean } {
  const existing = bets.find((bet) => betOrderKey(bet) === post.orderId);
  if (existing) {
    if (!post.override) return { bets: [...bets], bet: existing, deduped: true };
    return correctPlacedBet(bets, existing, post, now);
  }
  const idClash = bets.find((bet) => bet.id === post.id);
  if (idClash) {
    if (post.override) return correctPlacedBet(bets, idClash, post, now);
    throw new BetWriteError(
      `id ${post.id} is already stored for order ${betOrderKey(idClash)}.`,
    );
  }
  const bet = postedBet(post, now);
  return { bets: [...bets, bet], bet, deduped: false };
}
