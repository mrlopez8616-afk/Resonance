import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import {
  ROUNDTABLE_EMPTY,
  ROUNDTABLE_HREF,
  type RoundtableCard,
  type RoundtableHomeModel,
} from "@/lib/roundtable";

export function RoundtableHomeCard({ card }: { card: RoundtableHomeModel }) {
  const empty = card.unavailable || card.count === 0;
  return (
    <section className="control-home" aria-label="Roundtable">
      <NodeSquare parent home live={!empty} dashed={empty} label="Roundtable">
        <Link href={ROUNDTABLE_HREF} className="node-log-link" title="Open Roundtable">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Roundtable</h2>
            {card.unavailable ? (
              <p className="node-note">unavailable</p>
            ) : card.count === 0 ? (
              <p className="live-units">{ROUNDTABLE_EMPTY}</p>
            ) : (
              <p className="live-units">{card.count}</p>
            )}
            {card.count > 0 && card.lines.length > 0 ? (
              <ul className="parent-lines">
                {card.lines.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Link>
      </NodeSquare>
    </section>
  );
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

