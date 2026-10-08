"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NodeSquare } from "@/components/node-square";
import { ValueCard } from "@/components/value-card";
import { PARENTS } from "@/data/node-parents";
import type { FightDeskSummary } from "@/lib/bets";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
} from "@/lib/floor-registry";
import { parentAggregate, parentCardHref, parentSummaryLine, type FaceTotals } from "@/lib/node-parents";
import type { FitnessHomeLine } from "@/lib/fitness-board";

export function ParentGrid({
  faceTotals,
  fightDesk,
  fightDeskAvailability = "live",
  fitnessLine = null,
  bankroll = null,
}: {
  faceTotals: FaceTotals;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability?: "live" | "seed-only" | "unavailable";
  /** One real fitness line. Null keeps the card on "not connected yet". */
  fitnessLine?: FitnessHomeLine | null;
  /** Predictions bankroll. Null when the bet book cannot be read. */
  bankroll?: { headline: string; priceLine: string } | null;
}) {
  const hiddenRaw = useSyncExternalStore(
    subscribeHiddenIds,
    hiddenIdsSnapshot,
    hiddenIdsServerSnapshot,
  );
  const hiddenIds = parseHiddenIds(hiddenRaw);

  return (
    <section className="node-grid" aria-label="Node floor">
      {PARENTS.map((parent) => {
        if (parent.id === "predictions") {
          const face = bankroll;
          return (
            <NodeSquare
              key={parent.id}
              parent
              live={face !== null}
              dashed={face === null}
              label={parent.label}
            >
              <Link
                href={parentCardHref(parent.id)}
                className="node-log-link"
                title={`Open ${parent.label}`}
              >
                {face ? (
                  <ValueCard
                    ticker={parent.label}
                    compact
                    model={{ headline: face.headline, priceLine: face.priceLine, label: null }}
                  />
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
        const connected = parent.id === "fitness" ? fitnessLine !== null : aggregate.connected;
        return (
          <NodeSquare
            key={parent.id}
            parent
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
                ) : (
                  <p className="node-note">not connected yet</p>
                )}
              </div>
            </Link>
          </NodeSquare>
        );
      })}
    </section>
  );
}
