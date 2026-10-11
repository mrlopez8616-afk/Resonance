/**
 * TV wall stay-awake and refresh decisions.
 * The browser calls live here. These functions stay free of `window`
 * so the fallback rules can be tested on their own.
 */

export const TV_POLL_MS = 60_000;
export const TV_RELOAD_MS = 3 * 60 * 60 * 1000;
export const TV_FULLSCREEN_HIDE_MS = 4_000;
export const TV_CURSOR_IDLE_MS = 3_000;

export type ScreenWakeLock = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

export type WakeLockNavigator = {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLock>;
  };
};

export function wakeLockSupported(nav: WakeLockNavigator): boolean {
  return typeof nav.wakeLock?.request === "function";
}

/** A held screen lock, or null when the browser has no API or refuses the request. */
export async function acquireScreenWakeLock(nav: WakeLockNavigator): Promise<ScreenWakeLock | null> {
  if (!wakeLockSupported(nav) || !nav.wakeLock) return null;
  try {
    const lock = await nav.wakeLock.request("screen");
    if (!lock || lock.released) return null;
    return lock;
  } catch {
    return null;
  }
}

/** Missing or already released locks use the muted looping video. */
export function wakeLockFallbackNeeded(lock: { released?: boolean } | null | undefined): boolean {
  return lock == null || lock.released === true;
}

/** Re-acquire only when the page is visible again. A hidden tab stays quiet. */
export function shouldReacquireWakeLock(visibility: string): boolean {
  return visibility === "visible";
}

/** Skip the poll while the browser reports offline so the last paint stays. */
export function shouldPollRefresh(online: boolean): boolean {
  return online;
}

/** Full reload is the safety net. Skip it while offline so the wall is not replaced by an error page. */
export function shouldFullReload(elapsedMs: number, online: boolean, reloadMs = TV_RELOAD_MS): boolean {
  return online && Number.isFinite(elapsedMs) && elapsedMs >= reloadMs;
}
