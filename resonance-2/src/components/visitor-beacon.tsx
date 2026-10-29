"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One anonymous hit per navigation. No cookie is written.
 * The root layout mounts this on the login screen and on every signed-in
 * page, including Public view, so those visits are counted.
 */
export function VisitorBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
    const path = (pathname ?? "/").split("?")[0] || "/";
    if (!path.startsWith("/") || path.startsWith("//")) return;
    void fetch("/api/visitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
      redirect: "manual",
      credentials: "same-origin",
    });
  }, [pathname]);
  return null;
}
