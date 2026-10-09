import "server-only";

import type { CalendarEvent } from "@/data/calendar";
import { scrubTextFields } from "@/lib/public-mode";
import { isPublicMode } from "@/lib/public-mode-server";
import { loadCalendarForPage, type CalendarPage } from "@/lib/store-page";

export async function loadCatalystPage(): Promise<{
  events: CalendarEvent[];
  store: CalendarPage;
}> {
  const [store, pub] = await Promise.all([loadCalendarForPage(), isPublicMode()]);
  return {
    store,
    events: pub ? store.events.map((event) => scrubTextFields(event)) : store.events,
  };
}
