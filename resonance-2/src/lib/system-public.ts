import "server-only";

import { cookies } from "next/headers";
import { PUBLIC_MODE_COOKIE, resolveLivePublicMode } from "@/lib/system-live";

type PublicModeModule = {
  isPublicMode?: () => boolean | Promise<boolean>;
};

/**
 * Call `isPublicMode` when that module is on this deploy.
 * The specifier stays out of the static import graph so a missing file
 * does not fail typecheck or the build. A missing helper uses the cookie.
 */
async function loadIsPublicMode(): Promise<(() => Promise<boolean>) | null> {
  const specifier = "@/lib/public-mode-server";
  try {
    const load = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<PublicModeModule>;
    const mod = await load(specifier);
    if (typeof mod.isPublicMode !== "function") return null;
    const read = mod.isPublicMode;
    return () => Promise.resolve(read());
  } catch {
    return null;
  }
}

export async function readLivePublicMode(): Promise<boolean> {
  const helper = await loadIsPublicMode();
  const jar = await cookies();
  return resolveLivePublicMode(helper, jar.get(PUBLIC_MODE_COOKIE)?.value);
}
