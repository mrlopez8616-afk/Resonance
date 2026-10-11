"use client";

import { SystemLive } from "@/components/system-live";

/** The live map, always in public wall mode. Slow or missing WebGL falls back to the static map. */
export function TvLive() {
  return <SystemLive publicMode wall />;
}
