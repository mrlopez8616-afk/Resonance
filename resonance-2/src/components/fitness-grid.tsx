import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import { FITNESS_EMPTY, type FitnessCard } from "@/lib/fitness-board";

export function FitnessGrid({ cards }: { cards: readonly FitnessCard[] }) {
  return (
    <section className="node-grid" aria-label="Fitness nodes">
      {cards.map((card) => {
        const live = card.headline !== null;
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
                    <p className="node-note value-status">{card.detail ?? FITNESS_EMPTY}</p>
                  )}
                  {live && card.detail ? <p className="value-price">{card.detail}</p> : null}
                </header>
              </div>
            </Link>
          </NodeSquare>
        );
      })}
    </section>
  );
}
