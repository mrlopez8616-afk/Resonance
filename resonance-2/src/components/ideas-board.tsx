import type { ReactNode } from "react";
import Link from "next/link";
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

export function IdeasBoard({
  cards,
  filter,
  archivedView,
  actions,
  footer,
}: {
  cards: readonly IdeaCard[];
  filter: IdeaStatus | "all";
  archivedView: boolean;
  actions?: (card: IdeaCard) => ReactNode;
  footer?: ReactNode;
}) {
  const shown = archivedView || filter === "all" ? cards : cards.filter((card) => card.status === filter);
  const groups = archivedView ? [] : ideaGroups(shown, filter);
  const empty =
    cards.length === 0
      ? archivedView
        ? "Nothing archived."
        : "No ideas yet."
      : filter === "all"
        ? "No ideas yet."
        : `No ${ideaStatusLabel(filter).toLowerCase()} ideas.`;

  return (
    <div className={`ideas-board ${styles.board}`}>
      <header className="log-header">
        <p className="log-kicker">Build</p>
        <h2 className="log-title">Future Ideas</h2>
        <p className="log-meta">{countLabel(cards.length, archivedView)}</p>
      </header>
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
      {shown.length === 0 ? <p className={styles.empty}>{empty}</p> : null}
      {archivedView ? (
        <ul className={styles.list}>
          {shown.map((card) => (
            <li key={card.id}>
              <IdeaCardView card={card} actions={actions?.(card)} />
            </li>
          ))}
        </ul>
      ) : (
        groups.map((group) =>
          group.cards.length === 0 ? null : (
            <section key={group.status} aria-label={group.label}>
              {filter === "all" ? <h3 className={styles.group}>{group.label}</h3> : null}
              <ul className={styles.list}>
                {group.cards.map((card) => (
                  <li key={card.id}>
                    <IdeaCardView card={card} actions={actions?.(card)} />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )
      )}
      {footer}
    </div>
  );
}

function IdeaCardView({ card, actions }: { card: IdeaCard; actions?: ReactNode }) {
  return (
    <article className={styles.card} id={card.id}>
      <div className={styles.top}>
        <h3 className={styles.title}>{card.title}</h3>
        <span className={styles.chip} data-status={card.status}>
          {card.statusLabel}
        </span>
      </div>
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
    </article>
  );
}
