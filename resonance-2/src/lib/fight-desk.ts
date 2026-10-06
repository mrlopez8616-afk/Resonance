import type { CalendarEvent } from "@/data/calendar";
import type { Bet } from "@/lib/bets";
import {
  fightBySlug,
  fightsInSegment,
  personSlug,
  UFC_332_EVENT,
  UFC_332_ID,
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

/** Main card, prelims (including early prelims), or Contender Series. */
export function nodeForBet(
  bet: Bet,
  events: readonly CalendarEvent[] = [],
): FightDeskNodeId | null {
  if (!isUfc332Bet(bet)) {
    return betEventSlug(bet, events) ? "contender-series" : null;
  }
  const fight = fightBySlug(bet.fightSlug);
  if (!fight) return null;
  return fight.segment === "main-card" ? "main-card" : "prelims";
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
 * A `node` query from the node page wins. UFC 332 without one returns to Main Card.
 * Every other event returns to Contender Series.
 */
export function eventBackHref(
  eventSlug: string,
  requestedNode?: string | null,
): { href: string; label: string } {
  const requested = requestedNode?.trim().toLowerCase() ?? "";
  if (isFightDeskNodeId(requested)) {
    return { href: fightDeskNodeHref(requested), label: fightDeskNodeLabel(requested) };
  }
  if (eventSlug.trim().toLowerCase() === UFC_332_ID) {
    return { href: fightDeskNodeHref("main-card"), label: fightDeskNodeLabel("main-card") };
  }
  return { href: fightDeskNodeHref("contender-series"), label: fightDeskNodeLabel("contender-series") };
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

  const contender: DeskEvent[] = [...grouped.entries()]
    .sort((left, right) => left[1].title.localeCompare(right[1].title))
    .map(([slug, group]) => ({
      slug,
      title: group.title,
      href: `/fights/${slug}?node=contender-series`,
      meta: group.meta,
      fights: listedFights(group.bets),
    }));

  return [
    {
      id: "main-card",
      label: "Main Card",
      href: fightDeskNodeHref("main-card"),
      events: [ufcEvent(fightsInSegment("main-card"), ufcBets, "main-card")],
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
    .find((node) => node.id === "contender-series")
    ?.events.find((event) => event.slug === id);
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
