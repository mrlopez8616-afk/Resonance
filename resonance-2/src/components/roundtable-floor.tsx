import Link from "next/link";
import { NodeFace } from "@/components/node-face";
import { NodeSquare } from "@/components/node-square";
import { roundtableHomeFace } from "@/lib/home-faces";
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
    <section className="node-grid home-floor" aria-label="Roundtable">
      {cards.map((card) => (
        <NodeSquare key={card.id} parent home live label={card.agentName}>
          <Link href={card.href} className="node-log-link" title={`Open ${card.title}`}>
            <div className="live-face parent-face">
              <h2 className="node-ticker">{card.agentName}</h2>
              <p className="live-units">{card.title}</p>
              <ul className="parent-lines">
                {card.when ? <li>{card.when}</li> : null}
                <li>{card.countLabel}</li>
              </ul>
            </div>
          </Link>
        </NodeSquare>
      ))}
    </section>
  );
}

