"use client";

import { useEffect, useState } from "react";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { assembleXrpFace, type XrpFaceData, type XrpQuote } from "@/lib/xrp-face";

const POLL_MS = 45_000;

export function XrpFace({ initial }: { initial: XrpFaceData }) {
  const [face, setFace] = useState(initial);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/xrp-price", { cache: "no-store" });
        if (!response.ok) return;
        const quote = (await response.json()) as Partial<XrpQuote> & {
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
          assembleXrpFace(XRP_SLEEVES, {
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
  }, []);

  const priceTitle = face.source
    ? `${face.source}${face.fetchedAt ? ` · ${face.fetchedAt}` : ""}`
    : "Waiting for XRP-USD";

  return (
    <div className="xrp-face">
      <h2 className="node-ticker">XRP</h2>
      <p className="xrp-price" title={priceTitle}>
        {face.priceLabel}
      </p>
      <ul className="xrp-sleeves">
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
      <p className="xrp-total">
        <span>TOTAL USD</span>
        <span>{face.totalUsdLabel}</span>
      </p>
    </div>
  );
}
