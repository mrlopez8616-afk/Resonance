import type { CalendarEvent } from "@/data/calendar";
import type { Bet } from "@/lib/bets";
import type { KnownBout } from "@/lib/fight-results";
import {
  fightBySlug,
  fightsInSegment,
  personSlug,
  UFC_332_EVENT,
  UFC_332_ID,
  ufc332Fights,
  type CatalogFight,
} from "@/lib/ufc332";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

export const FIGHT_DESK_NODES = [
  { id: "main-card", label: "Main Card" },
  { id: "prelims", label: "Prelims" },
  { id: "contender-series", label: "Contender Series" },
] as const;

export type FightDeskNodeId = (typeof FIGHT_DESK_NODES)[number]["id"];

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

export type DeskFight = {
  slug: string;
  title: string;
  kicker: string;
  detail: string;
  href?: string;
  bets: Bet[];
};

export type DeskEvent = {
  slug: string;
  title: string;
  href: string;
  meta: string;
  fights: DeskFight[];
};

export type DeskNode = {
  id: FightDeskNodeId;
  label: string;
  href: string;
  events: DeskEvent[];
};

export function isFightDeskNodeId(value: string): value is FightDeskNodeId {
  return FIGHT_DESK_NODES.some((node) => node.id === value);
}

export function fightDeskNodeHref(id: FightDeskNodeId): string {
  return `/fights/${id}`;
}

export function fightDeskNodeLabel(id: FightDeskNodeId): string {
  return FIGHT_DESK_NODES.find((node) => node.id === id)?.label ?? id;
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

export function legalNodesForEvent(input: {
  slug?: string;
  title?: string;
}): readonly FightDeskNodeId[] {
  return fightEventKind(input) === "contender"
    ? ["contender-series"]
    : ["main-card", "prelims"];
}

function calendarHintsForSlug(
  slug: string,
  events: readonly CalendarEvent[],
): FightDeskNodeId[] {
  const hints: FightDeskNodeId[] = [];
  for (const event of events) {
    if (calendarFightSlug(event) !== slug) continue;
    const hint = ufcNodeHint(event);
    if (hint && !hints.includes(hint)) hints.push(hint);
  }
  return hints;
}

/**
 * A UFC card without per-bout segments sits on Main Card.
 * It sits on Prelims only when every calendar hint for that slug says prelims.
 */
export function defaultUfcNode(
  slug: string,
  title: string,
  events: readonly CalendarEvent[] = [],
): FightDeskNodeId {
  const hints = calendarHintsForSlug(slug, events);
  if (hints.length > 0 && hints.every((hint) => hint === "prelims")) return "prelims";
  return "main-card";
}

export function nodeForEvent(
  slug: string,
  title: string,
  events: readonly CalendarEvent[] = [],
): FightDeskNodeId {
  if (fightEventKind({ slug, title }) === "contender") return "contender-series";
  return defaultUfcNode(slug, title, events);
}

/** Main card, prelims (including early prelims), or Contender Series. */
export function nodeForBet(
  bet: Bet,
  events: readonly CalendarEvent[] = [],
): FightDeskNodeId | null {
  const slug = betEventSlug(bet, events);
  if (!slug) return null;
  if (fightEventKind({ slug, title: bet.event }) === "contender") return "contender-series";
  if (slug === UFC_332_ID) {
    const fight = fightBySlug(bet.fightSlug);
    if (!fight) return null;
    return fight.segment === "main-card" ? "main-card" : "prelims";
  }
  return defaultUfcNode(slug, bet.event, events);
}

export function betsForNode(
  bets: readonly Bet[],
  nodeId: FightDeskNodeId,
  events: readonly CalendarEvent[] = [],
): Bet[] {
  return bets.filter((bet) => nodeForBet(bet, events) === nodeId);
}

/**
 * One level up from an event page.
 * A node query wins when that node is a legal parent for the event.
 * UFC cards return to Main Card or Prelims. Contender Series is DWCS only.
 */
export function eventBackHref(
  eventSlug: string,
  requestedNode?: string | null,
  context?: { title?: string | null; events?: readonly CalendarEvent[] },
): { href: string; label: string } {
  const slug = eventSlug.trim().toLowerCase();
  const title = context?.title?.trim() ?? "";
  const events = context?.events ?? [];
  const legal = legalNodesForEvent({ slug, title });
  const requested = requestedNode?.trim().toLowerCase() ?? "";
  if (isFightDeskNodeId(requested) && legal.includes(requested)) {
    return { href: fightDeskNodeHref(requested), label: fightDeskNodeLabel(requested) };
  }
  const node = nodeForEvent(slug, title, events);
  return { href: fightDeskNodeHref(node), label: fightDeskNodeLabel(node) };
}

/** Segment hint on a UFC 332 calendar row. Early prelims stay with Prelims. */
export function ufcNodeHint(
  event: Pick<CalendarEvent, "id" | "title">,
): FightDeskNodeId | null {
  const text = `${event.id} ${event.title}`.toLowerCase();
  if (text.includes("main card") || text.includes("main-card")) return "main-card";
  if (text.includes("prelim")) return "prelims";
  return null;
}

function catalogFightRow(fight: CatalogFight, bets: readonly Bet[]): DeskFight {
  return {
    slug: fight.slug,
    title: `${fight.A.name} vs ${fight.B.name}`,
    kicker: `${fight.time} CT`,
    detail: fight.division,
    href: fight.href,
    bets: bets.filter((bet) => bet.fightSlug === fight.slug),
  };
}

function ufcEvent(
  fights: readonly CatalogFight[],
  bets: readonly Bet[],
  nodeId: FightDeskNodeId,
): DeskEvent {
  return {
    slug: UFC_332_ID,
    title: UFC_332_EVENT.name,
    href: `/fights/${UFC_332_ID}?node=${nodeId}`,
    meta: `${UFC_332_EVENT.venue}, ${UFC_332_EVENT.city}`,
    fights: fights.map((fight) => catalogFightRow(fight, bets)),
  };
}

function listedFights(bets: readonly Bet[]): DeskFight[] {
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
      bets: [bet],
    });
  }
  return [...fights.values()];
}

/** Main Card, Prelims, and Contender Series. UFC segments split the card. Other events group by slug. */
export function fightDeskNodes(input: {
  bets: readonly Bet[];
  events?: readonly CalendarEvent[];
}): DeskNode[] {
  const events = input.events ?? [];
  const ufcBets = betsForEventSlug(input.bets, UFC_332_ID, events);
  const grouped = new Map<string, { title: string; meta: string; bets: Bet[] }>();

  for (const bet of input.bets) {
    const slug = betEventSlug(bet, events);
    if (!slug || slug === UFC_332_ID) continue;
    const current = grouped.get(slug) ?? { title: bet.event, meta: "", bets: [] };
    current.bets.push(bet);
    current.title = bet.event || current.title;
    grouped.set(slug, current);
  }

  for (const event of events) {
    const slug = calendarFightSlug(event);
    if (!slug || slug === UFC_332_ID) continue;
    const current = grouped.get(slug) ?? { title: event.title, meta: "", bets: [] };
    if (current.bets.length === 0) current.title = event.title;
    current.meta = event.location ?? current.meta;
    grouped.set(slug, current);
  }

  const mainExtras: DeskEvent[] = [];
  const prelimExtras: DeskEvent[] = [];
  const contender: DeskEvent[] = [];
  const sorted = [...grouped.entries()].sort((left, right) =>
    left[1].title.localeCompare(right[1].title),
  );
  for (const [slug, group] of sorted) {
    const node = nodeForEvent(slug, group.title, events);
    const deskEvent: DeskEvent = {
      slug,
      title: group.title,
      href: `/fights/${slug}?node=${node}`,
      meta: group.meta,
      fights: listedFights(group.bets),
    };
    if (node === "contender-series") contender.push(deskEvent);
    else if (node === "prelims") prelimExtras.push(deskEvent);
    else mainExtras.push(deskEvent);
  }

  return [
    {
      id: "main-card",
      label: "Main Card",
      href: fightDeskNodeHref("main-card"),
      events: [ufcEvent(fightsInSegment("main-card"), ufcBets, "main-card"), ...mainExtras],
    },
    {
      id: "prelims",
      label: "Prelims",
      href: fightDeskNodeHref("prelims"),
      events: [
        ufcEvent(
          [...fightsInSegment("early-prelims"), ...fightsInSegment("prelims")],
          ufcBets,
          "prelims",
        ),
        ...prelimExtras,
      ],
    },
    {
      id: "contender-series",
      label: "Contender Series",
      href: fightDeskNodeHref("contender-series"),
      events: contender,
    },
  ];
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
  if (!SLUG.test(id) || isFightDeskNodeId(id)) return null;
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
  const listed = fightDeskNodes({ bets, events })
    .flatMap((node) => node.events)
    .find((event) => event.slug === id);
  const title = scoped[0]?.event || listed?.title || calendar[0]?.title || id;
  const meta = [calendar[0]?.location, calendar[0]?.note].filter(Boolean).join(" · ");
  return {
    kind: "listed",
    slug: id,
    title,
    meta,
    bets: scoped,
    fights: listed?.fights ?? listedFights(scoped),
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
  node: FightDeskNodeId;
};

/** Event pages the calendar may link. One row per slug. */
export function fightLinkTargets(
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
): FightLinkTarget[] {
  const seen = new Set<string>();
  const targets: FightLinkTarget[] = [];
  for (const node of fightDeskNodes({ bets, events })) {
    for (const event of node.events) {
      if (seen.has(event.slug)) continue;
      seen.add(event.slug);
      targets.push({ slug: event.slug, title: event.title, node: node.id });
    }
  }
  return targets;
}
