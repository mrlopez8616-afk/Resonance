import Link from "next/link";
import { PredictionsVisual } from "@/components/home-visual";
import {
  EmptyCard,
  NodeGrid,
  NodeHeader,
  NodeLayout,
  NodeSection,
  NodeSections,
  StatCard,
} from "@/components/node-layout";
import { formatSignedUsd, formatUsd } from "@/lib/bets";
import {
  bankrollDepositLine,
  bankrollHomeFace,
  FLAT_STAKE_LABEL,
  type BankrollBookFacts,
  type BankrollLedger,
} from "@/lib/bankroll";
import { formatCivilDate } from "@/lib/calendar-time";
import type { TierSegment } from "@/lib/home-visuals";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
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
  const bankrollHref = `${parentCardHref("fight-desk")}/bankroll`;
  const parts: NodePart[] = [
    publicMode ? (record ? "live" : "missing") : face ? "live" : bookFacts ? "partial" : "missing",
    fightsOpen ? "live" : "missing",
  ];
  const showTrend = !publicMode && ((segments && segments.length > 0) || (bankrollLine && bankrollLine.length > 0));
  return (
    <NodeLayout>
      <NodeHeader name={label} parts={parts} backHref="/" />
      <NodeSections>
        <NodeSection kind="trends" empty={!showTrend}>
          {showTrend ? <PredictionsVisual segments={segments} bankroll={bankrollLine} /> : null}
        </NodeSection>
        <NodeSection kind="lists" label="Children">
          <NodeGrid>
            {publicMode ? (
              record ? (
                <StatCard label="Bankroll" href={bankrollHref} value={record} detail={roi ?? "record"} />
              ) : (
                <EmptyCard label="Bankroll" />
              )
            ) : ledger ? (
              <StatCard
                label="Bankroll"
                money
                href={bankrollHref}
                value={ledger.bankrollLabel}
                detail={`${ledger.atRiskLabel} at risk`}
              />
            ) : bookFacts ? (
              <StatCard label="Bankroll" href={bankrollHref} value="deposits unavailable" detail={bookFacts.recordLabel} />
            ) : (
              <EmptyCard label="Bankroll" />
            )}
            {fightsOpen ? (
              <StatCard label="Fights" href="/fights" value={fightsOpen} detail="open" />
            ) : (
              <EmptyCard label="Fights" />
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
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
  const updatedAt = latestTimestamp(deposits.map((row) => row.voidedAt));
  return (
    <NodeLayout>
      <NodeHeader name="Bankroll" parts={["live"]} updatedAt={updatedAt} backHref="/n/fight-desk" />
      {publicMode ? null : (
        <p className="node-note">
          From {formatUsd(ledger.start)} on {formatCivilDate(ledger.asOf)}
        </p>
      )}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {publicMode ? (
              <>
                <StatCard label="Record" value={ledger.recordLabel} />
                {roi ? <StatCard label="ROI" value={roi} /> : <EmptyCard label="ROI" />}
              </>
            ) : (
              <>
                <StatCard label="At risk" money value={ledger.atRiskLabel} />
                <StatCard label="Available cash" money value={ledger.cashLabel} />
                {depositLine ? <StatCard label="Deposits" money value={depositLine} /> : null}
                <StatCard label="Record" value={ledger.recordLabel} />
                <StatCard label="ROI" value={ledger.roiLabel} />
                <StatCard label={FLAT_STAKE_LABEL} value={ledger.suggestedStakeLabel} />
              </>
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <section className="bankroll-section" aria-label="Card history">
            <h3>Cards</h3>
            <CardList cards={ledger.cards} empty="No in-scope cards yet" publicMode={publicMode} />
          </section>
          <section className="bankroll-section" aria-label="STRONG vs LEAN">
            <h3>STRONG vs LEAN</h3>
            <ol>
              {ledger.tiers.map((tier) => (
                <li key={tier.id} className="fight-card">
                  <h3>{tier.label}</h3>
                  <p className="fight-result">
                    {publicMode ? tier.recordLabel : `${tier.recordLabel} · ${tier.pnlLabel}`}
                  </p>
                  <p>
                    {publicMode
                      ? tier.open === 1
                        ? "1 open"
                        : `${tier.open} open`
                      : `${tier.atRiskLabel} at risk · ${tier.open === 1 ? "1 open" : `${tier.open} open`}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          {publicMode ? null : (
            <>
              <section className="bankroll-section" aria-label="Before bankroll">
                <h3>Before bankroll</h3>
                <p className="node-note">Excluded from the bankroll.</p>
                <CardList cards={ledger.before} empty="No earlier cards" />
              </section>
              <DepositList deposits={deposits} />
            </>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
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
