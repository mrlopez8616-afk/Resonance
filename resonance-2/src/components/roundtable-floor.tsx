import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { roundtableHomeFace, tileFace } from "@/lib/home-faces";
import {
  ROUNDTABLE_EMPTY,
  type RoundtableCard,
  type RoundtableHomeModel,
} from "@/lib/roundtable";

export function RoundtableHomeCard({ card }: { card: RoundtableHomeModel }) {
  return <NodeFace face={roundtableHomeFace(card)} />;
}

export function RoundtableParent({ cards }: { cards: RoundtableCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="parent-empty" role="status">
        {ROUNDTABLE_EMPTY}
      </p>
    );
  }
  return (
    <NodeFaceGrid label="Roundtable">
      {cards.map((card) => (
        <NodeFace
          key={card.id}
          face={tileFace({
            id: card.id,
            glyph: "roundtable",
            href: card.href,
            name: card.agentName,
            headline: card.title,
            status: [card.when, card.countLabel].filter(Boolean).join(" · "),
            live: true,
          })}
        />
      ))}
    </NodeFaceGrid>
  );
}

