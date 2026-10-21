import type { ReactNode } from "react";
import { TrackerFloor } from "@/components/fight-tier-tracker";
import { OperatorShell } from "@/components/operator-shell";
import {
  buildTierTracker,
  cardHref,
  parseSliceId,
  parseTrackerEventSlug,
  sliceHref,
  trackerCard,
  trackerPicks,
  trackerSlice,
  type TierTrackerModel,
} from "@/lib/fight-tier-tracker";
import { isPublicMode } from "@/lib/public-mode-server";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import {
  betBookLine,
  loadBetsForPage,
  loadBreakdownsForPage,
  loadCalendarForPage,
} from "@/lib/store-page";

export async function loadTierTracker(): Promise<{
  model: TierTrackerModel;
  storageMessage: string | null;
  storageDetail: string | null;
  meta: string | null;
  publicMode: boolean;
}> {
  const [book, calendar, breakdowns, publicMode] = await Promise.all([
    loadBetsForPage(),
    loadCalendarForPage(),
    loadBreakdownsForPage(),
    isPublicMode(),
  ]);
  const model = buildTierTracker({
    bets: book.status === "unavailable" ? [] : book.bets,
    events: calendar.events,
    breakdowns: breakdowns.status === "unavailable" ? [] : breakdowns.breakdowns,
    book: book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live",
    breakdownStore:
      breakdowns.status === "unavailable"
        ? "unavailable"
        : breakdowns.status === "unconfigured"
          ? "seed-only"
          : "live",
    publicMode,
  });
  const storageMessage =
    book.status === "unavailable" || breakdowns.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail =
    book.status === "unavailable"
      ? await betBookLine(book)
      : breakdowns.status === "unavailable"
        ? "Breakdowns are unavailable."
        : book.status === "unconfigured"
          ? "Bet book is seed-only."
          : null;
  return {
    model,
    storageMessage,
    storageDetail,
    meta: book.status === "unconfigured" ? "seed-only" : null,
    publicMode,
  };
}

export function TrackerShell({
  storageMessage,
  storageDetail,
  children,
}: {
  storageMessage: string | null;
  storageDetail: string | null;
  children: ReactNode;
}) {
  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail}>
      {children}
    </OperatorShell>
  );
}

export function HomeTracker({
  model,
  meta,
  publicMode,
}: {
  model: TierTrackerModel;
  meta: string | null;
  publicMode: boolean;
}) {
  return (
    <TrackerFloor
      backHref="/fights"
      backLabel="Fights"
      kicker="Fights"
      title="Tier tracker"
      meta={meta}
      tiles={model.homeTiles}
      empty={model.book === "unavailable" ? "unavailable" : "not recorded"}
      publicMode={publicMode}
    />
  );
}

export function SliceTracker({
  model,
  slice,
  meta,
  publicMode,
}: {
  model: TierTrackerModel;
  slice: string;
  meta: string | null;
  publicMode: boolean;
}) {
  const view = trackerSlice(model, slice);
  if (!view) return null;
  return (
    <TrackerFloor
      backHref="/fights/tiers"
      backLabel="Tier tracker"
      kicker="Tier tracker"
      title={view.name}
      meta={meta}
      tiles={view.tiles}
      empty={view.empty}
      publicMode={publicMode}
    />
  );
}

export function CardTracker({
  model,
  event,
  meta,
  publicMode,
}: {
  model: TierTrackerModel;
  event: string;
  meta: string | null;
  publicMode: boolean;
}) {
  const view = trackerCard(model, event);
  if (view) {
    return (
      <TrackerFloor
        backHref="/fights/tiers"
        backLabel="Tier tracker"
        kicker="Tier tracker"
        title={view.title}
        meta={meta}
        tiles={view.tiles}
        empty={view.empty}
        publicMode={publicMode}
      />
    );
  }
  if (model.book === "unavailable" && parseTrackerEventSlug(event)) {
    return (
      <TrackerFloor
        backHref="/fights/tiers"
        backLabel="Tier tracker"
        kicker="Tier tracker"
        title="not recorded"
        meta={meta}
        tiles={[]}
        empty="unavailable"
        publicMode={publicMode}
      />
    );
  }
  return null;
}

export function PickTracker({
  model,
  slice,
  event,
  from,
  meta,
  publicMode,
}: {
  model: TierTrackerModel;
  slice: string;
  event: string;
  from: "slice" | "card";
  meta: string | null;
  publicMode: boolean;
}) {
  const knownSlice = trackerSlice(model, slice);
  const sliceId = parseSliceId(slice);
  if (!knownSlice || !sliceId) return null;
  const view = trackerPicks(model, slice, event);
  const card = trackerCard(model, event);
  const fromCard = from === "card";
  const parent = fromCard ? (card?.title ?? "not recorded") : knownSlice.name;
  const title = fromCard ? knownSlice.name : (view?.title ?? "not recorded");
  const backHref = fromCard ? cardHref(event) : sliceHref(sliceId);
  if (!view) {
    if (model.book !== "unavailable" || !parseTrackerEventSlug(event)) return null;
  }
  return (
    <TrackerFloor
      backHref={backHref}
      backLabel={parent}
      kicker={parent}
      title={title}
      meta={meta}
      tiles={view?.tiles ?? []}
      empty={view?.empty ?? "unavailable"}
      publicMode={publicMode}
    />
  );
}
