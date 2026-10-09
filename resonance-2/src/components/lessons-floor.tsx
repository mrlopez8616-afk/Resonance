"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NodeSquare } from "@/components/node-square";
import { lessonCategories, type LessonCard, type LessonsHomeModel } from "@/lib/lessons";
import styles from "@/components/lessons-floor.module.css";

function LessonEntry({ card, showSources }: { card: LessonCard; showSources: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.location.hash === `#${card.id}`) detailsRef.current?.setAttribute("open", "");
  }, [card.id]);
  return (
    <details ref={detailsRef} id={card.id} className={styles.entry}>
      <summary>
        <span className={styles.top}>
          <time dateTime={card.date}>{card.dateLabel}</time>
          <span className={styles.chip}>{card.category}</span>
          <span className={styles.chevron} aria-hidden />
        </span>
        <span className={styles.title}>{card.title}</span>
        <span className={styles.lesson}>{card.lesson}</span>
      </summary>
      <div className={styles.body}>
        <p>
          <span className={styles.kicker}>What changed</span>
          {card.whatChanged}
        </p>
        <p>
          <span className={styles.kicker}>Why</span>
          {card.why}
        </p>
        {showSources && card.sources.length > 0 ? (
          <p>
            <span className={styles.kicker}>Sources</span>
            {card.sources.join(" · ")}
          </p>
        ) : null}
        {card.buildHref || card.prHref ? (
          <p className={styles.links}>
            {card.buildHref ? <Link href={card.buildHref}>Build</Link> : null}
            {card.prHref ? (
              <a href={card.prHref} rel="noreferrer">
                #{card.prNumber}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function LessonsFloor({
  cards,
  showSources,
}: {
  cards: LessonCard[];
  showSources: boolean;
}) {
  const categories = useMemo(() => lessonCategories(cards), [cards]);
  const [filter, setFilter] = useState("all");
  const shown = filter === "all" ? cards : cards.filter((card) => card.category === filter);
  const groups: { key: string; label: string; cards: LessonCard[] }[] = [];
  for (const card of shown) {
    const last = groups[groups.length - 1];
    if (!last || last.key !== card.monthKey) {
      groups.push({ key: card.monthKey, label: card.monthLabel, cards: [card] });
    } else {
      last.cards.push(card);
    }
  }
  const countLabel = cards.length === 1 ? "1 lesson" : `${cards.length} lessons`;

  return (
    <div className={`lessons-floor ${styles.floor}`}>
      <header className="log-header">
        <p className="log-kicker">Founder</p>
        <h2 className="log-title">Lessons</h2>
        <p className="log-meta">{countLabel}</p>
      </header>
      <div className={styles.filters} role="toolbar" aria-label="Category">
        <button
          type="button"
          className={styles.filter}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={styles.filter}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      {groups.map((group) => (
        <section key={group.key} className={styles.group} aria-label={group.label}>
          <h2>{group.label}</h2>
          <div className={styles.entries}>
            {group.cards.map((card) => (
              <LessonEntry key={card.id} card={card} showSources={showSources} />
            ))}
          </div>
        </section>
      ))}
      {shown.length === 0 ? (
        <p className={styles.empty}>{cards.length === 0 ? "No lessons yet." : "No lessons in this category."}</p>
      ) : null}
    </div>
  );
}

export function LessonsHomeCard({ card }: { card: LessonsHomeModel }) {
  return (
    <section className="lessons-home" aria-label="Lessons">
      <NodeSquare
        parent
        home
        live={!card.unavailable && card.count > 0}
        dashed={card.unavailable || card.count === 0}
        label="Lessons"
      >
        <Link href="/n/lessons" className="node-log-link" title="Open Lessons">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Lessons</h2>
            {card.unavailable ? (
              <p className="node-note">unavailable</p>
            ) : (
              <p className="live-units">{card.count}</p>
            )}
            {card.latestTitle ? <p className="lessons-homeLatest">{card.latestTitle}</p> : null}
          </div>
        </Link>
      </NodeSquare>
    </section>
  );
}
