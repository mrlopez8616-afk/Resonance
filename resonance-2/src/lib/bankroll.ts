import type { CalendarEvent } from "@/data/calendar";
import {
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
 * plus $0.01 cash. The ledger adds realized P/L after this moment.
 * No migration. Settlements recompute the number on the next read.
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

const STAKE_PERCENT = BigInt(5);
const HUNDRED = BigInt(100);
const HALF = BigInt(50);
const TEN_THOUSAND = BigInt(10000);
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
  cards: BankrollCard[];
  tiers: BankrollTier[];
  before: BankrollCard[];
};

type Tally = {
  wins: number;
  losses: number;
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
  else tally.voids += 1;
}

function tallyBets(bets: readonly Bet[]): Tally {
  const tally = emptyTally();
  for (const bet of bets) addBet(tally, bet);
  return tally;
}

export function recordLabel(tally: Pick<Tally, "wins" | "losses" | "sold" | "voids">): string {
  return `${tally.wins}-${tally.losses} · ${tally.sold} sold · ${tally.voids} void`;
}

/** Flat 5% of the current bankroll, rounded to the nearest cent. */
export function suggestedStake(bankroll: string): string {
  const printed = money(bankroll);
  const negative = printed.startsWith("-");
  const cents = BigInt((negative ? printed.slice(1) : printed).replace(".", ""));
  const rounded = (cents * STAKE_PERCENT + HALF) / HUNDRED;
  const body = rounded.toString().padStart(3, "0");
  const stake = `${body.slice(0, -2)}.${body.slice(-2)}`;
  return negative ? `-${stake}` : stake;
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
 * 2026-10-07 for a 2026-10-10 card.
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
): BankrollLedger {
  const cards: BankrollCard[] = [];
  const before: BankrollCard[] = [];
  const inScope: Bet[] = [];

  for (const promotion of fightPromotions({ bets, events })) {
    for (const event of promotion.events) {
      if (event.bets.length === 0) continue;
      const day = fightCardDay(event.slug, event.title, events);
      const row = cardFrom(event.slug, event.title, event.href, day, event.bets);
      if (eventInBankroll(day)) {
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
  const bankroll = money(addDecimal(BANKROLL_START, tally.pnl));
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
