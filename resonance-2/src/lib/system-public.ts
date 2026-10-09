import "server-only";

import { isPublicMode } from "@/lib/public-mode-server";

/** Owner public mode, from the real server check. */
export async function readLivePublicMode(): Promise<boolean> {
  return isPublicMode();
}
