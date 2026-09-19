"use client";

import { useEffect, useState } from "react";
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
        const response = await fetch(
          `/api/spot-price?ticker=${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const quote = (await response.json()) as Partial<SpotQuote> & {
          error?: string;
        };
        if (
          cancelled ||
          typeof quote.usd !== "number" ||
          !Number.isFinite(quote.usd) ||
          quote.usd <= 0
        ) {
          return;
        }
        setFace(
          assembleLiveFace(ticker, sleeves, {
            usd: quote.usd,
            source: typeof quote.source === "string" ? quote.source : "spot",
            fetchedAt:
              typeof quote.fetchedAt === "string"
                ? quote.fetchedAt
                : new Date().toISOString(),
          }),
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
        <span className="live-head-dot" aria-hidden>
          ·
        </span>
        <p className="live-price" title={priceTitle}>
          {face.priceLabel}
        </p>
      </header>
      <p className="live-units">
        {face.totalUnitsLabel}
        <span> total</span>
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
                <span className="sleeve-manual">manual</span>
              ) : null}
            </span>
            <span className="sleeve-qty">{sleeve.quantityLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
