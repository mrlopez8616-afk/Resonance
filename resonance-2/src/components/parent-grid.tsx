"use client";

import { NodeFace } from "@/components/node-face";
import { PARENTS, type ParentId } from "@/data/node-parents";
import type { FightDeskSummary } from "@/lib/bets";
import type { FitnessHomeLine, FitnessWeekFacts } from "@/lib/fitness-board";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
} from "@/lib/floor-registry";
import {
  bookHomeFace,
  buildHomeFace,
  fightHomeFace,
  financeHomeFaceTile,
  fitnessHomeFace,
} from "@/lib/home-faces";
import {
  fitnessSecondaryLines,
  predictionsHeadline,
  topMoverLine,
  visibleHomeMoves,
  type HomeMove,
} from "@/lib/home-lines";
import type { FinanceHomeFace } from "@/lib/finance/view";
import { parentAggregate, parentCardHref, parentSummaryLine, type FaceTotals } from "@/lib/node-parents";
import { useSyncExternalStore } from "react";

export function ParentGrid({
  faceTotals,
  fightDesk,
  fightDeskAvailability = "live",
  fitnessLine = null,
  fitnessWeek = null,
  bankroll = null,
  moves = [],
  cryptoMoves = [],
  financeHome = null,
  asOf,
  buildHome = null,
}: {
  faceTotals: FaceTotals;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability?: "live" | "seed-only" | "unavailable";
  /** One real fitness line. Null keeps the card on "not connected" unless a week line exists. */
  fitnessLine?: FitnessHomeLine | null;
  fitnessWeek?: FitnessWeekFacts | null;
  /** Fight Desk bankroll headline. Null when the bet book cannot be read. */
  bankroll?: { headline: string; priceLine: string } | null;
  moves?: readonly HomeMove[];
  /** XRP and SUI day changes from the same spot quotes the crypto faces already use. */
  cryptoMoves?: readonly HomeMove[];
  /** Owner snapshot only. Null keeps the static private label. */
  financeHome?: FinanceHomeFace | null;
  /** Render instant. Quote age is measured from this, so server and client agree. */
  asOf: string;
  /** Build tracker headline. Null percent means the checklist could not be read. */
  buildHome?: { unavailable: boolean; percentLabel: string | null; lines: readonly string[] } | null;
}) {
  const hiddenRaw = useSyncExternalStore(subscribeHiddenIds, hiddenIdsSnapshot, hiddenIdsServerSnapshot);
  const hiddenIds = parseHiddenIds(hiddenRaw);
  const asOfDate = new Date(asOf);
  const cryptoMover = topMoverLine(visibleHomeMoves(cryptoMoves, hiddenIds), asOfDate);
  const stockMover = topMoverLine(visibleHomeMoves(moves, hiddenIds), asOfDate);

  return (
    <>
      {PARENTS.map((parent) => {
        if (parent.id === "finance") {
          return <NodeFace key={parent.id} face={financeHomeFaceTile(financeHome)} />;
        }
        if (parent.id === "fight-desk") {
          const face = fightHomeFace({
            publicMode: false,
            headline: bankroll ? predictionsHeadline(bankroll.headline) : null,
            priceLine: bankroll?.priceLine ?? null,
            record: null,
          });
          return face ? <NodeFace key={parent.id} face={face} /> : null;
        }
        if (parent.id === "fitness") {
          return (
            <NodeFace
              key={parent.id}
              face={fitnessHomeFace({
                value: fitnessLine?.value ?? null,
                unit: fitnessLine?.unit ?? null,
                lines: fitnessSecondaryLines(fitnessWeek, fitnessLine),
                publicMode: false,
              })}
            />
          );
        }
        return (
          <NodeFace
            key={parent.id}
            face={bookFace(parent.id, parent.label, hiddenIds, faceTotals, fightDesk, fightDeskAvailability, {
              crypto: cryptoMover,
              stocks: stockMover,
            })}
          />
        );
      })}
      {buildHome ? (
        <NodeFace
          face={buildHomeFace({
            unavailable: buildHome.unavailable,
            percentLabel: buildHome.percentLabel,
            lines: buildHome.lines,
            publicMode: false,
          })}
        />
      ) : null}
    </>
  );
}

function bookFace(
  parentId: ParentId,
  label: string,
  hiddenIds: readonly string[],
  faceTotals: FaceTotals,
  fightDesk: FightDeskSummary | null,
  fightDeskAvailability: "live" | "seed-only" | "unavailable",
  movers: { crypto: string | null; stocks: string | null },
) {
  const aggregate = parentAggregate(parentId, hiddenIds, faceTotals, fightDesk, fightDeskAvailability);
  const id = parentId === "crypto" ? "crypto" : "ai-stocks";
  return bookHomeFace({
    id,
    name: label,
    href: parentCardHref(parentId),
    publicMode: false,
    summary: parentSummaryLine(aggregate),
    connected: aggregate.connected,
    mover: id === "crypto" ? movers.crypto : movers.stocks,
  });
}
