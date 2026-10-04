import "server-only";

import { cache } from "react";
import { summarizeBets, type Bet, type FightDeskSummary } from "@/lib/bets";
import { loadBetsStore } from "@/lib/bets-store";
import { ensureSeededCalendarEnvelope } from "@/lib/calendar-store-core";
import { loadCalendarStore, type CalendarStoreBackend } from "@/lib/calendar-store";
import type { CalendarEvent } from "@/data/calendar";
import {
  isStorageUnavailable,
  type StoreAvailability,
} from "@/lib/storage-unavailable";

export type BetsPage =
  | { status: "live"; bets: Bet[]; backend: "blob" | "file" }
  | { status: "unconfigured"; bets: Bet[] }
  | { status: "unavailable"; reason: string };

export const loadBetsForPage = cache(async (): Promise<BetsPage> => {
  try {
    const loaded = await loadBetsStore();
    if (!loaded.configured) {
      return { status: "unconfigured", bets: loaded.envelope.bets };
    }
    return {
      status: "live",
      bets: loaded.envelope.bets,
      backend: loaded.backend === "blob" ? "blob" : "file",
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { status: "unavailable", reason: error.reason };
  }
});

export type FightDeskPage =
  | { status: "live"; summary: FightDeskSummary }
  | { status: "seed-only"; summary: FightDeskSummary }
  | { status: "unavailable"; summary: null; reason: string };

/** Floor tile. One cached bets read, summary only — the bet rows stay on /fights and /log. */
export async function loadFightDeskSummary(): Promise<FightDeskPage> {
  const book = await loadBetsForPage();
  if (book.status === "unavailable") {
    return { status: "unavailable", summary: null, reason: book.reason };
  }
  const summary = summarizeBets(book.bets);
  if (book.status === "unconfigured") return { status: "seed-only", summary };
  return { status: "live", summary };
}

export function storeLabel(
  status: StoreAvailability,
  backend?: "blob" | "file" | CalendarStoreBackend,
): string {
  if (status === "seed-only") return "seed-only";
  if (status === "unavailable") return "unavailable";
  if (status === "unconfigured") return "seed fallback";
  return backend === "blob" ? "durable store" : "local store";
}

export type CalendarPage = {
  status: "live" | "unconfigured" | "seed-only";
  events: CalendarEvent[];
  storeLabel: string;
  reason?: string;
};

export const loadCalendarForPage = cache(async (): Promise<CalendarPage> => {
  try {
    const loaded = await loadCalendarStore();
    const status: StoreAvailability = loaded.configured ? "live" : "unconfigured";
    return {
      status: status === "live" ? "live" : "unconfigured",
      events: loaded.envelope.events,
      storeLabel: storeLabel(status, loaded.backend),
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return {
      status: "seed-only",
      events: ensureSeededCalendarEnvelope(null).envelope.events,
      storeLabel: "seed-only",
      reason: error.reason,
    };
  }
});
