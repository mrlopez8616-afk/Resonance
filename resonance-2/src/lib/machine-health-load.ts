import "server-only";

import { loadBuildItems } from "@/lib/build-store";
import { loadControlRoom } from "@/lib/control-room-store";
import { scoreMachineHealth, type MachineHealthReport } from "@/lib/machine-health";
import { loadPublicFloor } from "@/lib/public-load";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return null;
  }
}

/**
 * One health report. A source that cannot be read is not connected.
 * `storageDown` is true only when the book, the tracker, and the Control Room all failed.
 */
export async function loadMachineHealth(options: {
  publicMode: boolean;
  now?: Date;
}): Promise<{ report: MachineHealthReport; storageDown: boolean }> {
  const now = options.now ?? new Date();
  const [floor, build, control] = await Promise.all([
    orNull(loadPublicFloor()),
    orNull(loadBuildItems()),
    orNull(loadControlRoom({ publicMode: options.publicMode, probeLive: true, now })),
  ]);
  return {
    storageDown: floor === null && build === null && control === null,
    report: scoreMachineHealth({
      floor: floor?.model ?? null,
      buildItems: build?.items ?? null,
      control,
      publicMode: options.publicMode,
      now,
    }),
  };
}
