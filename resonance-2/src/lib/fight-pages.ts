import type { CalendarEvent } from "@/data/calendar";
import { ufcNodeHint } from "@/lib/fight-desk";
import { UFC_332_ID } from "@/lib/ufc332";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

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
 * Detail action target.
 * A /fights path is used when the slug resolves. Other site paths and https links stay.
 */
export function calendarOpenHref(
  event: Pick<CalendarEvent, "id" | "title" | "eventSlug" | "link">,
): string | undefined {
  const page = fightPageHref(event);
  if (page) return page;
  const link = event.link;
  if (!link || link.startsWith("/fights/")) return undefined;
  return link;
}
