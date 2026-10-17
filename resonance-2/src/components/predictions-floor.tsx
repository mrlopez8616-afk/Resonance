import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { PredictionsVisual } from "@/components/home-visual";
import { formatUsd } from "@/lib/bets";
import { bankrollHomeFace, type BankrollLedger } from "@/lib/bankroll";
import { formatCivilDate } from "@/lib/calendar-time";
import { tileFace } from "@/lib/home-faces";
import type { TierSegment } from "@/lib/home-visuals";
import { parentById, parentCardHref } from "@/lib/node-parents";

export function PredictionsFloor({
  ledger,
  segments = null,
  bankrollLine = null,
}: {
  ledger: BankrollLedger | null;
  segments?: readonly TierSegment[] | null;
  bankrollLine?: readonly number[] | null;
}) {
  const face = ledger ? bankrollHomeFace(ledger) : null;
  const fightsOpen = ledger ? (ledger.deskOpen === 1 ? "1 open" : `${ledger.deskOpen} open`) : null;
  const label = parentById("fight-desk")?.label ?? "Fight Desk";
  return (
    <>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <header className="log-header">
        <p className="log-kicker">{label}</p>
        {face ? (
          <>
            <h2 className="log-title">{face.headline}</h2>
            <p className="log-meta">{face.priceLine}</p>
          </>
        ) : (
          <>
            <h2 className="log-title">{label}</h2>
            <p className="log-meta">unavailable</p>
          </>
        )}
      </header>
      <PredictionsVisual segments={segments} bankroll={bankrollLine} />
      <NodeFaceGrid label="Fight Desk nodes">
        <NodeFace
          face={tileFace({
            id: "bankroll",
            glyph: "fight-desk",
            href: `${parentCardHref("fight-desk")}/bankroll`,
            name: "Bankroll",
            headline: ledger?.bankrollLabel ?? "unavailable",
            status: ledger ? `${ledger.atRiskLabel} at risk` : null,
            live: face !== null,
          })}
        />
        <NodeFace
          face={tileFace({
            id: "fights",
            glyph: "fight-desk",
            href: "/fights",
            name: "Fights",
            headline: fightsOpen,
            status: fightsOpen ? "open" : null,
            live: fightsOpen !== null,
          })}
        />
      </NodeFaceGrid>
    </>
  );
}

export function BankrollLedgerView({ ledger }: { ledger: BankrollLedger }) {
  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Bankroll</p>
        <h2 className="log-title">{ledger.bankrollLabel}</h2>
        <p className="log-meta">
          From {formatUsd(ledger.start)} on {formatCivilDate(ledger.asOf)}
        </p>
      </header>
      <dl className="bankroll-stats">
        <div>
          <dt>At risk</dt>
          <dd>{ledger.atRiskLabel}</dd>
        </div>
        <div>
          <dt>Available cash</dt>
          <dd>{ledger.cashLabel}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>{ledger.recordLabel}</dd>
        </div>
        <div>
          <dt>ROI</dt>
          <dd>{ledger.roiLabel}</dd>
        </div>
        <div>
          <dt>Suggested stake</dt>
          <dd>{ledger.suggestedStakeLabel}</dd>
        </div>
      </dl>
      <section className="bankroll-section" aria-label="Card history">
        <h3>Cards</h3>
        <CardList cards={ledger.cards} empty="No in-scope cards yet" />
      </section>
      <section className="bankroll-section" aria-label="STRONG vs LEAN">
        <h3>STRONG vs LEAN</h3>
        <ol>
          {ledger.tiers.map((tier) => (
            <li key={tier.id} className="fight-card">
              <h3>{tier.label}</h3>
              <p className="fight-result">
                {tier.recordLabel} · {tier.pnlLabel}
              </p>
              <p>
                {tier.atRiskLabel} at risk · {tier.open === 1 ? "1 open" : `${tier.open} open`}
              </p>
            </li>
          ))}
        </ol>
      </section>
      <section className="bankroll-section" aria-label="Before bankroll">
        <h3>Before bankroll</h3>
        <p className="log-meta">Excluded from the bankroll.</p>
        <CardList cards={ledger.before} empty="No earlier cards" />
      </section>
    </div>
  );
}

function CardList({ cards, empty }: { cards: BankrollLedger["cards"]; empty: string }) {
  if (cards.length === 0) return <p className="calendar-quiet">{empty}</p>;
  return (
    <ol>
      {cards.map((card) => (
        <li key={card.slug}>
          <Link href={card.href} className="fight-card">
            <p className="log-kicker">{card.dateLabel}</p>
            <h3>{card.title}</h3>
            <p className="fight-result">
              {card.recordLabel} · {card.pnlLabel}
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
