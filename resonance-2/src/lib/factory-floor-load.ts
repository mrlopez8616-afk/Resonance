import "server-only";

import { countPendingApprovals } from "@/lib/approvals-store";
import { loadBuildItems } from "@/lib/build-store";
import { loadControlRoom } from "@/lib/control-room-store";
import {
  assembleFactoryFloor,
  factoryFloorLeaks,
  MACHINE_HEALTH,
  type FactoryFloorModel,
} from "@/lib/factory-floor";
import { readLessons } from "@/lib/lessons-store";
import { loadXrpTriggerCloses } from "@/lib/price-history";
import { loadPublicFloor } from "@/lib/public-load";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return null;
  }
}

/**
 * Public is the only mode on /tv. The site toggle is ignored.
 * Dollar amounts stay inside the loaders. The model is checked before render.
 */
export async function loadFactoryFloor(now = new Date()): Promise<FactoryFloorModel> {
  const [floor, build, control, approvalsPending, closes, lessons, calendar, bets] = await Promise.all([
    orNull(loadPublicFloor()),
    orNull(loadBuildItems()),
    orNull(loadControlRoom({ publicMode: true, probeLive: true, now })),
    orNull(countPendingApprovals()),
    loadXrpTriggerCloses().catch(() => null),
    orNull(readLessons()),
    orNull(loadCalendarForPage()),
    orNull(loadBetsForPage()),
  ]);

  const model = assembleFactoryFloor({
    now,
    floor: floor?.model ?? null,
    buildItems: build?.items ?? null,
    control,
    approvalsPending,
    closes,
    lessons,
    events: calendar?.events ?? null,
    bets: bets && bets.status !== "unavailable" ? bets.bets : null,
    machine: MACHINE_HEALTH,
  });
  const leaks = factoryFloorLeaks(model);
  if (leaks.length > 0) {
    throw new Error("Factory floor refused a private value.");
  }
  return model;
}
