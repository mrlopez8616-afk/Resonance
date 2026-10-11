"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  acquireScreenWakeLock,
  shouldFullReload,
  shouldPollRefresh,
  shouldReacquireWakeLock,
  TV_CURSOR_IDLE_MS,
  TV_FULLSCREEN_HIDE_MS,
  TV_POLL_MS,
  TV_RELOAD_MS,
  wakeLockFallbackNeeded,
  type ScreenWakeLock,
} from "@/lib/tv-wake";

function requestFullscreen(node: HTMLElement) {
  const anyNode = node as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  if (node.requestFullscreen) {
    void node.requestFullscreen().catch(() => undefined);
    return;
  }
  anyNode.webkitRequestFullscreen?.();
}

export function TvRuntime({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [controls, setControls] = useState(true);
  const [fallback, setFallback] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lockRef = useRef<ScreenWakeLock | null>(null);
  const startedRef = useRef(0);

  const acquire = useCallback(async () => {
    const lock = await acquireScreenWakeLock(navigator);
    lockRef.current = lock;
    const needed = wakeLockFallbackNeeded(lock);
    setFallback(needed);
    if (!needed && lock) {
      const onRelease = () => {
        lock.removeEventListener("release", onRelease);
        if (lockRef.current === lock) lockRef.current = null;
        if (shouldReacquireWakeLock(document.visibilityState)) void acquire();
      };
      lock.addEventListener("release", onRelease);
    }
  }, []);

  useEffect(() => {
    startedRef.current = Date.now();
    const root = document.documentElement;
    root.classList.add("tv-page");
    void acquire();
    const onVis = () => {
      if (!shouldReacquireWakeLock(document.visibilityState)) return;
      if (wakeLockFallbackNeeded(lockRef.current)) void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      root.classList.remove("tv-page");
      root.classList.remove("tv-idle");
      document.removeEventListener("visibilitychange", onVis);
      const lock = lockRef.current;
      lockRef.current = null;
      void lock?.release();
    };
  }, [acquire]);

  useEffect(() => {
    if (!fallback) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => undefined);
  }, [fallback]);

  useEffect(() => {
    const pull = () => {
      if (!shouldPollRefresh(navigator.onLine)) {
        setOffline(true);
        return;
      }
      setOffline(false);
      router.refresh();
    };
    const timer = window.setInterval(pull, TV_POLL_MS);
    const reload = window.setInterval(() => {
      if (shouldFullReload(Date.now() - startedRef.current, navigator.onLine, TV_RELOAD_MS)) {
        window.location.reload();
      }
    }, TV_POLL_MS);
    const onOff = () => setOffline(true);
    const onOn = () => {
      setOffline(false);
      router.refresh();
    };
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(reload);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, [router]);

  useEffect(() => {
    const hideControls = window.setTimeout(() => setControls(false), TV_FULLSCREEN_HIDE_MS);
    let cursor = window.setTimeout(() => document.documentElement.classList.add("tv-idle"), TV_CURSOR_IDLE_MS);
    const wakeCursor = () => {
      document.documentElement.classList.remove("tv-idle");
      setControls(true);
      window.clearTimeout(cursor);
      cursor = window.setTimeout(() => {
        document.documentElement.classList.add("tv-idle");
        setControls(false);
      }, TV_CURSOR_IDLE_MS);
    };
    window.addEventListener("mousemove", wakeCursor);
    window.addEventListener("pointerdown", wakeCursor);
    return () => {
      window.clearTimeout(hideControls);
      window.clearTimeout(cursor);
      window.removeEventListener("mousemove", wakeCursor);
      window.removeEventListener("pointerdown", wakeCursor);
    };
  }, []);

  return (
    <div className="tv-runtime">
      {children}
      <p className="tv-offline" role="status" hidden={!offline}>
        offline
      </p>
      <button
        type="button"
        className={controls ? "tv-full" : "tv-full is-hidden"}
        onClick={() => {
          const wall = document.querySelector(".tv-wall");
          if (wall instanceof HTMLElement) requestFullscreen(wall);
        }}
      >
        Full screen
      </button>
      {fallback ? (
        <video
          ref={videoRef}
          className="tv-wake-video"
          src="/tv-wake.mp4"
          muted
          autoPlay
          loop
          playsInline
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
