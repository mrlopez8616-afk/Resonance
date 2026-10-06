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
import { parentAggregate, type FaceTotals } from "@/lib/node-parents";

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
        return (
          <NodeSquare
            key={parent.id}
            parent
            live={aggregate.connected}
            dashed={!aggregate.connected}
            label={parent.label}
          >
            <Link
              href={`/n/${parent.id}`}
              className="node-log-link"
              title={`Open ${parent.label}`}
            >
              <div className="live-face parent-face">
                <h2 className="node-ticker">{parent.label}</h2>
                {aggregate.connected ? (
                  <>
                    <p className="live-units">
                      {aggregate.childCount}
                      <span>{aggregate.childCount === 1 ? " node" : " nodes"}</span>
                    </p>
                    {aggregate.liveUsdLabel !== null ? (
                      <p className="live-value">
                        {aggregate.liveUsdLabel}
                        <span> sum</span>
                      </p>
                    ) : null}
                    {aggregate.openBets !== null ? (
                      <p className="live-units">
                        {aggregate.openBets}
                        <span> open</span>
                      </p>
                    ) : null}
                  </>
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
