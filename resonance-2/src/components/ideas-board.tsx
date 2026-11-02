import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import {
  IDEA_STATUSES,
  ideaGroups,
  ideaListHref,
  ideaStatusLabel,
  type IdeaCard,
  type IdeaStatus,
} from "@/lib/future-ideas";
import styles from "@/components/ideas-board.module.css";

function countLabel(count: number, archivedView: boolean): string {
  if (archivedView) return count === 1 ? "1 archived" : `${count} archived`;
  return count === 1 ? "1 idea" : `${count} ideas`;
}

function emptyLabel(cards: readonly IdeaCard[], filter: IdeaStatus | "all", archivedView: boolean): string {
  if (archivedView && cards.length === 0) return "Nothing archived.";
  if (cards.length === 0 || filter === "all") return "No ideas yet.";
  return `No ${ideaStatusLabel(filter).toLowerCase()} ideas.`;
}

export function IdeasBoard({
  cards,
  filter,
  archivedView,
  actions,
  footer,
}: {
  cards: readonly IdeaCard[] | null;
  filter: IdeaStatus | "all";
  archivedView: boolean;
  actions?: (card: IdeaCard) => ReactNode;
  footer?: ReactNode;
}) {
  if (!cards) {
    return (
      <NodeLayout>
        <NodeHeader name="Future Ideas" parts={["missing"]} backHref="/n/build" />
        <NodeSections>
          <NodeSection kind="lists">
            <NodeGrid>
              <EmptyCard span="list" label="Ideas" />
            </NodeGrid>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }

  const shown = archivedView || filter === "all" ? cards : cards.filter((card) => card.status === filter);
  const groups = archivedView ? [] : ideaGroups(shown, filter);
  const parts: NodePart[] = cards.length > 0 ? ["live"] : ["missing"];
  const updatedAt = latestTimestamp(cards.map((card) => card.updatedAt));

  return (
    <NodeLayout>
      <NodeHeader name="Future Ideas" parts={parts} updatedAt={updatedAt} backHref="/n/build" />
      <p className="node-note">{countLabel(cards.length, archivedView)}</p>
      <NodeSections>
        <NodeSection kind="lists">
          <nav className={styles.filters} aria-label="Idea status">
            <Link
              href={ideaListHref("all")}
              className={!archivedView && filter === "all" ? styles.filterOn : styles.filter}
              aria-current={!archivedView && filter === "all" ? "page" : undefined}
            >
              All
            </Link>
            {IDEA_STATUSES.map((status) => (
              <Link
                key={status}
                href={ideaListHref(status)}
                className={!archivedView && filter === status ? styles.filterOn : styles.filter}
                aria-current={!archivedView && filter === status ? "page" : undefined}
              >
                {ideaStatusLabel(status)}
              </Link>
            ))}
            {actions ? (
              <Link
                href={ideaListHref("all", true)}
                className={archivedView ? styles.filterOn : styles.filter}
                aria-current={archivedView ? "page" : undefined}
              >
                Archived
              </Link>
            ) : null}
          </nav>
          {shown.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label={emptyLabel(cards, filter, archivedView)} />
            </NodeGrid>
          ) : archivedView ? (
            <NodeGrid>
              {shown.map((card) => (
                <IdeaCardView key={card.id} card={card} actions={actions?.(card)} />
              ))}
            </NodeGrid>
          ) : (
            groups.map((group) =>
              group.cards.length === 0 ? null : (
                <section key={group.status} aria-label={group.label}>
                  {filter === "all" ? <h3 className={styles.group}>{group.label}</h3> : null}
                  <NodeGrid>
                    {group.cards.map((card) => (
                      <IdeaCardView key={card.id} card={card} actions={actions?.(card)} />
                    ))}
                  </NodeGrid>
                </section>
              ),
            )
          )}
        </NodeSection>
      </NodeSections>
      {footer}
    </NodeLayout>
  );
}

function IdeaCardView({ card, actions }: { card: IdeaCard; actions?: ReactNode }) {
  return (
    <StatCard span="list" label={card.statusLabel} value={card.title}>
      <div id={card.id}>
        {card.note ? <p className={styles.note}>{card.note}</p> : null}
        {card.tags.length > 0 ? (
          <ul className={styles.tags} aria-label="Tags">
            {card.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
        <p className={styles.added}>
          Added <time dateTime={card.addedOn}>{card.addedLabel}</time>
        </p>
        {actions}
      </div>
    </StatCard>
  );
}
