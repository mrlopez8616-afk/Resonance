"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  formatMoodChange,
  isPortfolioMood,
  moodPreviewFromQuery,
  moodToneLabel,
  type MoodTone,
  type PortfolioMood,
} from "@/lib/portfolio-mood";

const POLL_MS = 45_000;

const DEADBAND_HINT =
  "Flat when the absolute 24h portfolio change is under 0.05%. Partial means at least one live holding was excluded because its feed had no 24h price.";

type MoodState = {
  mood: PortfolioMood;
  preview: MoodTone | null;
  setPreview: (tone: MoodTone | null) => void;
};

const MoodContext = createContext<MoodState | null>(null);

export function MoodFloor({
  initialMood,
  children,
}: {
  initialMood: PortfolioMood;
  children: ReactNode;
}) {
  const [mood, setMood] = useState(initialMood);
  const [preview, setPreview] = useState<MoodTone | null>(null);
  const setPreviewStable = useCallback((tone: MoodTone | null) => {
    setPreview(tone);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/portfolio-mood", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload: unknown = await response.json();
        if (!cancelled && isPortfolioMood(payload)) setMood(payload);
      } catch {
        // Keep the last mood. A failed poll is not a flat book.
      }
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const tone = preview ?? mood.tone;
  const value = useMemo(
    () => ({ mood, preview, setPreview: setPreviewStable }),
    [mood, preview, setPreviewStable],
  );

  return (
    <MoodContext.Provider value={value}>
      <div
        className="operator-floor"
        data-mood={tone}
        data-mood-preview={preview ? "true" : "false"}
      >
        <div className="mood-wash" data-mood={tone} aria-hidden="true">
          <span className="mood-wash-up" />
          <span className="mood-wash-down" />
        </div>
        {children}
      </div>
    </MoodContext.Provider>
  );
}

export function MoodLegend() {
  const state = useContext(MoodContext);
  if (!state) return null;

  const { mood, preview } = state;
  const tone = preview ?? mood.tone;
  const label = moodToneLabel(tone);
  const pct = preview ? null : formatMoodChange(mood.changePct);
  const partial = preview ? false : mood.partial;
  const accessible = preview
    ? `Preview background, ${label}. Not a live portfolio figure.`
    : mood.tone === "unknown"
      ? "Portfolio 24 hour change unavailable."
      : `Portfolio 24 hour change, ${label}, ${formatMoodChange(mood.changePct)}${partial ? ", partial coverage" : ""}.`;

  return (
    <div
      className="mood-legend"
      role="status"
      aria-live="polite"
      aria-label={accessible}
      data-mood={tone}
      data-partial={partial ? "true" : "false"}
      title={DEADBAND_HINT}
    >
      <span className="mood-swatch" aria-hidden="true" />
      <span>24h</span>
      {pct ? <span className="mood-pct">{pct}</span> : null}
      <span className="mood-word">{label}</span>
      {partial ? <span className="mood-partial">partial</span> : null}
      {preview ? <span className="mood-partial">preview</span> : null}
    </div>
  );
}

/** Dev-only. Production builds skip the hook so `?mood=` cannot fake the wash. */
export function MoodPreviewSync() {
  if (process.env.NODE_ENV === "production") return null;
  return <MoodPreviewSyncDev />;
}

function MoodPreviewSyncDev() {
  const params = useSearchParams();
  const setPreview = useContext(MoodContext)?.setPreview;
  const raw = params.get("mood");

  useEffect(() => {
    setPreview?.(moodPreviewFromQuery(raw, process.env.NODE_ENV));
  }, [raw, setPreview]);

  return null;
}
