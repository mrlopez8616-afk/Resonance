import type { CalendarEvent } from "@/data/calendar";
import type { Bet } from "@/lib/bets";
import type { KnownBout } from "@/lib/fight-results";
import {
  fightBySlug,
  personSlug,
  UFC_332_DATE,
  UFC_332_EVENT,
  UFC_332_ID,
  ufc332Fights,
  type CatalogFight,
} from "@/lib/ufc332";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

export const FIGHT_PROMOTIONS = [
  { id: "ufc", label: "UFC" },
  { id: "contender-series", label: "Contender Series" },
] as const;

export type FightPromotionId = (typeof FIGHT_PROMOTIONS)[number]["id"];

/** Old top-level routes. They redirect to the UFC promotion page. */
const LEGACY_FIGHT_NODES = ["main-card", "prelims"] as const;

export function legacyFightNodeHref(slug: string): string | null {
  const id = slug.trim().toLowerCase();
  return LEGACY_FIGHT_NODES.includes(id as (typeof LEGACY_FIGHT_NODES)[number]) ? "/fights/ufc" : null;
}

export function eventSlugFromTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === UFC_332_EVENT.name || trimmed.toLowerCase() === UFC_332_ID) return UFC_332_ID;
  const slug = personSlug(trimmed);
  return SLUG.test(slug) ? slug : "";
}

export function isUfc332Bet(bet: Pick<Bet, "event" | "fightSlug">): boolean {
  return (
    bet.event.trim() === UFC_332_EVENT.name ||
    bet.event.trim().toLowerCase() === UFC_332_ID ||
    fightBySlug(bet.fightSlug) !== null
  );
}

function isFightRow(event: Pick<CalendarEvent, "kind" | "lane">): boolean {
  return event.kind === "fight" || event.lane === "fights";
}

/** Slug a calendar fight row already carries, from eventSlug or a /fights path. */
export function calendarFightSlug(
  event: Pick<CalendarEvent, "kind" | "lane" | "eventSlug" | "link">,
): string | null {
  if (!isFightRow(event)) return null;
  const explicit = event.eventSlug?.trim().toLowerCase() ?? "";
  if (SLUG.test(explicit)) return explicit;
  const match = FIGHT_PATH.exec(event.link ?? "");
  const fromLink = match?.[1] ?? "";
  if (SLUG.test(fromLink)) return fromLink;
  return null;
}

function titlesAlign(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * UFC 332 tickets stay on ufc-332.
 * Any other event uses the calendar row's slug when the title lines up, otherwise a slug of the bet event.
 */
export function betEventSlug(bet: Bet, events: readonly CalendarEvent[] = []): string {
  if (isUfc332Bet(bet)) return UFC_332_ID;
  const derived = eventSlugFromTitle(bet.event);
  const match = events.find((event) => {
    const slug = calendarFightSlug(event);
    if (!slug || slug === UFC_332_ID) return false;
    if (slug === derived) return true;
    if (eventSlugFromTitle(event.title) === derived) return true;
    return titlesAlign(event.title, bet.event);
  });
  return match ? (calendarFightSlug(match) ?? derived) : derived;
}

export function betsForEventSlug(
  bets: readonly Bet[],
  slug: string,
  events: readonly CalendarEvent[] = [],
): Bet[] {
  const id = slug.trim().toLowerCase();
  return bets.filter((bet) => betEventSlug(bet, events) === id);
}

export type BoutSegment = "main-card" | "prelims";

export type DeskFight = {
  slug: string;
  title: string;
  kicker: string;
  detail: string;
  href?: string;
  segment: BoutSegment | null;
  bets: Bet[];
};

export type DeskEvent = {
  slug: string;
  title: string;
  href: string;
  meta: string;
  /** Card instant used to order events. Upcoming first, then past. */
  when: string | null;
  fights: DeskFight[];
  bets: Bet[];
};

export type DeskPromotion = {
  id: FightPromotionId;
  label: string;
  href: string;
  events: DeskEvent[];
};

const RESERVED_SLUGS = new Set<string>([
  ...FIGHT_PROMOTIONS.map((promotion) => promotion.id),
  ...LEGACY_FIGHT_NODES,
]);

export function isReservedFightSlug(value: string): boolean {
  return RESERVED_SLUGS.has(value.trim().toLowerCase());
}

export function fightPromotionHref(id: FightPromotionId): string {
  return `/fights/${id}`;
}

export type FightEventKind = "ufc" | "contender";

/**
 * Contender Series is only Dana White's Contender Series.
 * A slug or title that contains contender or dwcs is that series.
 * UFC numbered cards and UFC Fight Night cards are the UFC side.
 */
export function fightEventKind(input: { slug?: string; title?: string }): FightEventKind {
  const text = `${input.slug ?? ""} ${input.title ?? ""}`.toLowerCase();
  if (text.includes("contender") || text.includes("dwcs")) return "contender";
  return "ufc";
}

export function promotionForEvent(input: { slug?: string; title?: string }): FightPromotionId {
  return fightEventKind(input) === "contender" ? "contender-series" : "ufc";
}

/** One level up from an event page: its promotion. */
export function eventBackHref(
  eventSlug: string,
  context?: { title?: string | null },
): { href: string; label: string } {
  const promotion = FIGHT_PROMOTIONS.find(
    (row) => row.id === promotionForEvent({ slug: eventSlug, title: context?.title ?? "" }),
  );
  const id = promotion?.id ?? "ufc";
  return { href: fightPromotionHref(id), label: promotion?.label ?? "UFC" };
}

const MAIN_CARD = /\bmain[\s-]*card\b/i;
const PRELIM = /\b(?:early[\s-]*)?prelims?\b/i;

/** Main card or prelims when the text says so. Early prelims stay with Prelims. */
export function segmentHint(text: string): BoutSegment | null {
  const mainAt = text.search(MAIN_CARD);
  const prelimAt = text.search(PRELIM);
  if (mainAt < 0 && prelimAt < 0) return null;
  if (mainAt < 0) return "prelims";
  if (prelimAt < 0) return "main-card";
  return mainAt < prelimAt ? "main-card" : "prelims";
}

const BOUT =
  /([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)\s+vs\.?\s+([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)/i;

function boutKey(title: string): string | null {
  const match = BOUT.exec(title.toLowerCase());
  if (!match?.[1] || !match[2]) return null;
  return `${personSlug(match[1])} vs ${personSlug(match[2])}`;
}

function catalogSegment(fight: CatalogFight): BoutSegment {
  return fight.segment === "main-card" ? "main-card" : "prelims";
}

function catalogFightRow(fight: CatalogFight, bets: readonly Bet[]): DeskFight {
  return {
    slug: fight.slug,
    title: `${fight.A.name} vs ${fight.B.name}`,
    kicker: `${fight.time} CT`,
    detail: fight.division,
    href: fight.href,
    segment: catalogSegment(fight),
    bets: bets.filter((bet) => bet.fightSlug === fight.slug),
  };
}

function agreedSegment(hints: readonly (BoutSegment | null)[]): BoutSegment | null {
  const present = hints.filter((hint): hint is BoutSegment => hint !== null);
  if (present.length === 0) return null;
  const first = present[0];
  return present.every((hint) => hint === first) ? first : null;
}

function segmentForListedFight(
  title: string,
  bets: readonly Bet[],
  calendarTexts: readonly string[],
): BoutSegment | null {
  const named = calendarTexts.filter((text) => {
    const key = boutKey(text);
    const fightKey = boutKey(title);
    return key !== null && fightKey !== null && key === fightKey;
  });
  return agreedSegment([
    ...bets.map((bet) => segmentHint(bet.note ?? "")),
    ...named.map((text) => segmentHint(text)),
  ]);
}

function listedFights(
  bets: readonly Bet[],
  calendarTexts: readonly string[],
): DeskFight[] {
  const fights = new Map<string, DeskFight>();
  for (const bet of bets) {
    const existing = fights.get(bet.fightSlug);
    if (existing) {
      existing.bets.push(bet);
      continue;
    }
    fights.set(bet.fightSlug, {
      slug: bet.fightSlug,
      title: bet.fight,
      kicker: "",
      detail: "",
      segment: null,
      bets: [bet],
    });
  }
  for (const fight of fights.values()) {
    const catalog = fightBySlug(fight.slug);
    fight.segment = catalog
      ? catalogSegment(catalog)
      : segmentForListedFight(fight.title, fight.bets, calendarTexts);
  }
  return [...fights.values()];
}

type EventGroup = {
  title: string;
  meta: string;
  when: string | null;
  bets: Bet[];
  calendarTexts: string[];
};

function latestInstant(values: readonly string[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms < bestMs) continue;
    best = value;
    bestMs = ms;
  }
  return best;
}

function compareEvents(left: DeskEvent, right: DeskEvent, nowMs: number): number {
  const leftMs = left.when ? Date.parse(left.when) : Number.NaN;
  const rightMs = right.when ? Date.parse(right.when) : Number.NaN;
  const leftUp = Number.isFinite(leftMs) && leftMs >= nowMs;
  const rightUp = Number.isFinite(rightMs) && rightMs >= nowMs;
  if (leftUp !== rightUp) return leftUp ? -1 : 1;
  if (leftUp && rightUp) return leftMs - rightMs;
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return rightMs - leftMs;
  if (Number.isFinite(leftMs) !== Number.isFinite(rightMs)) return Number.isFinite(leftMs) ? -1 : 1;
  return left.title.localeCompare(right.title);
}

function calendarTouches(
  event: CalendarEvent,
  slug: string,
  title: string,
  fightTitles: readonly string[],
): boolean {
  if (!isFightRow(event)) return false;
  if (calendarFightSlug(event) === slug) return true;
  if (eventSlugFromTitle(event.title) === slug) return true;
  if (titlesAlign(event.title, title)) return true;
  const key = boutKey(event.title);
  if (!key) return false;
  if (boutKey(title) === key) return true;
  return fightTitles.some((fight) => boutKey(fight) === key);
}

/** UFC and Contender Series. Events are upcoming first, then past, newest past first. */
export function fightPromotions(input: {
  bets: readonly Bet[];
  events?: readonly CalendarEvent[];
  now?: Date;
}): DeskPromotion[] {
  const events = input.events ?? [];
  const nowMs = (input.now ?? new Date()).getTime();
  const grouped = new Map<string, EventGroup>();

  const ensure = (slug: string, title: string): EventGroup => {
    const current = grouped.get(slug) ?? {
      title,
      meta: "",
      when: null,
      bets: [],
      calendarTexts: [],
    };
    if (!current.title) current.title = title;
    grouped.set(slug, current);
    return current;
  };

  const ufcBets = betsForEventSlug(input.bets, UFC_332_ID, events);
  const ufcGroup = ensure(UFC_332_ID, UFC_332_EVENT.name);
  ufcGroup.bets = ufcBets;
  ufcGroup.meta = `${UFC_332_EVENT.venue}, ${UFC_332_EVENT.city}`;
  ufcGroup.when = `${UFC_332_DATE}T19:00:00-05:00`;

  for (const bet of input.bets) {
    const slug = betEventSlug(bet, events);
    if (!slug || slug === UFC_332_ID || isReservedFightSlug(slug)) continue;
    const group = ensure(slug, bet.event);
    group.bets.push(bet);
    group.title = bet.event || group.title;
  }

  for (const event of events) {
    const slug = calendarFightSlug(event);
    if (!slug || slug === UFC_332_ID || isReservedFightSlug(slug)) continue;
    const group = ensure(slug, event.title);
    if (group.bets.length === 0) group.title = event.title;
    group.meta = event.location ?? group.meta;
    group.calendarTexts.push(`${event.id} ${event.title}`);
    group.when = latestInstant([group.when ?? "", event.start].filter(Boolean));
  }

  for (const [slug, group] of grouped) {
    if (slug === UFC_332_ID) {
      for (const event of events) {
        if (!calendarTouches(event, slug, group.title, [])) continue;
        group.calendarTexts.push(`${event.id} ${event.title}`);
      }
      continue;
    }
    const fightTitles = group.bets.map((bet) => bet.fight);
    for (const event of events) {
      if (calendarFightSlug(event) === slug) continue;
      if (!calendarTouches(event, slug, group.title, fightTitles)) continue;
      group.calendarTexts.push(`${event.id} ${event.title}`);
      group.when = latestInstant([group.when ?? "", event.start].filter(Boolean));
      if (!group.meta && event.location) group.meta = event.location;
    }
    if (!group.when) {
      group.when = latestInstant(group.bets.map((bet) => bet.time));
    }
  }

  const deskEvents: DeskEvent[] = [...grouped.entries()].map(([slug, group]) => ({
    slug,
    title: group.title,
    href: `/fights/${slug}`,
    meta: group.meta,
    when: group.when,
    bets: group.bets,
    fights:
      slug === UFC_332_ID
        ? ufc332Fights.map((fight) => catalogFightRow(fight, group.bets))
        : listedFights(group.bets, group.calendarTexts),
  }));

  const byPromotion = new Map<FightPromotionId, DeskEvent[]>(
    FIGHT_PROMOTIONS.map((promotion) => [promotion.id, []]),
  );
  for (const event of deskEvents) {
    const id = promotionForEvent({ slug: event.slug, title: event.title });
    byPromotion.get(id)?.push(event);
  }

  return FIGHT_PROMOTIONS.map((promotion) => ({
    id: promotion.id,
    label: promotion.label,
    href: fightPromotionHref(promotion.id),
    events: (byPromotion.get(promotion.id) ?? [])
      .slice()
      .sort((left, right) => compareEvents(left, right, nowMs)),
  }));
}

export type EventBoutLayout =
  | { kind: "list"; fights: DeskFight[] }
  | {
      kind: "sections";
      sections: { id: BoutSegment; label: string; fights: DeskFight[] }[];
    };

/**
 * Main Card and Prelims only when every bout already has a segment.
 * A card with no segment info stays one list.
 */
export function eventBoutSections(fights: readonly DeskFight[]): EventBoutLayout {
  if (fights.length === 0 || fights.some((fight) => fight.segment === null)) {
    return { kind: "list", fights: [...fights] };
  }
  const prelims = fights.filter((fight) => fight.segment === "prelims");
  const main = fights.filter((fight) => fight.segment === "main-card");
  const sections: { id: BoutSegment; label: string; fights: DeskFight[] }[] = [];
  if (prelims.length > 0) sections.push({ id: "prelims", label: "Prelims", fights: prelims });
  if (main.length > 0) sections.push({ id: "main-card", label: "Main Card", fights: main });
  if (sections.length === 0) return { kind: "list", fights: [...fights] };
  return { kind: "sections", sections };
}

export type ResolvedFightEvent =
  | { kind: "ufc-332"; slug: typeof UFC_332_ID; title: string; bets: Bet[] }
  | {
      kind: "listed";
      slug: string;
      title: string;
      meta: string;
      bets: Bet[];
      fights: DeskFight[];
    };

/** A slug with UFC 332, matching bets, or a calendar fight row. Anything else is absent. */
export function resolveFightEventPage(
  slug: string,
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
): ResolvedFightEvent | null {
  const id = slug.trim().toLowerCase();
  if (!SLUG.test(id) || isReservedFightSlug(id)) return null;
  if (id === UFC_332_ID) {
    return {
      kind: "ufc-332",
      slug: UFC_332_ID,
      title: UFC_332_EVENT.name,
      bets: betsForEventSlug(bets, id, events),
    };
  }
  const scoped = betsForEventSlug(bets, id, events);
  const calendar = events.filter((event) => calendarFightSlug(event) === id);
  if (scoped.length === 0 && calendar.length === 0) return null;
  const listed = fightPromotions({ bets, events })
    .flatMap((promotion) => promotion.events)
    .find((event) => event.slug === id);
  const title = scoped[0]?.event || listed?.title || calendar[0]?.title || id;
  const meta = [calendar[0]?.location, calendar[0]?.note].filter(Boolean).join(" · ");
  return {
    kind: "listed",
    slug: id,
    title,
    meta,
    bets: scoped,
    fights: listed?.fights ?? listedFights(scoped, calendar.map((event) => `${event.id} ${event.title}`)),
  };
}

/** Two names from a "A vs B" title. Anything else is not a bout. */
export function fightersFromTitle(title: string): string[] {
  const parts = title
    .split(/\s+vs\.?\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return [];
  return parts;
}

/**
 * Bouts a result may name. UFC 332 comes from the catalog.
 * Every other card comes from bets on that event slug.
 */
export function knownBouts(
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
): KnownBout[] {
  const map = new Map<string, KnownBout>();
  for (const fight of ufc332Fights) {
    map.set(`${UFC_332_ID}\0${fight.slug}`, {
      event: UFC_332_ID,
      fightSlug: fight.slug,
      fighters: [fight.A.name, fight.B.name],
    });
  }
  for (const bet of bets) {
    const event = betEventSlug(bet, events);
    if (!event) continue;
    const key = `${event}\0${bet.fightSlug}`;
    if (map.has(key)) continue;
    const fighters = fightersFromTitle(bet.fight);
    if (fighters.length < 2) continue;
    map.set(key, { event, fightSlug: bet.fightSlug, fighters });
  }
  return [...map.values()];
}

export type FightLinkTarget = {
  slug: string;
  title: string;
};

/** Event pages the calendar may link. One row per slug. */
export function fightLinkTargets(
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
): FightLinkTarget[] {
  const seen = new Set<string>();
  const targets: FightLinkTarget[] = [];
  for (const promotion of fightPromotions({ bets, events })) {
    for (const event of promotion.events) {
      if (seen.has(event.slug)) continue;
      seen.add(event.slug);
      targets.push({ slug: event.slug, title: event.title });
    }
  }
  return targets;
}
