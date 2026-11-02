import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { formatCivilDate } from "@/lib/calendar-time";
import { FINANCE_EMPTY_LINE, type FinanceCardModel } from "@/lib/finance/view";
import { hasMoneyText } from "@/lib/public-mode";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";

export function FinanceAsOf({ asOf, stale }: { asOf: string; stale: boolean }) {
  return (
    <p className="finance-asof">
      as of {formatCivilDate(asOf)}
      {stale ? <span className="warn-badge finance-stale">stale</span> : null}
    </p>
  );
}

export function FinanceWaiting() {
  return (
    <p className="parent-empty" role="status">
      {FINANCE_EMPTY_LINE}
    </p>
  );
}

function cardText(card: FinanceCardModel): string {
  return [card.headline, ...card.lines].filter((line): line is string => Boolean(line?.trim())).join(" ");
}

function cardPart(card: FinanceCardModel, publicMode: boolean): NodePart {
  if (!card.headline) return "missing";
  if (publicMode && hasMoneyText(cardText(card))) return "missing";
  return "live";
}

export function FinanceFloor({
  asOf,
  stale,
  cards,
  publicMode = false,
  updatedAt = null,
}: {
  asOf: string;
  stale: boolean;
  cards: readonly FinanceCardModel[];
  publicMode?: boolean;
  /** Real snapshot clock. A civil as-of date is not a timestamp. */
  updatedAt?: string | null;
}) {
  return (
    <NodeLayout>
      <NodeHeader
        name="Finance"
        parts={cards.map((card) => cardPart(card, publicMode))}
        updatedAt={latestTimestamp([updatedAt])}
        backHref="/"
      />
      <FinanceAsOf asOf={asOf} stale={stale} />
      <NodeSections>
        <NodeSection kind="lists" label="Children">
          <NodeGrid>
            {cards.map((card) => {
              const leaked = publicMode && hasMoneyText(cardText(card));
              if (leaked) return <StatCard key={card.id} label={card.title} locked />;
              if (!card.headline) return <EmptyCard key={card.id} label={card.title} />;
              return (
                <StatCard
                  key={card.id}
                  label={card.title}
                  money={!publicMode}
                  href={publicMode ? undefined : card.href}
                  value={card.headline}
                  detail={card.lines[0] ?? null}
                />
              );
            })}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
