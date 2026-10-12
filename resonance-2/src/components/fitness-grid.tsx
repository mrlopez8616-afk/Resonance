import Link from "next/link";
import { HeartTrend, RunBars } from "@/components/fitness-charts";
import { NodeSquare } from "@/components/node-square";
import { FITNESS_EMPTY, FITNESS_NOT_RECORDED, type FitnessCard } from "@/lib/fitness-board";

export function FitnessGrid({ cards }: { cards: readonly FitnessCard[] }) {
  return (
    <section className="node-grid fitness-grid" aria-label="Fitness nodes">
      {cards.map((card) => {
        const live = card.headline !== null;
        const emptyCopy = card.id === "runs" || card.id === "heart" ? FITNESS_NOT_RECORDED : FITNESS_EMPTY;
        return (
          <NodeSquare
            key={card.id}
            parent
            live={live}
            dashed={!live}
            label={`${card.title} node`}
          >
            <Link href={card.href} className="node-log-link" title={`Open ${card.title}`}>
              <div className="live-face value-card parent-face">
                <header className="live-head">
                  <h2 className="node-ticker">{card.title}</h2>
                  {live ? (
                    <p className="value-headline">{card.headline}</p>
                  ) : (
                    <p className="node-note value-status">{card.detail ?? emptyCopy}</p>
                  )}
                  {live && card.detail ? <p className="value-price">{card.detail}</p> : null}
                </header>
                {card.id === "runs" ? <RunBars bars={card.bars ?? []} compact /> : null}
                {card.id === "heart" ? <HeartTrend points={card.heart ?? []} compact /> : null}
              </div>
            </Link>
          </NodeSquare>
        );
      })}
    </section>
  );
}
