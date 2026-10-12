"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  GEO_WATCH_OPTIONS,
  LOCATION_DENIED,
  LOCATION_MISSING,
  LOCATION_STOPPED,
  LOCATION_WAITING,
  RUN_DRAFT_KEY,
  RUN_TRACK_NOTE,
  appendFix,
  averagePaceSecPerMile,
  currentPaceSecPerMile,
  elapsedOf,
  elapsedSeconds,
  formatElapsed,
  formatMilesReadout,
  formatMinPerMile,
  freezeDraft,
  parseDraft,
  pauseRun,
  resumeDraft,
  resumeRun,
  startRun,
  stopRun,
  type RunDraft,
} from "@/lib/run-track";

function fixFrom(position: GeolocationPosition) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    timeMs: position.timestamp,
  };
}

function writeStored(draft: RunDraft | null): boolean {
  try {
    if (!draft) localStorage.removeItem(RUN_DRAFT_KEY);
    else {
      const stored = draft.phase === "running" ? freezeDraft(draft, Date.now()) : draft;
      localStorage.setItem(RUN_DRAFT_KEY, JSON.stringify(stored));
    }
    return true;
  } catch {
    return false;
  }
}

export function RunTracker() {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<RunDraft | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const anchorNext = useRef(true);
  const pointsRef = useRef(0);
  const storageWarned = useRef(false);
  pointsRef.current = draft?.track.points.length ?? 0;

  useEffect(() => {
    const stored = parseDraft(window.localStorage.getItem(RUN_DRAFT_KEY));
    const clock = Date.now();
    if (stored) setDraft(resumeDraft(stored, clock));
    setNow(clock);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const wrote = writeStored(draft);
    if (!wrote && draft && !storageWarned.current) {
      storageWarned.current = true;
      setMessage("This phone couldn't store the run. Keep this page open.");
    }
  }, [ready, draft, now]);

  useEffect(() => {
    if (draft?.phase !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [draft?.phase]);

  useEffect(() => {
    if (!ready || draft?.phase !== "running") return;
    if (!("geolocation" in navigator)) {
      setMessage(LOCATION_MISSING);
      return;
    }
    anchorNext.current = true;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const anchor = anchorNext.current;
        anchorNext.current = false;
        setDraft((current) => {
          if (!current || current.phase !== "running") return current;
          const track = appendFix(current.track, fixFrom(position), { anchor });
          return track === current.track ? current : { ...current, track };
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          if (pointsRef.current > 0) setMessage(LOCATION_STOPPED);
          else {
            setDraft(null);
            setMessage(LOCATION_DENIED);
          }
          return;
        }
        setMessage(LOCATION_WAITING);
      },
      GEO_WATCH_OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [ready, draft?.phase]);

  useEffect(() => {
    if (!ready || draft?.phase !== "running") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
    };
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (cancelled || !nav.wakeLock) return;
      nav.wakeLock.request("screen").then(
        (lock) => {
          if (cancelled) {
            void lock.release();
            return;
          }
          sentinel = lock;
        },
        () => {
          sentinel = null;
        },
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [ready, draft?.phase]);

  const elapsedMs = draft ? elapsedOf(draft, now || Date.now()) : 0;
  const hasFix = (draft?.track.points.length ?? 0) > 0;
  const miles = hasFix && draft ? formatMilesReadout(draft.track.distanceM) : null;
  const average = draft ? formatMinPerMile(averagePaceSecPerMile(draft.track.distanceM, elapsedMs)) : null;
  const current = draft ? formatMinPerMile(currentPaceSecPerMile(draft.track.points)) : null;

  function begin() {
    if (!("geolocation" in navigator)) {
      setMessage(LOCATION_MISSING);
      return;
    }
    const clock = Date.now();
    setMessage(null);
    setSaved(null);
    setNow(clock);
    setDraft(startRun(clock, new Date(clock).toISOString()));
  }

  function pause() {
    const clock = Date.now();
    setNow(clock);
    setDraft((currentDraft) => (currentDraft ? pauseRun(currentDraft, clock) : currentDraft));
  }

  function resume() {
    const clock = Date.now();
    anchorNext.current = true;
    setNow(clock);
    setDraft((currentDraft) => (currentDraft ? resumeRun(currentDraft, clock) : currentDraft));
  }

  function stop() {
    const clock = Date.now();
    setNow(clock);
    setDraft((currentDraft) => (currentDraft ? stopRun(currentDraft, clock) : currentDraft));
  }

  function discard() {
    setDraft(null);
    setMessage(null);
    setSaved(null);
  }

  async function save() {
    if (!draft || draft.phase !== "stopped" || saving) return;
    const body = {
      startedAt: draft.startedAt,
      durationSec: elapsedSeconds(elapsedOf(draft, Date.now())),
      distanceM: draft.track.distanceM,
    };
    const summary = [formatElapsed(body.durationSec * 1000), miles ?? "—", average ? `${average} /mi` : "—"].join(
      " · ",
    );
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/fitness/run", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "Save failed.");
        return;
      }
      setSaved(summary);
      setDraft(null);
    } catch {
      setMessage("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="run-tracker" aria-label="Start Run" aria-busy={ready ? undefined : true}>
      {draft ? (
        <div className="run-readout">
          {draft.phase === "stopped" ? <h2 className="run-summary-title">This run</h2> : null}
          <p className="run-elapsed">{formatElapsed(elapsedMs)}</p>
          <p className="run-stat">
            <span>Distance</span>
            {miles ?? "—"}
          </p>
          <p className="run-stat">
            <span>Average pace</span>
            {average ? `${average} /mi` : "—"}
          </p>
          <p className="run-stat">
            <span>Current pace</span>
            {current ? `${current} /mi` : "—"}
          </p>
        </div>
      ) : null}
      {saved ? (
        <p className="run-saved" role="status">
          Saved. {saved}
        </p>
      ) : null}
      {saved ? (
        <Link href="/n/fitness/runs" className="run-link">
          Runs
        </Link>
      ) : null}
      {message ? (
        <p className="run-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="run-actions">
        {!draft && ready ? (
          <button type="button" className="run-go" onClick={begin}>
            Start
          </button>
        ) : null}
        {draft?.phase === "running" ? (
          <button type="button" className="run-go" onClick={pause}>
            Pause
          </button>
        ) : null}
        {draft?.phase === "paused" ? (
          <button type="button" className="run-go" onClick={resume}>
            Resume
          </button>
        ) : null}
        {draft && draft.phase !== "stopped" ? (
          <button type="button" className="run-go run-go-secondary" onClick={stop}>
            Stop
          </button>
        ) : null}
        {draft?.phase === "stopped" ? (
          <button type="button" className="run-go" onClick={save} disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
        ) : null}
        {draft?.phase === "stopped" ? (
          <button type="button" className="run-go run-go-secondary" onClick={discard} disabled={saving}>
            Discard
          </button>
        ) : null}
      </div>
      <p className="run-note">{RUN_TRACK_NOTE}</p>
    </section>
  );
}
