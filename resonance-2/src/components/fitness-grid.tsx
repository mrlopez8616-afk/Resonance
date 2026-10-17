import Link from "next/link";
import { HeartTrend, RunBars } from "@/components/fitness-charts";
import { FitnessStepVisual } from "@/components/home-visual";
import { NodeSquare } from "@/components/node-square";
import { FITNESS_EMPTY, FITNESS_NOT_RECORDED, type FitnessCard } from "@/lib/fitness-board";
import type { StepSlot } from "@/lib/home-visuals";

/** Week lines and the step chart that used to sit on the home tile. */
export function FitnessWeekPanel({
  lines,
  slots,
}: {
  lines: readonly string[];
  slots: readonly StepSlot[] | null;
}) {
  if (lines.length === 0 && !slots) return null;
  return (
    <section className="parent-glance" aria-label="This week">
      {lines.length > 0 ? (
        <ul className="parent-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {slots ? <FitnessStepVisual slots={slots} /> : null}
    </section>
  );
}

export function FitnessGrid({ cards }: { cards: readonly FitnessCard[] }) {
  return (
    <section className="node-grid fitness-grid" aria-label="Fitness nodes">
      {cards.map((card) => {
        const live = card.headline !== null;
        const emptyCopy =
          card.id === "runs" || card.id === "heart" || card.id === "manual"
            ? FITNESS_NOT_RECORDED
            : FITNESS_EMPTY;
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
