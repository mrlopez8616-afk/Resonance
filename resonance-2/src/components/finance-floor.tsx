import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import { ValueCard } from "@/components/value-card";
import { CashFlowBars } from "@/components/home-visual";
import { formatCivilDate } from "@/lib/calendar-time";
import type { FinanceCardModel } from "@/lib/finance/view";

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
      Waiting for first snapshot
    </p>
  );
}

export function FinanceFloor({
  asOf,
  stale,
  cards,
}: {
  asOf: string;
  stale: boolean;
  cards: readonly FinanceCardModel[];
}) {
  return (
    <>
      <FinanceAsOf asOf={asOf} stale={stale} />
      <section className="node-grid finance-floor" aria-label="Finance nodes">
        {cards.map((card) => {
          const live = card.headline !== null;
          return (
            <NodeSquare
              key={card.id}
              parent
              home
              live={live}
              dashed={!live}
              label={`${card.title} node`}
            >
              <Link href={card.href} className="node-log-link" title={`Open ${card.title}`}>
                <ValueCard
                  ticker={card.title}
                  compact
                  model={{ headline: card.headline, priceLine: null, label: null }}
                >
                  {card.lines.length > 0 ? (
                    <ul className="parent-lines">
                      {card.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {card.bars && card.bars.length > 0 ? <CashFlowBars months={card.bars} /> : null}
                </ValueCard>
              </Link>
            </NodeSquare>
          );
        })}
      </section>
    </>
  );
}
