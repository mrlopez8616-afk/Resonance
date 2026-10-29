import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { formatCivilDate } from "@/lib/calendar-time";
import { FINANCE_EMPTY_LINE, type FinanceCardModel } from "@/lib/finance/view";
import { tileFace } from "@/lib/home-faces";

export function FinanceAsOf({ asOf, stale }: { asOf: string; stale: boolean }) {
  return (
    <p className="finance-asof">
      as of {formatCivilDate(asOf)}
      {stale ? <span className="warn-badge finance-stale">stale</span> : null}
    </p>
  );
}

export function FinanceWaiting() {
  return (
    <p className="parent-empty" role="status">
      {FINANCE_EMPTY_LINE}
    </p>
  );
}

export function FinanceFloor({
  asOf,
  stale,
  cards,
  publicMode = false,
}: {
  asOf: string;
  stale: boolean;
  cards: readonly FinanceCardModel[];
  publicMode?: boolean;
}) {
  return (
    <>
      <FinanceAsOf asOf={asOf} stale={stale} />
      <NodeFaceGrid label="Finance nodes">
        {cards.map((card) => (
          <NodeFace
            key={card.id}
            face={tileFace({
              id: card.id,
              glyph: "finance",
              href: card.href,
              name: card.title,
              headline: card.headline,
              status: card.lines[0] ?? null,
              live: card.headline !== null,
              publicMode,
            })}
          />
        ))}
      </NodeFaceGrid>
    </>
  );
}
