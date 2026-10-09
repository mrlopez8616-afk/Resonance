"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatUpdatedTime,
  isStandaloneMode,
  notifyPullRefresh,
  phoneTrail,
  pullDecision,
  pullShouldAnimate,
  swipeDecision,
  swipeShouldAnimate,
  type PullSample,
  type SwipeSample,
} from "@/lib/phone-nav";

const UPDATED_KEY = "resonance-pull-updated";

function readStandalone(): boolean {
  const displayMode = window.matchMedia("(display-mode: standalone)").matches;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return isStandaloneMode({
    displayModeStandalone: displayMode,
    navigatorStandalone: nav.standalone === true,
  });
}

function gestureBlocked(target: EventTarget | null): { horizontalScroller: boolean; blockedSurface: boolean } {
  let horizontalScroller = false;
  let blockedSurface = false;
  if (!(target instanceof Element)) return { horizontalScroller, blockedSurface };
  let node: Element | null = target;
  while (node) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "SVG" || tag === "CANVAS") {
      blockedSurface = true;
    }
    if (node.classList.contains("home-visual") || node.classList.contains("position-chart")) {
      blockedSurface = true;
    }
    if (node instanceof HTMLElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (
        (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
        node.scrollWidth > node.clientWidth + 1
      ) {
        horizontalScroller = true;
      }
    }
    node = node.parentElement;
  }
  return { horizontalScroller, blockedSurface };
}

function shiftMain(px: number, animate: boolean) {
  const main = document.querySelector(".operator-main");
  if (!(main instanceof HTMLElement)) return;
  main.style.transition = animate ? "transform 160ms ease" : "none";
  main.style.transform = px > 0 ? `translateX(${px}px)` : "";
}

function pageScrollTop(): number {
  const main = document.querySelector(".operator-main");
  const mainTop = main instanceof HTMLElement ? main.scrollTop : 0;
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, mainTop);
}

export function PhoneNav() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const trail = phoneTrail(pathname, search ? `?${search}` : "");
  const backHref = trail.back?.href ?? null;
  const [installed, setInstalled] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    const standalone = readStandalone();
    setInstalled(standalone);
    if (standalone) {
      try {
        const stored = sessionStorage.getItem(UPDATED_KEY);
        if (stored) setUpdated(stored);
      } catch {
        // Private mode can block session storage. The line still shows after this pull.
      }
    }
    return () => media.removeEventListener("change", sync);
  }, []);

  const runRefresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPulling(false);
    try {
      const client = notifyPullRefresh();
      router.refresh();
      await client;
    } finally {
      const label = formatUpdatedTime(new Date());
      try {
        sessionStorage.setItem(UPDATED_KEY, label);
      } catch {
        // The line still renders from state for this visit.
      }
      setUpdated(label);
      setBusy(false);
      busyRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    let start: { x: number; y: number; scrollTop: number; horizontalScroller: boolean; blockedSurface: boolean } | null =
      null;
    let armed = false;

    function sample(touch: Touch): PullSample {
      return {
        startX: start?.x ?? 0,
        startY: start?.y ?? 0,
        x: touch.clientX,
        y: touch.clientY,
        scrollTop: start?.scrollTop ?? pageScrollTop(),
        standalone: readStandalone(),
        horizontalScroller: start?.horizontalScroller ?? false,
        blockedSurface: start?.blockedSurface ?? false,
      };
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1 || busyRef.current) {
        start = null;
        armed = false;
        setPulling(false);
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const blocked = gestureBlocked(event.target);
      start = { x: touch.clientX, y: touch.clientY, scrollTop: pageScrollTop(), ...blocked };
    }

    function onMove(event: TouchEvent) {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      const decision = pullDecision(sample(touch));
      if (decision === "ignore") {
        if (armed) {
          armed = false;
          setPulling(false);
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (!armed) {
        armed = true;
        setPulling(true);
      }
    }

    function onEnd(event: TouchEvent) {
      if (!start) return;
      const touch = event.changedTouches[0];
      const decision = touch ? pullDecision(sample(touch)) : "ignore";
      start = null;
      armed = false;
      setPulling(false);
      if (decision === "commit") void runRefresh();
    }

    function onCancel() {
      start = null;
      armed = false;
      setPulling(false);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [runRefresh]);

  useEffect(() => {
    if (!backHref) return;
    const href = backHref;
    let start: { x: number; y: number; horizontalScroller: boolean; blockedSurface: boolean } | null = null;
    let reduced = false;

    function sample(touch: Touch): SwipeSample {
      return {
        startX: start?.x ?? 0,
        startY: start?.y ?? 0,
        x: touch.clientX,
        y: touch.clientY,
        standalone: readStandalone(),
        horizontalScroller: start?.horizontalScroller ?? false,
        blockedSurface: start?.blockedSurface ?? false,
      };
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        start = null;
        return;
      }
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const touch = event.touches[0];
      if (!touch) return;
      const blocked = gestureBlocked(event.target);
      start = { x: touch.clientX, y: touch.clientY, ...blocked };
    }

    function onMove(event: TouchEvent) {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      const decision = swipeDecision(sample(touch));
      if (decision === "ignore") {
        shiftMain(0, false);
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (!swipeShouldAnimate(reduced)) return;
      shiftMain(Math.min(touch.clientX - start.x, 48), false);
    }

    function onEnd(event: TouchEvent) {
      if (!start) return;
      const touch = event.changedTouches[0];
      const decision = touch ? swipeDecision(sample(touch)) : "ignore";
      start = null;
      if (decision !== "commit") {
        shiftMain(0, false);
        return;
      }
      if (swipeShouldAnimate(reduced)) shiftMain(28, true);
      router.push(href);
      window.setTimeout(() => shiftMain(0, false), swipeShouldAnimate(reduced) ? 180 : 0);
    }

    function onCancel() {
      start = null;
      shiftMain(0, false);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
      shiftMain(0, false);
    };
  }, [backHref, router]);

  const showCrumbs = trail.crumbs.length > 1;
  const showRefresh = installed && (busy || pulling || updated);
  const spin = busy && pullShouldAnimate(reduced);

  return (
    <>
      {showRefresh ? (
        <p className="phone-refresh" role="status">
          {busy || pulling ? (
            <span
              className={spin ? "phone-refresh-spin" : "phone-refresh-spin is-still"}
              role="img"
              aria-label={busy ? "Updating" : "Pull to refresh"}
            />
          ) : (
            updated
          )}
        </p>
      ) : null}
      {trail.back ? (
        <Link href={trail.back.href} className="phone-back" aria-label={`Back to ${trail.back.label}`}>
          <span aria-hidden="true">←</span>
          {trail.back.label}
        </Link>
      ) : null}
      {showCrumbs ? (
        <nav className="phone-crumbs" aria-label="Breadcrumb">
          <ol>
            {trail.crumbs.map((crumb, index) => {
              const last = index === trail.crumbs.length - 1;
              return (
                <li key={`${crumb.href}:${crumb.label}`}>
                  {index > 0 ? (
                    <span className="phone-sep" aria-hidden="true">
                      ›
                    </span>
                  ) : null}
                  {last ? (
                    <span aria-current="page">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href}>{crumb.label}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
    </>
  );
}
