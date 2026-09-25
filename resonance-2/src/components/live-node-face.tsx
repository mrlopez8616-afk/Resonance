"use client";

import { useEffect, useState } from "react";
import { LockIcon } from "@/components/icons";
import type { NodeSleeve } from "@/data/sleeves";
import {
  assembleLiveFace,
  type LiveFaceData,
  type SpotQuote,
} from "@/lib/live-face";

const POLL_MS = 45_000;

export function LiveNodeFace({
  ticker,
  sleeves,
  initial,
}: {
  ticker: string;
  sleeves: readonly NodeSleeve[];
  initial: LiveFaceData;
}) {
  const [face, setFace] = useState(initial);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [priceRes, sleeveRes] = await Promise.all([
          fetch(`/api/spot-price?ticker=${encodeURIComponent(ticker)}`, {
            cache: "no-store",
          }),
          fetch(`/api/sleeves?ticker=${encodeURIComponent(ticker)}`, {
            cache: "no-store",
          }),
        ]);
        if (cancelled) return;

        let nextSleeves = sleeves;
        if (sleeveRes.ok) {
          const payload = (await sleeveRes.json()) as {
            sleeves?: NodeSleeve[];
          };
          if (Array.isArray(payload.sleeves) && payload.sleeves.length > 0) {
            const byId = new Map(sleeves.map((row) => [row.id, row]));
            nextSleeves = payload.sleeves.map((row) => {
              const seed = byId.get(row.id);
              if (seed && (seed.manual || seed.id === "flare-vault")) return seed;
              return row;
            });
          }
        }

        let quote: SpotQuote | null = null;
        if (priceRes.ok) {
          const raw = (await priceRes.json()) as Partial<SpotQuote> & {
            error?: string;
          };
          if (typeof raw.usd === "number" && Number.isFinite(raw.usd) && raw.usd > 0) {
            quote = {
              usd: raw.usd,
              source: typeof raw.source === "string" ? raw.source : "spot",
              fetchedAt:
                typeof raw.fetchedAt === "string"
                  ? raw.fetchedAt
                  : new Date().toISOString(),
            };
          }
        }

        setFace((current) =>
          assembleLiveFace(
            ticker,
            nextSleeves,
            quote ??
              (current.priceUsd != null && current.source && current.fetchedAt
                ? {
                    usd: current.priceUsd,
                    source: current.source,
                    fetchedAt: current.fetchedAt,
                  }
                : null),
          ),
        );
      } catch {
        // Keep the last good face. Positions never jitter on a failed poll.
      }
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sleeves, ticker]);

  const priceTitle = face.source
    ? `${face.source}${face.fetchedAt ? ` · ${face.fetchedAt}` : ""}`
    : `Waiting for ${ticker}-USD`;

  return (
    <div className="live-face">
      <header className="live-head">
        <h2 className="node-ticker">{ticker}</h2>
        <p className="live-price" title={priceTitle}>
          {face.priceLabel}
        </p>
      </header>
      <p className="live-units">
        {face.totalUnitsLabel}
        <span> {face.unitsWord}</span>
      </p>
      <p className="live-value">
        {face.totalUsdLabel}
        <span> live</span>
      </p>
      <ul className="live-sleeves">
        {face.sleeves.map((sleeve) => (
          <li key={sleeve.id}>
            <span className="sleeve-mark" aria-hidden />
            <span className="sleeve-label">
              {sleeve.label}
              {sleeve.manual ? (
                <span className="sleeve-manual">
                  <LockIcon size={11} />
                  manual
                </span>
              ) : null}
            </span>
            <span className="sleeve-qty">{sleeve.quantityLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
