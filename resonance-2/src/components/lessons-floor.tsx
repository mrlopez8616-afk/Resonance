"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NodeFace } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { lessonsHomeFace } from "@/lib/home-faces";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import { lessonCategories, type LessonCard, type LessonsHomeModel } from "@/lib/lessons";
import styles from "@/components/lessons-floor.module.css";

const NO_LESSONS: LessonCard[] = [];

function LessonEntry({ card, showSources }: { card: LessonCard; showSources: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.location.hash === `#${card.id}`) detailsRef.current?.setAttribute("open", "");
  }, [card.id]);
  return (
    <StatCard span="list" label={card.category} value={card.title} detail={card.dateLabel}>
      <p className={styles.lesson}>{card.lesson}</p>
      <details ref={detailsRef} id={card.id}>
        <summary className={styles.kicker}>Details</summary>
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
    </StatCard>
  );
}

export function LessonsFloor({
  cards,
  showSources,
}: {
  cards: LessonCard[] | null;
  showSources: boolean;
}) {
  const rows = cards ?? NO_LESSONS;
  const categories = useMemo(() => lessonCategories(rows), [rows]);
  const [filter, setFilter] = useState("all");
  const shown = filter === "all" ? rows : rows.filter((card) => card.category === filter);
  const groups: { key: string; label: string; cards: LessonCard[] }[] = [];
  for (const card of shown) {
    const last = groups[groups.length - 1];
    if (!last || last.key !== card.monthKey) {
      groups.push({ key: card.monthKey, label: card.monthLabel, cards: [card] });
    } else {
      last.cards.push(card);
    }
  }
  const parts: NodePart[] = cards === null || rows.length === 0 ? ["missing"] : ["live"];
  const updatedAt = latestTimestamp(rows.map((card) => card.updatedAt));
  const countLabel = rows.length === 1 ? "1 lesson" : `${rows.length} lessons`;
  const empty = rows.length === 0 ? "No lessons yet." : "No lessons in this category.";

  return (
    <NodeLayout>
      <NodeHeader name="Lessons" parts={parts} updatedAt={cards === null ? null : updatedAt} backHref="/" />
      {cards ? <p className="node-note">{countLabel}</p> : null}
      <NodeSections>
        <NodeSection kind="lists">
          {cards ? (
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
          ) : null}
          {shown.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label={empty} />
            </NodeGrid>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h3 className="brick-group">{group.label}</h3>
                <NodeGrid>
                  {group.cards.map((card) => (
                    <LessonEntry key={card.id} card={card} showSources={showSources} />
                  ))}
                </NodeGrid>
              </section>
            ))
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function LessonsHomeCard({ card, publicMode = false }: { card: LessonsHomeModel; publicMode?: boolean }) {
  return <NodeFace face={lessonsHomeFace(card, publicMode)} />;
}
