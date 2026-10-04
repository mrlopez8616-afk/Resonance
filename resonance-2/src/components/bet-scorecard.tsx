import type { Bet } from "@/lib/bets";
import { scoreBets, summarizeUfcBook } from "@/lib/bets";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function voidLabel(count: number): string {
  return count === 1 ? "1 void" : `${count} voids`;
}

function soldLabel(count: number): string {
  return count === 1 ? "1 sold early" : `${count} sold early`;
}

function recordLabel(record: string, voids: number, sold: number): string {
  const parts = [record];
  if (voids > 0) parts.push(voidLabel(voids));
  if (sold > 0) parts.push(soldLabel(sold));
  return parts.join(" · ");
}

/** Settled founder and hub-lean records. Open tickets are a separate count. */
export function BetScorecard({ bets }: { bets: readonly Bet[] }) {
  const card = scoreBets(bets);
  return (
    <section className="bet-score" aria-label="Scorecard">
      <p className="log-kicker">Scorecard</p>
      <dl>
        <Stat label="Founder" value={card.founder.record} />
        <Stat label="Hub lean" value={card.hub.record} />
        <Stat label="With lean" value={card.withLean.record} />
        <Stat label="Against lean" value={card.againstLean.record} />
        {card.voids > 0 ? <Stat label="Void" value={voidLabel(card.voids)} /> : null}
        {card.sold > 0 ? <Stat label="Sold" value={soldLabel(card.sold)} /> : null}
        <Stat label="Open" value={String(card.open)} />
      </dl>
    </section>
  );
}

/** Live bets-store book for the UFC log. */
export function UfcBookPanel({ bets }: { bets: readonly Bet[] }) {
  const book = summarizeUfcBook(bets);
  const record = recordLabel(book.record, book.voids, book.sold);
  const potential = book.estimated
    ? `${book.openPotentialLabel} return est.`
    : `${book.openPotentialLabel} return`;
  return (
    <section className="bet-score" aria-label="UFC book">
      <p className="log-kicker">Book</p>
      <dl>
        <Stat label="Record" value={record} />
        <Stat label="Staked" value={book.totalStakedLabel} />
        <Stat label="Realized" value={book.realizedPnlLabel} />
        <Stat
          label="Open"
          value={`${book.open} · ${book.openStakeLabel} · ${potential}`}
        />
      </dl>
    </section>
  );
}
