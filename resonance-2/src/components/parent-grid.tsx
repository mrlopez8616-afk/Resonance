"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NodeSquare } from "@/components/node-square";
import { PARENTS } from "@/data/node-parents";
import type { FightDeskSummary } from "@/lib/bets";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
} from "@/lib/floor-registry";
import { parentAggregate, parentCardHref, parentSummaryLine, type FaceTotals } from "@/lib/node-parents";

export function ParentGrid({
  faceTotals,
  fightDesk,
  fightDeskAvailability = "live",
}: {
  faceTotals: FaceTotals;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability?: "live" | "seed-only" | "unavailable";
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
        const aggregate = parentAggregate(
          parent.id,
          hiddenIds,
          faceTotals,
          fightDesk,
          fightDeskAvailability,
        );
        const summary = parentSummaryLine(aggregate);
        return (
          <NodeSquare
            key={parent.id}
            parent
            live={aggregate.connected}
            dashed={!aggregate.connected}
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
