"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SystemLiveStatic } from "@/components/system-live-static";
import {
  SYSTEM_EVENT_POLL_MS,
  buildLiveGraph,
  preferStaticLiveView,
  presentLiveGraph,
  readPulseList,
  type LiveCapability,
  type LivePoint,
  type LiveViewChoice,
  type SystemPulse,
} from "@/lib/system-live";

const SystemLiveScene = dynamic(
  () => import("@/components/system-live-scene").then((mod) => mod.SystemLiveScene),
  {
    ssr: false,
    loading: () => <p className="system-live-loading">Loading the map</p>,
  },
);

function readCapability(): LiveCapability {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  let webgl = false;
  try {
    const canvas = document.createElement("canvas");
    webgl = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return {
    webgl,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null,
    saveData: nav.connection?.saveData === true,
  };
}

export function SystemLive({ publicMode }: { publicMode: boolean }) {
  const router = useRouter();
  const graph = useMemo(() => presentLiveGraph(buildLiveGraph(), publicMode), [publicMode]);
  const labeled = useMemo(
    () => graph.points.filter((point) => point.kind === "hub" || point.kind === "node"),
    [graph.points],
  );
  const [capability] = useState<LiveCapability>(readCapability);
  const [choice, setChoice] = useState<LiveViewChoice>("auto");
  const staticView = preferStaticLiveView({ ...capability, choice });
  const [pulse, setPulse] = useState<SystemPulse | null>(null);
  const [calm, setCalm] = useState(false);
  const [card, setCard] = useState<LivePoint | null>(null);
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const queueRef = useRef<SystemPulse[]>([]);
  const activeRef = useRef<string | null>(null);
  const gapRef = useRef(0);

  const begin = useCallback((event: SystemPulse) => {
    activeRef.current = event.id;
    setPulse(event);
    setCalm(false);
  }, []);

  const enqueue = useCallback(
    (events: SystemPulse[]) => {
      if (events.length === 0) return;
      const pending = events.filter((event) => event.id !== activeRef.current);
      if (!activeRef.current) {
        const [first, ...rest] = pending;
        queueRef.current.push(...rest);
        if (first) begin(first);
        return;
      }
      queueRef.current.push(...pending);
    },
    [begin],
  );

  const onPulseDone = useCallback((id: string) => {
    if (activeRef.current !== id) return;
    activeRef.current = null;
    setPulse(null);
    const next = queueRef.current.shift() ?? null;
    if (!next) return;
    window.clearTimeout(gapRef.current);
    gapRef.current = window.setTimeout(() => begin(next), 420);
  }, [begin]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let since: string | null = null;
    const seen = new Set<string>();

    const pull = async (initial: boolean) => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        const response = await fetch(`/api/system/events${query}`, { cache: "no-store" });
        if (response.status === 401) {
          stopped = true;
          window.clearInterval(timer);
          return;
        }
        if (!response.ok) return;
        const events = readPulseList(await response.json());
        const fresh: SystemPulse[] = [];
        for (const event of events) {
          if (!since || event.at > since) since = event.at;
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          fresh.push(event);
        }
        if (fresh.length === 0) {
          if (initial) setCalm(true);
          return;
        }
        fresh.sort((a, b) => a.at.localeCompare(b.at));
        enqueue(fresh);
      } catch {
        if (initial) setCalm(true);
      }
    };

    const arm = () => {
      window.clearInterval(timer);
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setInterval(() => {
        void pull(false);
      }, SYSTEM_EVENT_POLL_MS);
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        window.clearInterval(timer);
        return;
      }
      void pull(false);
      arm();
    };

    void pull(true);
    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(gapRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enqueue]);

  const onSelect = useCallback(
    (id: string) => {
      const point = graph.points.find((item) => item.id === id);
      if (!point) return;
      if (point.href) {
        router.push(point.href);
        return;
      }
      setCard(point);
    },
    [graph.points, router],
  );

  const end = pulse ? graph.points.find((point) => point.id === pulse.nodeIds.at(-1)) : null;
  const status = pulse ? `Pulse · ${end?.label ?? "node"}` : calm ? "Quiet" : "Live";

  return (
    <div className="system-live-view">
      <div
        className="system-live-stage"
        data-view={staticView ? "static" : "3d"}
        data-pulse-id={pulse?.id ?? ""}
      >
        {staticView ? (
          <SystemLiveStatic graph={graph} pulse={pulse} onPulseDone={onPulseDone} onSelect={onSelect} />
        ) : (
          <>
            <SystemLiveScene
              graph={graph}
              pulse={pulse}
              labeled={labeled}
              labels={labels}
              onPulseDone={onPulseDone}
              onSelect={onSelect}
            />
            <div className="system-live-labels" aria-hidden="true">
              {labeled.map((point) => (
                <span
                  key={point.id}
                  ref={(el) => {
                    if (el) labels.current.set(point.id, el);
                    else labels.current.delete(point.id);
                  }}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </>
        )}
        {card ? (
          <div className="system-live-card" role="status">
            <p className="system-live-card-title">{card.label}</p>
            {card.detail ? <p>{card.detail}</p> : null}
            <button type="button" onClick={() => setCard(null)}>
              Close
            </button>
          </div>
        ) : null}
      </div>
      <div className="system-live-bar">
        <p className="system-live-status" data-live-state={pulse ? "pulse" : calm ? "calm" : "live"}>
          {status}
        </p>
        <button
          type="button"
          className="system-live-toggle"
          aria-pressed={staticView}
          onClick={() => setChoice(staticView ? "3d" : "static")}
        >
          Static view
        </button>
      </div>
      <ul className="system-live-legend">
        <li>
          <i style={{ background: "#f3e2b0" }} /> Hub
        </li>
        <li>
          <i style={{ background: "#8ecbff" }} /> Node
        </li>
        <li>
          <i style={{ background: "#d2b0ff" }} /> Agent
        </li>
        <li>
          <i style={{ background: "#f0b45a" }} /> Source
        </li>
        <li>
          <i style={{ background: "#7ef0d6" }} /> Sleeve
        </li>
      </ul>
      <p className="system-live-hint">Drag to turn. Pinch or scroll to zoom. Tap a node to open it.</p>
    </div>
  );
}
