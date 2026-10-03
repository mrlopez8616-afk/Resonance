import type { CalendarEvent } from "@/data/calendar";

/**
 * Event slugs that have a /fights/<slug> page.
 * A hub row for a later card keeps its slug and renders as text until that page exists.
 */
export const PUBLISHED_FIGHT_EVENT_IDS = ["ufc-332"] as const;

const FIGHT_PATH = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

export function isPublishedFightEvent(slug: string): boolean {
  const id = slug.trim().toLowerCase();
  return (PUBLISHED_FIGHT_EVENT_IDS as readonly string[]).includes(id);
}

export function fightEventPageHref(slug: string): string | undefined {
  const id = slug.trim().toLowerCase();
  if (!isPublishedFightEvent(id)) return undefined;
  return `/fights/${id}`;
}

/** Event page for a calendar row. Unpublished /fights/<slug> paths are omitted. */
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
 * A /fights path is used only when that event page exists. Other site paths and https links stay.
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
