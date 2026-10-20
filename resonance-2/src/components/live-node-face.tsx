"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockIcon } from "@/components/icons";
import { ValueCard } from "@/components/value-card";
import type { NodeSleeve } from "@/data/sleeves";
import {
  assembleLiveFace,
  shownSleeves,
  type LiveFaceData,
  type SpotQuote,
} from "@/lib/live-face";
import { subscribePullRefresh } from "@/lib/phone-nav";
import { suiBalanceLine } from "@/lib/sui-balance-line";
import { valueCardFromFace } from "@/lib/value-card";

const POLL_MS = 45_000;

export function LiveNodeFace({
  ticker,
  sleeves,
  initial,
  statusLine: initialStatus = null,
}: {
  ticker: string;
  sleeves: readonly NodeSleeve[];
  initial: LiveFaceData;
  statusLine?: string | null;
}) {
  const [face, setFace] = useState(initial);
  const [polledStatus, setPolledStatus] = useState<string | null | undefined>(undefined);
  const statusLine = polledStatus === undefined ? initialStatus : polledStatus;
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const generationAtStart = generation.current;
    try {
      const [priceRes, sleeveRes] = await Promise.all([
        fetch(`/api/spot-price?ticker=${encodeURIComponent(ticker)}`, {
          cache: "no-store",
        }),
        fetch(`/api/sleeves?ticker=${encodeURIComponent(ticker)}`, {
          cache: "no-store",
        }),
      ]);
      if (generation.current !== generationAtStart) return;

      let nextSleeves = sleeves;
      if (sleeveRes.ok) {
        const payload = (await sleeveRes.json()) as {
          sleeves?: NodeSleeve[];
          balance?: { fresh?: boolean; asOf?: string | null };
        };
        if (Array.isArray(payload.sleeves) && payload.sleeves.length > 0) {
          const byId = new Map(sleeves.map((row) => [row.id, row]));
          nextSleeves = payload.sleeves.map((row) => {
            const seed = byId.get(row.id);
            if (seed && (seed.manual || seed.id === "flare-vault")) return seed;
            return row;
          });
        }
        const balance = payload.balance;
        if (balance && typeof balance.fresh === "boolean") {
          setPolledStatus(
            suiBalanceLine({
              fresh: balance.fresh,
              asOf: typeof balance.asOf === "string" ? balance.asOf : null,
            }),
          );
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
  }, [sleeves, ticker]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      generation.current += 1;
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => subscribePullRefresh(() => refresh()), [refresh]);

  const priceTitle = face.source
    ? `${face.source}${face.fetchedAt ? ` · ${face.fetchedAt}` : ""}`
    : `Waiting for ${ticker}-USD`;

  return (
    <ValueCard
      ticker={ticker}
      model={valueCardFromFace(face)}
      priceTitle={priceTitle}
    >
      {statusLine ? <p className="node-note">{statusLine}</p> : null}
      <p className="live-units">
        {face.totalUnitsLabel}
        <span> {face.unitsWord}</span>
      </p>
      <ul className="live-sleeves">
        {shownSleeves(face.sleeves).map((sleeve) => (
          <li key={sleeve.id}>
            <span className="sleeve-mark" aria-hidden />
            <span className="sleeve-label">
              {sleeve.label}
              {sleeve.manual ? (
                <span className="sleeve-manual">
                  <LockIcon size={11} />
                  manual
                  {sleeve.note ? ` · ${sleeve.note}` : ""}
                </span>
              ) : null}
            </span>
            <span className="sleeve-qty">{sleeve.quantityLabel}</span>
          </li>
        ))}
      </ul>
    </ValueCard>
  );
}
