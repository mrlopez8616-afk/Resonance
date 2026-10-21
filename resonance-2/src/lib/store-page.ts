import "server-only";

import { cache } from "react";
import { summarizeBets, type Bet, type FightDeskSummary } from "@/lib/bets";
import { loadBetsStore } from "@/lib/bets-store";
import { dedupeFightCalendarEvents, ensureSeededCalendarEnvelope } from "@/lib/calendar-store-core";
import { loadCalendarStore, type CalendarStoreBackend } from "@/lib/calendar-store";
import type { CalendarEvent } from "@/data/calendar";
import type { FightBreakdown } from "@/lib/fight-breakdowns";
import { loadFightBreakdownsStore } from "@/lib/fight-breakdowns-store";
import type { FightResult } from "@/lib/fight-results";
import { loadFightResultsStore } from "@/lib/fight-results-store";
import { getSession } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import {
  isStorageUnavailable,
  type StoreAvailability,
} from "@/lib/storage-unavailable";

export type DurableBackend = "postgres" | "blob" | "file";

export type BetsPage =
  | { status: "live"; bets: Bet[]; backend: DurableBackend; stale?: boolean }
  | { status: "unconfigured"; bets: Bet[] }
  | { status: "unavailable"; reason: string };

export type FightResultsPage =
  | { status: "live"; results: FightResult[]; backend: DurableBackend; stale?: boolean }
  | { status: "unconfigured"; results: FightResult[] }
  | { status: "unavailable"; reason: string };

export type BreakdownsPage =
  | { status: "live"; breakdowns: FightBreakdown[]; backend: DurableBackend; updatedAt: string; stale?: boolean }
  | { status: "unconfigured"; breakdowns: FightBreakdown[]; updatedAt: string }
  | { status: "unavailable"; reason: string };

export function readIsStale(page: { status: string; stale?: boolean } | null | undefined): boolean {
  return page != null && page.status !== "unavailable" && page.stale === true;
}

/** Keep an error line. With no error, a stale read asks the shell for the stale label. */
export function withStaleDetail(
  detail: string | null,
  ...pages: readonly ({ status: string; stale?: boolean } | null | undefined)[]
): string | null {
  if (detail) return detail;
  return pages.some((page) => readIsStale(page)) ? "stale" : null;
}

function liveBackend(backend: string): DurableBackend {
  if (backend === "postgres" || backend === "blob") return backend;
  return "file";
}

export const loadFightResultsForPage = cache(async (): Promise<FightResultsPage> => {
  try {
    const loaded = await loadFightResultsStore();
    if (!loaded.configured) {
      return { status: "unconfigured", results: loaded.envelope.results };
    }
    return {
      status: "live",
      results: loaded.envelope.results,
      backend: liveBackend(loaded.backend),
      ...(loaded.stale ? { stale: true as const } : {}),
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { status: "unavailable", reason: error.reason };
  }
});

export const loadBreakdownsForPage = cache(async (): Promise<BreakdownsPage> => {
  try {
    const loaded = await loadFightBreakdownsStore();
    if (!loaded.configured) {
      return {
        status: "unconfigured",
        breakdowns: loaded.envelope.breakdowns,
        updatedAt: loaded.envelope.updatedAt,
      };
    }
    return {
      status: "live",
      breakdowns: loaded.envelope.breakdowns,
      backend: liveBackend(loaded.backend),
      updatedAt: loaded.envelope.updatedAt,
      ...(loaded.stale ? { stale: true as const } : {}),
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { status: "unavailable", reason: error.reason };
  }
});

/** Owner sees the Postgres reason. Public mode and every other viewer get the generic line. */
export function ownerBetFailureDetail(
  reason: string,
  viewer: { role?: string | null; publicMode: boolean },
): string {
  if (viewer.publicMode || viewer.role !== "owner") return "Bet book is unavailable.";
  const text = reason.trim();
  return text || "Bet book is unavailable.";
}

export async function betBookLine(book: BetsPage): Promise<string | null> {
  if (book.status !== "unavailable") return null;
  const [session, publicMode] = await Promise.all([getSession(), isPublicMode()]);
  return ownerBetFailureDetail(book.reason, { role: session?.role, publicMode });
}

export const loadBetsForPage = cache(async (): Promise<BetsPage> => {
  try {
    const loaded = await loadBetsStore();
    if (!loaded.configured) {
      return { status: "unconfigured", bets: loaded.envelope.bets };
    }
    return {
      status: "live",
      bets: loaded.envelope.bets,
      backend: liveBackend(loaded.backend),
      ...(loaded.stale ? { stale: true as const } : {}),
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { status: "unavailable", reason: error.reason };
  }
});

export type FightDeskPage =
  | { status: "live"; summary: FightDeskSummary; stale?: boolean }
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
  return { status: "live", summary, ...(book.stale ? { stale: true as const } : {}) };
}

export function storeLabel(
  status: StoreAvailability,
  backend?: DurableBackend | CalendarStoreBackend,
): string {
  if (status === "seed-only") return "seed-only";
  if (status === "unavailable") return "unavailable";
  if (status === "unconfigured") return "seed fallback";
  return backend === "postgres" || backend === "blob" ? "durable store" : "local store";
}

export type CalendarPage = {
  status: "live" | "unconfigured" | "seed-only";
  events: CalendarEvent[];
  storeLabel: string;
  reason?: string;
  stale?: boolean;
};

export const loadCalendarForPage = cache(async (): Promise<CalendarPage> => {
  try {
    const loaded = await loadCalendarStore();
    const status: StoreAvailability = loaded.configured ? "live" : "unconfigured";
    return {
      status: status === "live" ? "live" : "unconfigured",
      events: dedupeFightCalendarEvents(loaded.envelope.events),
      storeLabel: storeLabel(status, loaded.backend),
      ...(loaded.stale ? { stale: true as const } : {}),
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return {
      status: "seed-only",
      events: dedupeFightCalendarEvents(ensureSeededCalendarEnvelope(null).envelope.events),
      storeLabel: "seed-only",
      reason: error.reason,
    };
  }
});
