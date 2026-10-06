import type { CalendarEvent } from "@/data/calendar";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

/** Any well-formed event slug has a /fights/<slug> page. The page 404s when nothing resolves to it. */
export function fightEventPageHref(slug: string): string | undefined {
  const id = slug.trim().toLowerCase();
  if (!SLUG.test(id)) return undefined;
  return `/fights/${id}`;
}

/** Event page for a calendar row. A fight row links when its slug resolves. */
export function fightPageHref(
  event: Pick<CalendarEvent, "eventSlug" | "link">,
): string | undefined {
  if (event.eventSlug) {
    const page = fightEventPageHref(event.eventSlug);
    if (page) return page;
  }
  const match = FIGHT_PATH.exec(event.link ?? "");
  if (!match) return undefined;
  return fightEventPageHref(match[1] ?? "");
}

/**
 * Detail action target.
 * A /fights path is used when the slug resolves. Other site paths and https links stay.
 */
export function calendarOpenHref(
  event: Pick<CalendarEvent, "eventSlug" | "link">,
): string | undefined {
  const page = fightPageHref(event);
  if (page) return page;
  const link = event.link;
  if (!link || link.startsWith("/fights/")) return undefined;
  return link;
}
