import { HeartTrend, RunBars } from "@/components/fitness-charts";
import { EmptyCard, NodeGrid, StatCard } from "@/components/node-layout";
import { fitnessMetricEmpty } from "@/lib/fitness-layout";
import type { FitnessCard } from "@/lib/fitness-board";

/**
 * Child cards for the fitness nodes that still open one level down.
 * The parent screen itself stays the steps, activity, and analytics floor.
 */
export function FitnessGrid({
  cards,
  publicMode = false,
}: {
  cards: readonly FitnessCard[];
  publicMode?: boolean;
}) {
  return (
    <NodeGrid>
      {cards.map((card) => {
        if (publicMode && card.id === "heart") return <StatCard key={card.id} label={card.title} locked />;
        if (fitnessMetricEmpty(card.headline)) {
          return <EmptyCard key={card.id} label={card.title} setupHref={card.href} setupLabel="Open" />;
        }
        return (
          <StatCard key={card.id} label={card.title} value={card.headline} detail={card.detail} href={card.href}>
            {card.id === "runs" ? <RunBars bars={card.bars ?? []} compact /> : null}
            {card.id === "heart" ? <HeartTrend points={card.heart ?? []} compact /> : null}
          </StatCard>
        );
      })}
    </NodeGrid>
  );
}
