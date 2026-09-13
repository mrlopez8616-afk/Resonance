/**
 * Path rules for the site lock (src/proxy.ts).
 *
 * Decision-sync APIs pass through even when the cookie is missing so the
 * route can return JSON 401 and so hub Bearer tokens still work. Page
 * navigations keep the HTML unlock redirect.
 */
export const PUBLIC_GATE_PATHS = new Set([
  "/unlock",
  "/api/gate",
  "/api/health",
  "/api/public",
]);

export function isDecisionSyncApi(pathname: string): boolean {
  return (
    pathname === "/api/decisions" ||
    pathname.startsWith("/api/decisions/") ||
    pathname === "/api/todos" ||
    pathname.startsWith("/api/todos/") ||
    pathname === "/api/attest" ||
    pathname.startsWith("/api/attest/") ||
    pathname === "/api/ack" ||
    pathname.startsWith("/api/ack/") ||
    pathname === "/api/xrpl-mirror" ||
    pathname.startsWith("/api/xrpl-mirror/")
  );
}

export function shouldBypassAppGate(pathname: string): boolean {
  return (
    PUBLIC_GATE_PATHS.has(pathname) ||
    pathname.startsWith("/api/gate") ||
    isDecisionSyncApi(pathname)
  );
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
