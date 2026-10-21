import type { CalendarEvent } from "@/data/calendar";
import { bankrollRoi, betConviction } from "@/lib/bankroll";
import { formatSignedUsd, money, recordMark, type Bet } from "@/lib/bets";
import { isDecimalString } from "@/lib/decimal";
import { doctrineForBreakdown, type FightBreakdown } from "@/lib/fight-breakdowns";
import { betEventSlug, fightTimeBoards } from "@/lib/fight-desk";
import { canonicalEventSlug } from "@/lib/fight-event-alias";
import type { PlanTier } from "@/lib/fight-ko-gate";
import { hasMoneyText } from "@/lib/public-mode";
import { personSlug } from "@/lib/ufc332";

/**
 * Read-only tier tracker. Settled won and lost bets only.
 * One bet is a $1 stake. A win's profit is the recorded payout divided by
 * the recorded stake, minus that dollar. A loss is -$1.00.
 * The recorded odds have to be present as well. A missing odds or payout
 * leaves that bet out of the dollar sum and the line reads "not recorded".
 * The win or loss still counts. Nothing here is inferred from a blank field.
 *
 * KO-gated picks use the existing gate field, `doctrineForBreakdown().tierNote`.
 * The fight page already labels that string "KO gate". It is set only when
 * the gate drops the posted tier. There is no stored boolean column.
 * A pick with no breakdown is not marked gated. An empty slice reads
 * "not recorded". A breakdown store that cannot be read reads "unavailable".
 */

export const TIER_TRACKER_HREF = "/fights/tiers";

export const SLICE_IDS = ["strong", "lean", "pass", "ko-gated"] as const;
export type SliceId = (typeof SLICE_IDS)[number];

const SLICE_NAME: Record<SliceId, string> = {
  strong: "STRONG",
  lean: "LEAN",
  pass: "PASS",
  "ko-gated": "KO-gated",
};

const TIER_SLICE: Record<PlanTier, SliceId> = {
  STRONG: "strong",
  LEAN: "lean",
  PASS: "pass",
};

const EVENT_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export type TrackerStore = "live" | "seed-only" | "unavailable";

export type TrackerTile = {
  id: string;
  name: string;
  href: string;
  headline: string;
  status: string;
  live: boolean;
};

export type SliceView = {
  name: string;
  tiles: TrackerTile[];
  empty: string;
};

export type CardView = {
  title: string;
  tiles: TrackerTile[];
  empty: string;
};

export type PickView = {
  sliceName: string;
  title: string;
  tiles: TrackerTile[];
  empty: string;
};

export type TierTrackerModel = {
  book: TrackerStore;
  breakdownStore: TrackerStore;
  summary: TrackerTile;
  homeTiles: TrackerTile[];
  slices: Record<SliceId, SliceView>;
  cards: Record<string, CardView>;
  picks: Record<string, PickView>;
};

type ScoredBet = {
  bet: Bet;
  eventSlug: string;
  tier: PlanTier | null;
  ko: boolean;
  pnlCents: bigint | null;
};

type FaceMode = "score" | "empty" | "unavailable";

function pickKey(slice: SliceId, slug: string): string {
  return `${slice}/${slug}`;
}

export function parseSliceId(value: string): SliceId | null {
  const id = value.trim().toLowerCase();
  return SLICE_IDS.includes(id as SliceId) ? (id as SliceId) : null;
}

export function parseTrackerEventSlug(value: string): string | null {
  const id = value.trim().toLowerCase();
  return EVENT_SLUG.test(id) ? id : null;
}

export function sliceHref(id: SliceId): string {
  return `${TIER_TRACKER_HREF}/${id}`;
}

export function cardHref(slug: string): string {
  return `${TIER_TRACKER_HREF}/cards/${slug}`;
}

export function pickHref(id: SliceId, slug: string): string {
  return `${TIER_TRACKER_HREF}/${id}/${slug}`;
}

export function cardPickHref(slug: string, id: SliceId): string {
  return `${TIER_TRACKER_HREF}/cards/${slug}/${id}`;
}

/**
 * $1-scaled profit in cents.
 * Null when the bet is not a win or a loss, or the odds, stake, or payout
 * was not recorded. A loss with those fields recorded is -100.
 */
export function unitStakePnlCents(
  bet: Pick<Bet, "status" | "stake" | "payout" | "oddsPct">,
): bigint | null {
  if (bet.status !== "won" && bet.status !== "lost") return null;
  if (typeof bet.oddsPct !== "number" || !Number.isFinite(bet.oddsPct)) return null;
  if (bet.oddsPct <= 0 || bet.oddsPct >= 100) return null;
  if (typeof bet.stake !== "string" || typeof bet.payout !== "string") return null;
  if (!isDecimalString(bet.stake.trim()) || !isDecimalString(bet.payout.trim())) return null;
  let stake: string;
  let payout: string;
  try {
    stake = money(bet.stake);
    payout = money(bet.payout);
  } catch {
    return null;
  }
  if (stake.startsWith("-") || payout.startsWith("-")) return null;
  const stakeCents = BigInt(stake.replace(".", ""));
  const payoutCents = BigInt(payout.replace(".", ""));
  const zero = BigInt(0);
  const hundred = BigInt(100);
  if (stakeCents <= zero) return null;
  if (bet.status === "lost") return -hundred;
  const profit = payoutCents - stakeCents;
  const negative = profit < zero;
  const magnitude = negative ? -profit : profit;
  const rounded = (magnitude * hundred + stakeCents / BigInt(2)) / stakeCents;
  return negative ? -rounded : rounded;
}

function centsToMoney(cents: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const negative = cents < zero;
  const abs = negative ? -cents : cents;
  const whole = abs / hundred;
  const frac = (abs % hundred).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

/** Win rate for a public tile. Null when nothing has been decided. */
export function formatWinRate(wins: number, decided: number): string | null {
  if (!Number.isInteger(wins) || !Number.isInteger(decided)) return null;
  if (decided <= 0 || wins < 0 || wins > decided) return null;
  const ten = BigInt(10);
  const rounded = (BigInt(wins) * BigInt(1000) + BigInt(decided) / BigInt(2)) / BigInt(decided);
  const whole = rounded / ten;
  const frac = rounded % ten;
  const pct = frac === BigInt(0) ? `${whole.toString()}%` : `${whole.toString()}.${frac.toString()}%`;
  return `${pct} wins`;
}

function roiLine(pnlCents: bigint, count: number): string | null {
  if (count <= 0) return null;
  const roi = bankrollRoi(centsToMoney(pnlCents), centsToMoney(BigInt(count) * BigInt(100)));
  return roi ? `${roi} ROI` : null;
}

function sameFighter(left: string, right: string): boolean {
  const a = personSlug(left);
  const b = personSlug(right);
  return a.length > 0 && a === b;
}

function planPick(row: FightBreakdown): string | null {
  const name = row.lean?.trim() || row.odds?.pick?.trim() || "";
  return name || null;
}

function classify(
  bet: Bet,
  breakdown: FightBreakdown | undefined,
  breakdownsDown: boolean,
): { tier: PlanTier | null; ko: boolean } {
  const stored = betConviction(bet);
  if (breakdownsDown || !breakdown) return { tier: stored, ko: false };
  const pick = planPick(breakdown);
  if (!pick || !sameFighter(bet.pick, pick)) return { tier: stored, ko: false };
  const doctrine = doctrineForBreakdown(breakdown);
  return {
    tier: doctrine.tier ?? stored,
    ko: Boolean(doctrine.tierNote),
  };
}

type Tally = {
  wins: number;
  losses: number;
  count: number;
  pnl: bigint;
  missingPrice: boolean;
};

function tallyOf(rows: readonly ScoredBet[]): Tally {
  const tally: Tally = { wins: 0, losses: 0, count: rows.length, pnl: BigInt(0), missingPrice: false };
  for (const row of rows) {
    if (row.bet.status === "won") tally.wins += 1;
    else if (row.bet.status === "lost") tally.losses += 1;
    if (row.pnlCents == null) tally.missingPrice = true;
    else tally.pnl += row.pnlCents;
  }
  return tally;
}

function face(tally: Tally, mode: FaceMode, publicMode: boolean): { headline: string; status: string; live: boolean } {
  if (mode === "unavailable") return { headline: "unavailable", status: "unavailable", live: false };
  if (mode === "empty" || tally.count === 0) return { headline: "not recorded", status: "not recorded", live: false };
  if (publicMode) {
    const headline = formatWinRate(tally.wins, tally.wins + tally.losses) ?? "not recorded";
    const status = tally.missingPrice ? "not recorded" : (roiLine(tally.pnl, tally.count) ?? "not recorded");
    return {
      headline: hasMoneyText(headline) ? "not recorded" : headline,
      status: hasMoneyText(status) ? "not recorded" : status,
      live: true,
    };
  }
  return {
    headline: recordMark(tally.wins, tally.losses, 0),
    status: tally.missingPrice ? "not recorded" : formatSignedUsd(centsToMoney(tally.pnl)),
    live: true,
  };
}

function tile(
  id: string,
  name: string,
  href: string,
  tally: Tally,
  mode: FaceMode,
  publicMode: boolean,
): TrackerTile {
  const shown = face(tally, mode, publicMode);
  return { id, name, href, ...shown };
}

function betName(bet: Bet, group: readonly ScoredBet[]): string {
  const title = bet.fight.trim();
  const pick = bet.pick.trim();
  const label = title || pick;
  if (!label) return "not recorded";
  const twins = group.filter((row) => (row.bet.fight.trim() || row.bet.pick.trim()) === label);
  if (twins.length > 1 && title && pick) return `${title} · ${pick}`;
  return label;
}

export function buildTierTracker(input: {
  bets: readonly Bet[];
  events?: readonly CalendarEvent[];
  breakdowns?: readonly FightBreakdown[];
  book?: TrackerStore;
  breakdownStore?: TrackerStore;
  publicMode?: boolean;
  now?: Date;
}): TierTrackerModel {
  const book = input.book ?? "live";
  const breakdownStore = input.breakdownStore ?? "live";
  const publicMode = input.publicMode ?? false;
  const bookDown = book === "unavailable";
  const breakdownsDown = breakdownStore === "unavailable";
  const events = input.events ?? [];
  const bets = bookDown ? [] : input.bets;
  const breakdowns = breakdownsDown ? [] : (input.breakdowns ?? []);
  const boards = fightTimeBoards({ bets, events, now: input.now });
  const cardOrder: { slug: string; title: string }[] = [];
  const titles = new Map<string, string>();
  for (const event of [...boards.upcoming, ...boards.past]) {
    if (!EVENT_SLUG.test(event.slug) || titles.has(event.slug)) continue;
    const title = event.title.trim() || "not recorded";
    titles.set(event.slug, title);
    cardOrder.push({ slug: event.slug, title });
  }
  const byFight = new Map<string, FightBreakdown>();
  for (const row of breakdowns) {
    const key = `${canonicalEventSlug(row.eventSlug)}\0${row.fightSlug.trim().toLowerCase()}`;
    const current = byFight.get(key);
    const rowIsCanonical = row.eventSlug.trim().toLowerCase() === canonicalEventSlug(row.eventSlug);
    if (!current || rowIsCanonical) byFight.set(key, row);
  }

  const scored: ScoredBet[] = [];
  for (const bet of bets) {
    if (bet.status !== "won" && bet.status !== "lost") continue;
    const eventSlug = betEventSlug(bet, events);
    const onCard = titles.has(eventSlug) ? eventSlug : "";
    const breakdown = byFight.get(`${eventSlug}\0${bet.fightSlug.trim().toLowerCase()}`);
    const kind = classify(bet, breakdown, breakdownsDown);
    scored.push({
      bet,
      eventSlug: onCard,
      tier: kind.tier,
      ko: kind.ko,
      pnlCents: unitStakePnlCents(bet),
    });
  }

  const tiered = scored.filter((row) => row.tier != null);
  const summaryMode: FaceMode = bookDown ? "unavailable" : tiered.length === 0 ? "empty" : "score";
  const summary = tile(
    "tier-tracker",
    "Tier tracker",
    TIER_TRACKER_HREF,
    tallyOf(tiered),
    summaryMode,
    publicMode,
  );

  const slices = {} as Record<SliceId, SliceView>;
  const picks: Record<string, PickView> = {};
  const sliceTiles: TrackerTile[] = [];

  for (const id of SLICE_IDS) {
    const rows =
      id === "ko-gated"
        ? scored.filter((row) => row.ko)
        : scored.filter((row) => row.tier != null && TIER_SLICE[row.tier] === id);
    const unavailable =
      bookDown || (breakdownsDown && (id === "ko-gated" || id === "pass"));
    const mode: FaceMode = unavailable ? "unavailable" : rows.length === 0 ? "empty" : "score";
    const name = SLICE_NAME[id];
    sliceTiles.push(tile(`slice-${id}`, name, sliceHref(id), tallyOf(rows), mode, publicMode));
    const cardsForSlice: TrackerTile[] = [];
    for (const card of cardOrder) {
      const onCard = rows.filter((row) => row.eventSlug === card.slug);
      if (onCard.length === 0) continue;
      cardsForSlice.push(
        tile(`card-${card.slug}`, card.title, pickHref(id, card.slug), tallyOf(onCard), "score", publicMode),
      );
    }
    slices[id] = {
      name,
      tiles: cardsForSlice,
      empty: unavailable ? "unavailable" : "not recorded",
    };
  }

  const cards: Record<string, CardView> = {};
  const cardTiles: TrackerTile[] = [];
  for (const card of cardOrder) {
    const onCard = tiered.filter((row) => row.eventSlug === card.slug);
    if (onCard.length === 0) continue;
    cardTiles.push(
      tile(`card-${card.slug}`, card.title, cardHref(card.slug), tallyOf(onCard), "score", publicMode),
    );
    const children: TrackerTile[] = [];
    for (const id of SLICE_IDS) {
      const rows =
        id === "ko-gated"
          ? scored.filter((row) => row.ko && row.eventSlug === card.slug)
          : onCard.filter((row) => row.tier != null && TIER_SLICE[row.tier] === id);
      const unavailable = breakdownsDown && (id === "ko-gated" || id === "pass");
      const mode: FaceMode = unavailable ? "unavailable" : rows.length === 0 ? "empty" : "score";
      children.push(
        tile(`slice-${id}`, SLICE_NAME[id], cardPickHref(card.slug, id), tallyOf(rows), mode, publicMode),
      );
      const betTiles = rows.map((row) =>
        tile(
          `bet-${row.bet.id}`,
          betName(row.bet, rows),
          "",
          tallyOf([row]),
          "score",
          publicMode,
        ),
      );
      picks[pickKey(id, card.slug)] = {
        sliceName: SLICE_NAME[id],
        title: card.title,
        tiles: betTiles,
        empty: unavailable ? "unavailable" : "not recorded",
      };
    }
    cards[card.slug] = { title: card.title, tiles: children, empty: "not recorded" };
  }

  return {
    book,
    breakdownStore,
    summary,
    homeTiles: [...sliceTiles, ...cardTiles],
    slices,
    cards,
    picks,
  };
}

export function trackerSlice(model: TierTrackerModel, id: string): SliceView | null {
  const slice = parseSliceId(id);
  if (!slice) return null;
  return model.slices[slice];
}

export function trackerCard(model: TierTrackerModel, slug: string): CardView | null {
  const id = parseTrackerEventSlug(slug);
  if (!id) return null;
  return model.cards[canonicalEventSlug(id)] ?? null;
}

export function trackerPicks(model: TierTrackerModel, slice: string, slug: string): PickView | null {
  const id = parseSliceId(slice);
  const event = parseTrackerEventSlug(slug);
  if (!id || !event) return null;
  return model.picks[pickKey(id, canonicalEventSlug(event))] ?? null;
}

/** Every headline and status the tracker would paint. */
export function trackerCopy(model: TierTrackerModel): string[] {
  const lines: string[] = [];
  const take = (row: TrackerTile) => {
    lines.push(row.name, row.headline, row.status);
  };
  take(model.summary);
  for (const row of model.homeTiles) take(row);
  for (const slice of SLICE_IDS) {
    for (const row of model.slices[slice].tiles) take(row);
  }
  for (const card of Object.values(model.cards)) {
    for (const row of card.tiles) take(row);
  }
  for (const pick of Object.values(model.picks)) {
    for (const row of pick.tiles) take(row);
  }
  return lines;
}
