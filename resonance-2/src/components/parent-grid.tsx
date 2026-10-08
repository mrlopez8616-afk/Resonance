"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NodeSquare } from "@/components/node-square";
import { ValueCard } from "@/components/value-card";
import { PARENTS, type ParentId } from "@/data/node-parents";
import type { FightDeskSummary } from "@/lib/bets";
import type { FitnessHomeLine, FitnessWeekFacts } from "@/lib/fitness-board";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
} from "@/lib/floor-registry";
import { AiChangeVisual, CryptoBasketVisual, FitnessStepVisual, PredictionsVisual } from "@/components/home-visual";
import { cryptoBasketValues, type CryptoBasketLeg } from "@/lib/crypto-basket";
import {
  aiStockSecondaryLines,
  cryptoSecondaryLines,
  aiChangeBars,
  FINANCE_HOME_LABEL,
  fitnessSecondaryLines,
  predictionsHeadline,
  predictionsSecondaryLines,
  visibleHomeMoves,
  type HomeMove,
  type HomeQuote,
  type PredictionsHomeFacts,
} from "@/lib/home-lines";
import type { StepSlot, TierSegment } from "@/lib/home-visuals";
import { parentAggregate, parentCardHref, parentSummaryLine, type FaceTotals } from "@/lib/node-parents";

function ParentLines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="parent-lines">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function linesFor(
  parentId: ParentId,
  input: {
    hiddenIds: readonly string[];
    asOf: Date;
    xrpQuote: HomeQuote | null;
    moves: readonly HomeMove[];
    catalystLine: string | null;
    fitnessWeek: FitnessWeekFacts | null;
    fitnessLine: FitnessHomeLine | null;
    predictions: PredictionsHomeFacts | null;
  },
): string[] {
  if (parentId === "crypto") return cryptoSecondaryLines(input.xrpQuote, input.asOf);
  if (parentId === "ai-stocks") {
    return aiStockSecondaryLines({
      moves: visibleHomeMoves(input.moves, input.hiddenIds),
      catalystLine: input.catalystLine,
      now: input.asOf,
    });
  }
  if (parentId === "fitness") return fitnessSecondaryLines(input.fitnessWeek, input.fitnessLine);
  if (parentId === "finance") return [];
  if (parentId === "fight-desk") return predictionsSecondaryLines(input.predictions);
  return [];
}

export function ParentGrid({
  faceTotals,
  fightDesk,
  fightDeskAvailability = "live",
  fitnessLine = null,
  fitnessWeek = null,
  bankroll = null,
  predictions = null,
  xrpQuote = null,
  moves = [],
  catalystLine = null,
  basketLegs = [],
  stepSlots = null,
  tierBar = null,
  bankrollLine = null,
  asOf,
}: {
  faceTotals: FaceTotals;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability?: "live" | "seed-only" | "unavailable";
  /** One real fitness line. Null keeps the card on "not connected yet" unless a week line exists. */
  fitnessLine?: FitnessHomeLine | null;
  fitnessWeek?: FitnessWeekFacts | null;
  /** Fight Desk bankroll headline. Null when the bet book cannot be read. */
  bankroll?: { headline: string; priceLine: string } | null;
  predictions?: PredictionsHomeFacts | null;
  xrpQuote?: HomeQuote | null;
  moves?: readonly HomeMove[];
  catalystLine?: string | null;
  /** Held crypto legs. Empty history leaves the chart unmounted. */
  basketLegs?: readonly CryptoBasketLeg[];
  stepSlots?: readonly StepSlot[] | null;
  tierBar?: readonly TierSegment[] | null;
  bankrollLine?: readonly number[] | null;
  /** Render instant. Quote age is measured from this, so server and client agree. */
  asOf: string;
}) {
  const hiddenRaw = useSyncExternalStore(
    subscribeHiddenIds,
    hiddenIdsSnapshot,
    hiddenIdsServerSnapshot,
  );
  const hiddenIds = parseHiddenIds(hiddenRaw);
  const asOfDate = new Date(asOf);
  const changeBars = aiChangeBars(visibleHomeMoves(moves, hiddenIds), asOfDate);
  const basket = cryptoBasketValues(basketLegs.filter((leg) => !hiddenIds.includes(leg.id)));

  return (
    <section className="node-grid home-floor" aria-label="Node floor">
      {PARENTS.map((parent) => {
        const lines = linesFor(parent.id, {
          hiddenIds,
          asOf: asOfDate,
          xrpQuote,
          moves,
          catalystLine,
          fitnessWeek,
          fitnessLine,
          predictions,
        });
        if (parent.id === "finance") {
          return (
            <NodeSquare key={parent.id} parent home live label={parent.label}>
              <Link
                href={parentCardHref(parent.id)}
                className="node-log-link"
                title={`Open ${parent.label}`}
              >
                <div className="live-face parent-face">
                  <h2 className="node-ticker">{parent.label}</h2>
                  <p className="live-units finance-status">{FINANCE_HOME_LABEL}</p>
                </div>
              </Link>
            </NodeSquare>
          );
        }
        if (parent.id === "fight-desk") {
          const headline = bankroll ? predictionsHeadline(bankroll.headline) : null;
          const live = bankroll !== null && (headline !== null || lines.length > 0);
          return (
            <NodeSquare
              key={parent.id}
              parent
              home
              live={live}
              dashed={!live}
              label={parent.label}
            >
              <Link
                href={parentCardHref(parent.id)}
                className="node-log-link"
                title={`Open ${parent.label}`}
              >
                {live ? (
                  <ValueCard
                    ticker={parent.label}
                    compact
                    model={{ headline, priceLine: null, label: null }}
                  >
                    <ParentLines lines={lines} />
                    <PredictionsVisual segments={tierBar} bankroll={bankrollLine} />
                  </ValueCard>
                ) : (
                  <div className="live-face parent-face">
                    <h2 className="node-ticker">{parent.label}</h2>
                    <p className="node-note">unavailable</p>
                  </div>
                )}
              </Link>
            </NodeSquare>
          );
        }
        const aggregate = parentAggregate(
          parent.id,
          hiddenIds,
          faceTotals,
          fightDesk,
          fightDeskAvailability,
        );
        const summary =
          parent.id === "fitness" && fitnessLine
            ? { value: fitnessLine.value, unit: fitnessLine.unit, coverage: false }
            : parentSummaryLine(aggregate);
        const connected =
          parent.id === "fitness"
            ? fitnessLine !== null || lines.length > 0
            : aggregate.connected;
        const showNote = !summary && lines.length === 0;
        const visual =
          parent.id === "crypto" && basket ? (
            <CryptoBasketVisual points={basket} />
          ) : parent.id === "ai-stocks" && changeBars ? (
            <AiChangeVisual bars={changeBars} />
          ) : parent.id === "fitness" && stepSlots ? (
            <FitnessStepVisual slots={stepSlots} />
          ) : null;
        return (
          <NodeSquare
            key={parent.id}
            parent
            home
            live={connected}
            dashed={!connected}
            label={parent.label}
          >
            <Link
              href={parentCardHref(parent.id)}
              className="node-log-link"
              title={`Open ${parent.label}`}
            >
              <div className="live-face parent-face">
                <h2 className="node-ticker">{parent.label}</h2>
                {summary ? (
                  <p className={`live-units${summary.coverage ? " is-coverage" : ""}`}>
                    {summary.value}
                    {summary.unit ? <span> {summary.unit}</span> : null}
                  </p>
                ) : showNote ? (
                  <p className="node-note">not connected yet</p>
                ) : null}
                <ParentLines lines={lines} />
                {visual}
              </div>
            </Link>
          </NodeSquare>
        );
      })}
    </section>
  );
}
