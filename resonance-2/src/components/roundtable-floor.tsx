import { NodeFace } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { roundtableHomeFace } from "@/lib/home-faces";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import { hasMoneyText } from "@/lib/public-mode";
import {
  ROUNDTABLE_EMPTY,
  type RoundtableCard,
  type RoundtableHomeModel,
} from "@/lib/roundtable";

export function RoundtableHomeCard({ card }: { card: RoundtableHomeModel }) {
  return <NodeFace face={roundtableHomeFace(card)} />;
}

function quietBoard() {
  return (
    <NodeLayout>
      <NodeHeader name="Roundtable" parts={["missing"]} backHref="/" />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeGrid>
            <EmptyCard span="list" label={ROUNDTABLE_EMPTY} />
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function RoundtableParent({ cards, publicMode = false }: { cards: RoundtableCard[] | null; publicMode?: boolean }) {
  if (!cards || cards.length === 0) return quietBoard();
  const parts: NodePart[] = ["live"];
  return (
    <NodeLayout>
      <NodeHeader
        name="Roundtable"
        parts={parts}
        updatedAt={latestTimestamp(cards.map((card) => card.updatedAt))}
        backHref="/"
      />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeGrid>
            {cards.map((card) => (
              <StatCard
                key={card.id}
                span="list"
                label={card.agentName}
                value={publicMode && hasMoneyText(card.title) ? "Message" : card.title}
                detail={[card.when, card.countLabel].filter(Boolean).join(" · ")}
                href={card.href}
              />
            ))}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
