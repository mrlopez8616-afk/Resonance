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
import { AiChangeVisual, FitnessStepVisual, PredictionsVisual } from "@/components/home-visual";
import {
  aiStockSecondaryLines,
  aiChangeBars,
  cryptoChangeBars,
  cryptoHomeSecondaryLines,
  FINANCE_HOME_LABEL,
  fitnessSecondaryLines,
  predictionsHeadline,
  predictionsSecondaryLines,
  visibleHomeMoves,
  type HomeMove,
  type PredictionsHomeFacts,
} from "@/lib/home-lines";
import type { FinanceHomeFace } from "@/lib/finance/view";
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
    moves: readonly HomeMove[];
    cryptoMoves: readonly HomeMove[];
    catalystLine: string | null;
    cryptoCatalystLine: string | null;
    retiringLine: string | null;
    fitnessWeek: FitnessWeekFacts | null;
    fitnessLine: FitnessHomeLine | null;
    predictions: PredictionsHomeFacts | null;
  },
): string[] {
  if (parentId === "crypto") {
    return cryptoHomeSecondaryLines({
      moves: visibleHomeMoves(input.cryptoMoves, input.hiddenIds),
      catalystLine: input.cryptoCatalystLine,
      now: input.asOf,
    });
  }
  if (parentId === "ai-stocks") {
    return aiStockSecondaryLines({
      moves: visibleHomeMoves(input.moves, input.hiddenIds),
      catalystLine: input.catalystLine,
      retiringLine: input.retiringLine,
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
  moves = [],
  cryptoMoves = [],
  catalystLine = null,
  cryptoCatalystLine = null,
  retiringLine = null,
  stepSlots = null,
  tierBar = null,
  bankrollLine = null,
  financeHome = null,
  asOf,
  buildHome = null,
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
  moves?: readonly HomeMove[];
  /** XRP and SUI day changes from the same spot quotes the crypto faces already use. */
  cryptoMoves?: readonly HomeMove[];
  catalystLine?: string | null;
  /** Next crypto calendar or catalyst line. Null when none is upcoming. */
  cryptoCatalystLine?: string | null;
  /** Retired AI names that still have shares. Null when both books are closed. */
  retiringLine?: string | null;
  stepSlots?: readonly StepSlot[] | null;
  tierBar?: readonly TierSegment[] | null;
  bankrollLine?: readonly number[] | null;
  /** Owner snapshot only. Null keeps the static private label. */
  financeHome?: FinanceHomeFace | null;
  /** Render instant. Quote age is measured from this, so server and client agree. */
  asOf: string;
  /** Build tracker headline. Null percent means the checklist could not be read. */
  buildHome?: { unavailable: boolean; percentLabel: string | null; lines: readonly string[] } | null;
}) {
  const hiddenRaw = useSyncExternalStore(
    subscribeHiddenIds,
    hiddenIdsSnapshot,
    hiddenIdsServerSnapshot,
  );
  const hiddenIds = parseHiddenIds(hiddenRaw);
  const asOfDate = new Date(asOf);
  const changeBars = aiChangeBars(visibleHomeMoves(moves, hiddenIds), asOfDate);
  const cryptoBars = cryptoChangeBars(visibleHomeMoves(cryptoMoves, hiddenIds), asOfDate);

  return (
    <section className="node-grid home-floor" aria-label="Node floor">
      {PARENTS.map((parent) => {
        const lines = linesFor(parent.id, {
          hiddenIds,
          asOf: asOfDate,
          moves,
          cryptoMoves,
          catalystLine,
          cryptoCatalystLine,
          retiringLine,
          fitnessWeek,
          fitnessLine,
          predictions,
        });
        if (parent.id === "finance") {
          return (
            <NodeSquare
              key={parent.id}
              parent
              home
              live={financeHome !== null}
              dashed={financeHome === null}
              label={parent.label}
            >
              <Link
                href={parentCardHref(parent.id)}
                className="node-log-link"
                title={`Open ${parent.label}`}
              >
                {financeHome ? (
                  <ValueCard
                    ticker={parent.label}
                    compact
                    model={{ headline: financeHome.headline, priceLine: financeHome.asOfLine, label: null }}
                  />
                ) : (
                  <div className="live-face parent-face">
                    <h2 className="node-ticker">{parent.label}</h2>
                    <p className="live-units finance-status">{FINANCE_HOME_LABEL}</p>
                  </div>
                )}
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
        const dayBars =
          parent.id === "crypto" ? cryptoBars : parent.id === "ai-stocks" ? changeBars : null;
        const visual = dayBars ? (
          <AiChangeVisual bars={dayBars} />
        ) : parent.id === "fitness" && stepSlots ? (
          <FitnessStepVisual slots={stepSlots} />
        ) : null;
        return (
          <NodeSquare
            key={parent.id}
            parent
            home
            wide={parent.id === "ai-stocks"}
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
      {buildHome ? (
        <NodeSquare
          parent
          home
          live={!buildHome.unavailable && buildHome.percentLabel !== null}
          dashed={buildHome.unavailable || buildHome.percentLabel === null}
          label="Build"
        >
          <Link href="/n/build" className="node-log-link" title="Open Build">
            <div className="live-face parent-face">
              <h2 className="node-ticker">Build</h2>
              {buildHome.unavailable || buildHome.percentLabel === null ? (
                <p className="node-note">unavailable</p>
              ) : (
                <p className="live-units">{buildHome.percentLabel}</p>
              )}
              <ParentLines lines={buildHome.lines} />
            </div>
          </Link>
        </NodeSquare>
      ) : null}
    </section>
  );
}
