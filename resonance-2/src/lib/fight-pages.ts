import type { CalendarEvent } from "@/data/calendar";
import { chicagoDay } from "@/lib/calendar-time";
import { ufcNodeHint, type FightLinkTarget } from "@/lib/fight-desk";
import { personSlug, UFC_332_ID } from "@/lib/ufc332";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;
const BOUT =
  /([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)\s+vs\.?\s+([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)/i;

export type FightLinkContext = {
  events?: readonly CalendarEvent[];
  targets?: readonly FightLinkTarget[];
};

/** Any well-formed event slug has a /fights/<slug> page. The page 404s when nothing resolves to it. */
export function fightEventPageHref(slug: string): string | undefined {
  const id = slug.trim().toLowerCase();
  if (!SLUG.test(id)) return undefined;
  return `/fights/${id}`;
}

function withNodeHint(
  href: string,
  event: Pick<CalendarEvent, "id" | "title">,
): string {
  if (href !== `/fights/${UFC_332_ID}`) return href;
  const node = ufcNodeHint(event);
  if (!node) return href;
  return `${href}?node=${node}`;
}

function isFightRow(event: Pick<CalendarEvent, "kind" | "lane">): boolean {
  return event.kind === "fight" || event.lane === "fights";
}

function boutKey(title: string): string | null {
  const match = BOUT.exec(title.toLowerCase());
  if (!match?.[1] || !match[2]) return null;
  return `${personSlug(match[1])} vs ${personSlug(match[2])}`;
}

function cardStem(title: string): string {
  let text = title.toLowerCase();
  text = text.replace(BOUT, " ");
  text = text.replace(/\b(early prelims|prelims|main card|early-prelims|main-card)\b/g, " ");
  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function matchFightTarget(
  event: CalendarEvent,
  events: readonly CalendarEvent[],
  targets: readonly FightLinkTarget[],
): FightLinkTarget | null {
  if (!isFightRow(event) || targets.length === 0) return null;
  const ownBout = boutKey(event.title);
  if (ownBout) {
    const hits = targets.filter((target) => boutKey(target.title) === ownBout);
    if (hits.length === 1) return hits[0] ?? null;
    if (hits.length > 1) return null;
  }
  const stem = cardStem(event.title);
  const day = chicagoDay(event.start);
  if (!stem || !day) return null;
  const siblingHits = new Map<string, FightLinkTarget>();
  for (const other of events) {
    if (other.id === event.id || !isFightRow(other)) continue;
    if (chicagoDay(other.start) !== day || cardStem(other.title) !== stem) continue;
    const otherBout = boutKey(other.title);
    if (!otherBout) continue;
    const hits = targets.filter((target) => boutKey(target.title) === otherBout);
    if (hits.length === 1 && hits[0]) siblingHits.set(hits[0].slug, hits[0]);
  }
  if (siblingHits.size !== 1) return null;
  return [...siblingHits.values()][0] ?? null;
}

/** Event page for a calendar row. A fight row links when its slug resolves. */
export function fightPageHref(
  event: Pick<CalendarEvent, "id" | "title" | "eventSlug" | "link">,
): string | undefined {
  if (event.eventSlug) {
    const page = fightEventPageHref(event.eventSlug);
    if (page) return withNodeHint(page, event);
  }
  const match = FIGHT_PATH.exec(event.link ?? "");
  if (!match) return undefined;
  const page = fightEventPageHref(match[1] ?? "");
  if (!page) return undefined;
  return withNodeHint(page, event);
}

/**
 * Calendar fight href. An explicit slug or /fights path wins.
 * Otherwise link to an event page that already exists when the bout or the same-day card matches.
 */
export function calendarFightHref(
  event: CalendarEvent,
  context?: FightLinkContext,
): string | undefined {
  const explicit = fightPageHref(event);
  if (explicit) return explicit;
  const targets = context?.targets ?? [];
  const events = context?.events ?? [];
  const target = matchFightTarget(event, events, targets);
  if (!target) return undefined;
  const page = fightEventPageHref(target.slug);
  if (!page) return undefined;
  const hint = ufcNodeHint(event);
  if (hint && hint === target.node) return `${page}?node=${hint}`;
  return page;
}

/**
 * Detail action target.
 * A /fights path is used when the slug resolves. Other site paths and https links stay.
 */
export function calendarOpenHref(
  event: CalendarEvent,
  context?: FightLinkContext,
): string | undefined {
  const page = calendarFightHref(event, context);
  if (page) return page;
  const link = event.link;
  if (!link || link.startsWith("/fights/")) return undefined;
  return link;
}
