"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One anonymous hit per navigation. No cookie is written.
 * Logged-out, this only runs on the login screen, and only that page counts.
 * A signed-in page, including Public view, sends the session and counts too.
 * The floor stays behind login.
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
