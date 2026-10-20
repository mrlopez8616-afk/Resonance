import type { CalendarEvent } from "@/data/calendar";
import {
  betStatusLabel,
  formatSignedUsd,
  formatUsd,
  money,
  realizedPnl,
  type Bet,
  type BetTier,
} from "@/lib/bets";
import { formatCivilDate, chicagoDay } from "@/lib/calendar-time";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";
import { calendarFightSlug, fightPromotions } from "@/lib/fight-desk";
import { UFC_332_DATE, UFC_332_ID } from "@/lib/ufc332";

/**
 * Coinbase Predict balance on the as-of date: $17.05 already in open bets
 * plus $0.01 cash. The ledger adds realized P/L after this moment, plus
 * deposits dated on or after the as-of date. Settlements recompute on read.
 */
export const BANKROLL_START = "17.06";
export const BANKROLL_AS_OF = "2026-10-07";

/**
 * First card inside the bankroll. UFC Vegas 122.
 * Bets on this slug are in scope even when they were placed on the as-of
 * date, and even when the calendar row has no event slug.
 */
export const BANKROLL_FIRST_EVENT = {
  slug: "ufc-fight-night-allen-vs-duncan",
  title: "UFC Fight Night: Allen vs Duncan",
  alias: "UFC Vegas 122",
  date: "2026-10-10",
} as const;

/** Events on this civil date or later are in the bankroll. Earlier cards are history. */
export const BANKROLL_SCOPE_FROM = BANKROLL_FIRST_EVENT.date;

const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10000);

/** Founder stake. One dollar on every fight. The bankroll does not scale it. */
export const FLAT_STAKE = "1.00";
export const FLAT_STAKE_LABEL = "Flat $1/fight";
const NOTE_TIER = /tier:\s*(strong|lean|none)\b/i;

export type BankrollCard = {
  slug: string;
  title: string;
  href: string;
  date: string | null;
  dateLabel: string;
  recordLabel: string;
  pnlLabel: string;
};

export type BankrollTierId = BetTier | "untiered";

export type BankrollTier = {
  id: BankrollTierId;
  label: string;
  recordLabel: string;
  pnlLabel: string;
  atRiskLabel: string;
  open: number;
};

export type BankrollLedger = {
  start: string;
  asOf: string;
  bankroll: string;
  bankrollLabel: string;
  atRisk: string;
  atRiskLabel: string;
  cash: string;
  cashLabel: string;
  open: number;
  /** Open tickets on the fight desk, including cards outside the bankroll. */
  deskOpen: number;
  recordLabel: string;
  realizedLabel: string;
  roiLabel: string;
  suggestedStake: string;
  suggestedStakeLabel: string;
  /** Net deposits dated on or after the as-of date. A withdrawal is negative. */
  depositTotal: string;
  depositTotalLabel: string;
  /** Deposit total as a share of the bankroll. Null when the bankroll is zero. No dollar sign. */
  depositShareLabel: string | null;
  cards: BankrollCard[];
  tiers: BankrollTier[];
  before: BankrollCard[];
};

/** A stored deposit. Only date and amount move the bankroll. */
export type BankrollDeposit = {
  date: string;
  amount: string;
};

type Tally = {
  wins: number;
  losses: number;
  draws: number;
  sold: number;
  voids: number;
  open: number;
  pnl: string;
  settledStake: string;
  atRisk: string;
};

function emptyTally(): Tally {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    sold: 0,
    voids: 0,
    open: 0,
    pnl: "0.00",
    settledStake: "0.00",
    atRisk: "0.00",
  };
}

/** Stored tier wins. Notes written before the column existed still say Tier: STRONG, LEAN, or none. */
export function betConviction(bet: Pick<Bet, "tier" | "note">): BetTier | null {
  if (bet.tier === "STRONG" || bet.tier === "LEAN") return bet.tier;
  const match = NOTE_TIER.exec(bet.note ?? "");
  const value = match?.[1]?.toLowerCase();
  if (value === "strong") return "STRONG";
  if (value === "lean") return "LEAN";
  return null;
}

function settledAmount(bet: Bet): string | null {
  if (bet.status === "open") return null;
  if (bet.realizedPnl && isDecimalString(bet.realizedPnl)) return money(bet.realizedPnl);
  return realizedPnl(bet.stake, bet.status, bet.settledPayout ?? bet.payout);
}

function addBet(tally: Tally, bet: Bet): void {
  if (bet.status === "open") {
    tally.open += 1;
    tally.atRisk = money(addDecimal(tally.atRisk, money(bet.stake)));
    return;
  }
  const pnl = settledAmount(bet) ?? "0.00";
  tally.pnl = money(addDecimal(tally.pnl, pnl));
  tally.settledStake = money(addDecimal(tally.settledStake, money(bet.stake)));
  if (bet.status === "won") tally.wins += 1;
  else if (bet.status === "lost") tally.losses += 1;
  else if (bet.status === "sold") tally.sold += 1;
  else if (bet.status === "draw") tally.draws += 1;
  else tally.voids += 1;
}

function tallyBets(bets: readonly Bet[]): Tally {
  const tally = emptyTally();
  for (const bet of bets) addBet(tally, bet);
  return tally;
}

export function recordLabel(
  tally: Pick<Tally, "wins" | "losses" | "draws" | "sold" | "voids">,
): string {
  const record =
    tally.draws > 0
      ? `${tally.wins}-${tally.losses}-${tally.draws}`
      : `${tally.wins}-${tally.losses}`;
  return `${record} · ${tally.sold} sold · ${tally.voids} void`;
}

/** Deposit total divided by the current bankroll. Null when the bankroll is zero. */
export function formatDepositShare(deposits: string, bankroll: string): string | null {
  const base = money(bankroll);
  const added = money(deposits);
  if (base === "0.00" || base === "-0.00") return null;
  const baseNegative = base.startsWith("-");
  const addedNegative = added.startsWith("-");
  const baseCents = BigInt((baseNegative ? base.slice(1) : base).replace(".", ""));
  const addedCents = BigInt((addedNegative ? added.slice(1) : added).replace(".", ""));
  if (baseCents === BigInt(0)) return null;
  const negative = baseNegative !== addedNegative;
  const rounded = (addedCents * TEN_THOUSAND + baseCents / BigInt(2)) / baseCents;
  const whole = rounded / HUNDRED;
  const frac = (rounded % HUNDRED).toString().padStart(2, "0");
  const body = `${whole.toString()}.${frac}`;
  if (body === "0.00") return "0.00%";
  return `${negative ? "-" : "+"}${body}%`;
}

/**
 * Dollar total on the private bankroll card.
 * Public mode gets the percent share, or nothing when that share cannot be named.
 */
export function bankrollDepositLine(
  ledger: Pick<BankrollLedger, "depositTotalLabel" | "depositShareLabel">,
  publicMode: boolean,
): string | null {
  if (publicMode) return ledger.depositShareLabel;
  return ledger.depositTotalLabel;
}

function inScopeDepositTotal(deposits: readonly BankrollDeposit[]): string {
  let total = "0.00";
  for (const deposit of deposits) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deposit.date) || deposit.date < BANKROLL_AS_OF) continue;
    total = money(addDecimal(total, money(deposit.amount)));
  }
  return total;
}

/** Flat $1 per fight. The bankroll argument is ignored. */
export function suggestedStake(_bankroll?: string): string {
  return FLAT_STAKE;
}

/**
 * Recorded settled P&L scaled to the flat $1 stake.
 * Null when the ticket is open or the stake or P&L is missing.
 * A loss of any recorded stake is -$1.00. A win uses the recorded return per dollar.
 */
export function flatStakeOutcome(bet: Pick<Bet, "stake" | "status" | "realizedPnl">): string | null {
  if (bet.status === "open") return null;
  if (typeof bet.realizedPnl !== "string" || !isDecimalString(bet.realizedPnl.trim())) return null;
  if (typeof bet.stake !== "string" || !isDecimalString(bet.stake.trim())) return null;
  const stake = money(bet.stake);
  const pnl = money(bet.realizedPnl);
  const stakeCents = BigInt(stake.replace("-", "").replace(".", ""));
  if (stakeCents === BigInt(0)) return null;
  const negative = pnl.startsWith("-");
  const pnlCents = BigInt((negative ? pnl.slice(1) : pnl).replace(".", ""));
  const rounded = (pnlCents * HUNDRED + stakeCents / BigInt(2)) / stakeCents;
  const whole = rounded / HUNDRED;
  const frac = (rounded % HUNDRED).toString().padStart(2, "0");
  const body = `${whole.toString()}.${frac}`;
  if (body === "0.00") return "$0.00";
  return `${negative ? "-" : "+"}$${body}`;
}

/** One line for the fights on a card. Public mode keeps the status word and drops the dollars. */
export function flatStakeFightLine(
  bets: readonly Pick<Bet, "stake" | "status" | "realizedPnl">[],
  publicMode = false,
): string {
  if (bets.length === 0) return "not recorded";
  return bets
    .map((bet) => {
      if (bet.status === "open") return "not recorded";
      if (publicMode) return bet.realizedPnl ? betStatusLabel(bet.status) : "not recorded";
      return flatStakeOutcome(bet) ?? "not recorded";
    })
    .join(" · ");
}

/** Realized P/L divided by settled stake. Null when nothing has settled. */
export function bankrollRoi(realized: string, settledStake: string): string | null {
  const stake = money(settledStake);
  if (stake === "0.00") return null;
  const pnl = money(realized);
  const negative = pnl.startsWith("-");
  const pnlCents = BigInt((negative ? pnl.slice(1) : pnl).replace(".", ""));
  const stakeCents = BigInt(stake.replace(".", ""));
  if (stakeCents === BigInt(0)) return null;
  const rounded = (pnlCents * TEN_THOUSAND + stakeCents / BigInt(2)) / stakeCents;
  const whole = rounded / HUNDRED;
  const frac = (rounded % HUNDRED).toString().padStart(2, "0");
  const body = `${whole.toString()}.${frac}`;
  if (body === "0.00") return "0.00%";
  return `${negative ? "-" : "+"}${body}%`;
}

function isFightRow(event: Pick<CalendarEvent, "kind" | "lane">): boolean {
  return event.kind === "fight" || event.lane === "fights";
}

/** Calendar title contains the bet event as a whole phrase, not as a shorter prefix of a number. */
function titleHits(calendarTitle: string, eventTitle: string): boolean {
  const calendar = calendarTitle.trim().toLowerCase();
  const event = eventTitle.trim().toLowerCase();
  if (!calendar || !event) return false;
  let from = 0;
  while (from <= calendar.length) {
    const at = calendar.indexOf(event, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : calendar[at - 1] ?? "";
    const after = calendar[at + event.length] ?? "";
    const beforeOk = before === "" || /[^a-z0-9]/.test(before);
    const afterOk = after === "" || /[^a-z0-9]/.test(after);
    if (beforeOk && afterOk) return true;
    from = at + 1;
  }
  return false;
}

/**
 * Civil date of the card. Catalog and calendar only.
 * A bet's placement time is not a card date: Allen vs Duncan was ticketed on
 * 2026-10-07 for a 2026-10-10 card. Null means no catalog or calendar row matched.
 */
export function fightCardDay(
  slug: string,
  title: string,
  events: readonly CalendarEvent[],
): string | null {
  if (slug === BANKROLL_FIRST_EVENT.slug) return BANKROLL_FIRST_EVENT.date;
  if (slug === UFC_332_ID) return UFC_332_DATE;
  let earliest: string | null = null;
  for (const event of events) {
    if (!isFightRow(event)) continue;
    const explicit = calendarFightSlug(event);
    if (explicit !== slug && !titleHits(event.title, title)) continue;
    const day = chicagoDay(event.start);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!earliest || day < earliest) earliest = day;
  }
  return earliest;
}

export function eventInBankroll(day: string | null): boolean {
  return day !== null && day >= BANKROLL_SCOPE_FROM;
}

/** Chicago civil day of the earliest bet placement. Invalid times are skipped. */
export function earliestPlacementDay(bets: readonly Pick<Bet, "time">[]): string | null {
  let earliest: string | null = null;
  for (const bet of bets) {
    const day = chicagoDay(bet.time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!earliest || day < earliest) earliest = day;
  }
  return earliest;
}

/**
 * Known card dates use the catalog cutoff. An undated card is in scope when
 * its earliest bet was placed on the as-of date or later.
 */
export function cardInBankroll(day: string | null, bets: readonly Pick<Bet, "time">[]): boolean {
  if (day !== null) return eventInBankroll(day);
  const placed = earliestPlacementDay(bets);
  return placed !== null && placed >= BANKROLL_AS_OF;
}

function cardFrom(slug: string, title: string, href: string, day: string | null, bets: readonly Bet[]): BankrollCard {
  const tally = tallyBets(bets);
  return {
    slug,
    title,
    href,
    date: day,
    dateLabel: day ? formatCivilDate(day) : "—",
    recordLabel: recordLabel(tally),
    pnlLabel: formatSignedUsd(tally.pnl),
  };
}

function compareCards(left: BankrollCard, right: BankrollCard): number {
  if (left.date && right.date && left.date !== right.date) return left.date < right.date ? -1 : 1;
  if (left.date && !right.date) return -1;
  if (!left.date && right.date) return 1;
  return left.title.localeCompare(right.title);
}

const TIER_ROWS: { id: BankrollTierId; label: string }[] = [
  { id: "STRONG", label: "STRONG" },
  { id: "LEAN", label: "LEAN" },
  { id: "untiered", label: "Untiered" },
];

function tierRow(id: BankrollTierId, label: string, bets: readonly Bet[]): BankrollTier {
  const tally = tallyBets(bets);
  return {
    id,
    label,
    recordLabel: recordLabel(tally),
    pnlLabel: formatSignedUsd(tally.pnl),
    atRiskLabel: formatUsd(tally.atRisk),
    open: tally.open,
  };
}

/** Bankroll, at risk, record, and history from the bet book. Does not write. */
export function computeBankroll(
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
  deposits: readonly BankrollDeposit[] = [],
): BankrollLedger {
  const cards: BankrollCard[] = [];
  const before: BankrollCard[] = [];
  const inScope: Bet[] = [];

  for (const promotion of fightPromotions({ bets, events })) {
    for (const event of promotion.events) {
      if (event.bets.length === 0) continue;
      const day = fightCardDay(event.slug, event.title, events);
      const row = cardFrom(event.slug, event.title, event.href, day, event.bets);
      if (cardInBankroll(day, event.bets)) {
        cards.push(row);
        inScope.push(...event.bets);
      } else {
        before.push(row);
      }
    }
  }

  cards.sort(compareCards);
  before.sort(compareCards);

  const tally = tallyBets(inScope);
  const depositTotal = inScopeDepositTotal(deposits);
  const bankroll = money(addDecimal(addDecimal(BANKROLL_START, depositTotal), tally.pnl));
  const cash = money(subtractDecimal(bankroll, tally.atRisk));
  const stake = suggestedStake(bankroll);
  const roi = bankrollRoi(tally.pnl, tally.settledStake);

  return {
    start: money(BANKROLL_START),
    asOf: BANKROLL_AS_OF,
    bankroll,
    bankrollLabel: formatUsd(bankroll),
    atRisk: tally.atRisk,
    atRiskLabel: formatUsd(tally.atRisk),
    cash,
    cashLabel: formatUsd(cash),
    open: tally.open,
    deskOpen: bets.filter((bet) => bet.status === "open").length,
    recordLabel: recordLabel(tally),
    realizedLabel: formatSignedUsd(tally.pnl),
    roiLabel: roi ?? "—",
    suggestedStake: stake,
    suggestedStakeLabel: formatUsd(stake),
    depositTotal,
    depositTotalLabel: formatSignedUsd(depositTotal),
    depositShareLabel: formatDepositShare(depositTotal, bankroll),
    cards,
    tiers: TIER_ROWS.map((tier) =>
      tierRow(
        tier.id,
        tier.label,
        inScope.filter((bet) => (betConviction(bet) ?? "untiered") === tier.id),
      ),
    ),
    before,
  };
}

export function bankrollHomeFace(ledger: BankrollLedger): { headline: string; priceLine: string } {
  const open = ledger.open === 1 ? "1 open" : `${ledger.open} open`;
  return {
    headline: ledger.bankrollLabel,
    priceLine: `${ledger.atRiskLabel} at risk · ${open}`,
  };
}
