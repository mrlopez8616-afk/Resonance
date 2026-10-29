import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { PredictionsVisual } from "@/components/home-visual";
import { formatSignedUsd, formatUsd } from "@/lib/bets";
import {
  bankrollDepositLine,
  bankrollHomeFace,
  FLAT_STAKE_LABEL,
  type BankrollBookFacts,
  type BankrollLedger,
} from "@/lib/bankroll";
import { formatCivilDate } from "@/lib/calendar-time";
import { tileFace } from "@/lib/home-faces";
import type { TierSegment } from "@/lib/home-visuals";
import { parentById, parentCardHref } from "@/lib/node-parents";
import { hasMoneyText, publicRecordLabel } from "@/lib/public-mode";

export function PredictionsFloor({
  ledger,
  bookFacts = null,
  segments = null,
  bankrollLine = null,
  publicMode = false,
}: {
  ledger: BankrollLedger | null;
  /** Bet book facts when the dollar ledger could not be named. */
  bookFacts?: BankrollBookFacts | null;
  segments?: readonly TierSegment[] | null;
  bankrollLine?: readonly number[] | null;
  publicMode?: boolean;
}) {
  const face = ledger ? bankrollHomeFace(ledger) : null;
  const deskOpen = ledger?.deskOpen ?? bookFacts?.deskOpen ?? null;
  const fightsOpen = deskOpen === null ? null : deskOpen === 1 ? "1 open" : `${deskOpen} open`;
  const label = parentById("fight-desk")?.label ?? "Fight Desk";
  const record = publicRecordLabel(ledger?.recordLabel ?? bookFacts?.recordLabel);
  const roi = ledger && /%$/.test(ledger.roiLabel) && !hasMoneyText(ledger.roiLabel) ? ledger.roiLabel : null;
  return (
    <>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <header className="log-header">
        <p className="log-kicker">{label}</p>
        {publicMode ? (
          <>
            <h2 className="log-title">{record ?? label}</h2>
            <p className="log-meta">{record ? "record" : "unavailable"}</p>
          </>
        ) : face ? (
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
      {publicMode ? null : <PredictionsVisual segments={segments} bankroll={bankrollLine} />}
      <NodeFaceGrid label="Fight Desk nodes">
        <NodeFace
          face={tileFace({
            id: "bankroll",
            glyph: "fight-desk",
            href: `${parentCardHref("fight-desk")}/bankroll`,
            name: "Bankroll",
            headline: publicMode
              ? (record ?? (bookFacts ? "deposits unavailable" : "unavailable"))
              : (ledger?.bankrollLabel ?? (bookFacts ? "deposits unavailable" : "unavailable")),
            status: publicMode
              ? (roi ?? (record ? "record" : null))
              : ledger
                ? `${ledger.atRiskLabel} at risk`
                : bookFacts?.recordLabel ?? null,
            live: publicMode ? record !== null : face !== null,
            publicMode,
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
            publicMode,
          })}
        />
      </NodeFaceGrid>
    </>
  );
}

export type BankrollDepositLine = {
  id: string;
  date: string;
  amount: string;
  voidedAt: string | null;
  voidReason: string | null;
};

export function BankrollLedgerView({
  ledger,
  deposits = [],
  publicMode = false,
}: {
  ledger: BankrollLedger;
  deposits?: readonly BankrollDepositLine[];
  publicMode?: boolean;
}) {
  const depositLine = publicMode ? null : bankrollDepositLine(ledger, false);
  const roi = /%$/.test(ledger.roiLabel) && !hasMoneyText(ledger.roiLabel) ? ledger.roiLabel : null;
  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Bankroll</p>
        <h2 className="log-title">{publicMode ? ledger.recordLabel : ledger.bankrollLabel}</h2>
        <p className="log-meta">
          {publicMode
            ? "record"
            : `From ${formatUsd(ledger.start)} on ${formatCivilDate(ledger.asOf)}`}
        </p>
      </header>
      {publicMode ? (
        <>
          <dl className="bankroll-stats">
            <div>
              <dt>Record</dt>
              <dd>{ledger.recordLabel}</dd>
            </div>
            {roi ? (
              <div>
                <dt>ROI</dt>
                <dd>{roi}</dd>
              </div>
            ) : null}
          </dl>
          <section className="bankroll-section" aria-label="Card history">
            <h3>Cards</h3>
            <CardList cards={ledger.cards} empty="No in-scope cards yet" publicMode />
          </section>
          <section className="bankroll-section" aria-label="STRONG vs LEAN">
            <h3>STRONG vs LEAN</h3>
            <ol>
              {ledger.tiers.map((tier) => (
                <li key={tier.id} className="fight-card">
                  <h3>{tier.label}</h3>
                  <p className="fight-result">{tier.recordLabel}</p>
                  <p>{tier.open === 1 ? "1 open" : `${tier.open} open`}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
      <dl className="bankroll-stats">
          <div>
            <dt>At risk</dt>
            <dd>{ledger.atRiskLabel}</dd>
          </div>
          <div>
            <dt>Available cash</dt>
            <dd>{ledger.cashLabel}</dd>
          </div>
        {depositLine ? (
          <div>
            <dt>Deposits</dt>
            <dd>{depositLine}</dd>
          </div>
        ) : null}
          <div>
            <dt>Record</dt>
            <dd>{ledger.recordLabel}</dd>
          </div>
          <div>
            <dt>ROI</dt>
            <dd>{ledger.roiLabel}</dd>
          </div>
          <div>
            <dt>{FLAT_STAKE_LABEL}</dt>
            <dd>{ledger.suggestedStakeLabel}</dd>
          </div>
      </dl>
      )}
      {publicMode ? null : (
        <>
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
          <DepositList deposits={deposits} />
        </>
      )}
    </div>
  );
}

function DepositList({ deposits }: { deposits: readonly BankrollDepositLine[] }) {
  if (deposits.length === 0) return null;
  return (
    <section className="bankroll-section" aria-label="Ledger">
      <h3>Ledger</h3>
      <ol>
        {deposits.map((row) => (
          <li key={row.id}>
            <p className="log-kicker">{formatCivilDate(row.date)}</p>
            <p className="fight-result">
              {formatSignedUsd(row.amount)}
              {row.voidedAt ? " · voided" : ""}
            </p>
            {row.voidedAt && row.voidReason ? <p>{row.voidReason}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CardList({
  cards,
  empty,
  publicMode = false,
}: {
  cards: BankrollLedger["cards"];
  empty: string;
  publicMode?: boolean;
}) {
  if (cards.length === 0) return <p className="calendar-quiet">{empty}</p>;
  return (
    <ol>
      {cards.map((card) => (
        <li key={card.slug}>
          <Link href={card.href} className="fight-card">
            <p className="log-kicker">{card.dateLabel}</p>
            <h3>{card.title}</h3>
            <p className="fight-result">
              {publicMode ? card.recordLabel : `${card.recordLabel} · ${card.pnlLabel}`}
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
