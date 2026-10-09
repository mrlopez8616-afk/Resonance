import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import {
  buildSectionLabel,
  buildShowsPrivateText,
  formatUpdatedCt,
  isShippedLive,
  pullHref,
  statusLabel,
  stepPercent,
  type BuildItem,
  type BuildSectionView,
} from "@/lib/build-tracker";
import styles from "@/components/build-tracker.module.css";

function countLine(count: number, label: string): string {
  return `${count} ${label}`;
}

function BuildItemCard({
  item,
  showPr,
  sectionLabel,
  lessonHref,
}: {
  item: BuildItem;
  showPr: boolean;
  sectionLabel?: string;
  lessonHref?: string | null;
}) {
  const percent = stepPercent(item.steps);
  const width = percent ?? 0;
  const updated = formatUpdatedCt(item.updatedAt);
  return (
    <article className={styles.item} id={item.id}>
      <div className={styles.top}>
        <h3 className={styles.title}>{item.title}</h3>
        <span className={styles.chip} data-status={item.status}>
          {statusLabel(item.status)}
        </span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-label={`${item.title} percent`}
      >
        <span style={{ width: `${width}%` }} />
      </div>
      <p className={styles.meta}>
        <span className={styles.percent}>{percent === null ? "no steps" : `${percent}%`}</span>
        {sectionLabel ? <span>{sectionLabel}</span> : null}
        {showPr && item.prNumber != null ? (
          <a href={pullHref(item.prNumber)}>#{item.prNumber}</a>
        ) : null}
        {lessonHref ? <Link href={lessonHref}>Lesson</Link> : null}
        {updated ? <span>Updated {updated}</span> : null}
      </p>
      {item.nextStep ? <p className={styles.next}>{item.nextStep}</p> : null}
    </article>
  );
}

function ItemList({
  items,
  showPr,
  showSection,
  lessonHrefs = {},
}: {
  items: readonly BuildItem[];
  showPr: boolean;
  showSection: boolean;
  lessonHrefs?: Readonly<Record<string, string>>;
}) {
  return (
    <div className={styles.items}>
      {items.map((item) => (
        <BuildItemCard
          key={item.id}
          item={item}
          showPr={showPr}
          sectionLabel={showSection ? buildSectionLabel(item.node) : undefined}
          lessonHref={lessonHrefs[item.id] ?? null}
        />
      ))}
    </div>
  );
}

export function BuildParent({
  totalPercent,
  githubFresh,
  sections,
}: {
  totalPercent: number | null;
  githubFresh: boolean;
  sections: readonly BuildSectionView[];
}) {
  return (
    <div className={`build-floor ${styles.floor}`}>
      <header className={styles.heading}>
        <p className={styles.total}>{totalPercent === null ? "—" : `${totalPercent}%`}</p>
        <p className={styles.totalNote}>complete</p>
      </header>
      {githubFresh ? null : (
        <p className={styles.note}>GitHub didn&apos;t answer. Showing the last stored steps.</p>
      )}
      <section className={`node-grid home-floor ${styles.sections}`} aria-label="Build sections">
        {sections.map((section) => {
          const width = section.percent ?? 0;
          const lines = [
            countLine(section.counts.live, "live"),
            countLine(section.counts.inProgress, "in progress"),
            countLine(section.counts.queued, "queued"),
          ];
          return (
            <NodeSquare
              key={section.id}
              parent
              home
              live={section.percent !== null}
              dashed={section.percent === null}
              label={section.label}
            >
              <Link href={`/n/build/${section.id}`} className="node-log-link" title={`Open ${section.label}`}>
                <div className="live-face parent-face">
                  <h2 className="node-ticker">{section.label}</h2>
                  <p className="live-units">
                    {section.percent === null ? "no steps" : `${section.percent}%`}
                  </p>
                  <ul className="parent-lines">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div
                    className={styles.mini}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={width}
                    aria-label={`${section.label} percent`}
                  >
                    <span style={{ width: `${width}%` }} />
                  </div>
                </div>
              </Link>
            </NodeSquare>
          );
        })}
      </section>
    </div>
  );
}

export function BuildSectionBody({
  section,
  now,
  showPr = buildShowsPrivateText(false),
  lessonHrefs = {},
}: {
  section: BuildSectionView;
  now: Date;
  showPr?: boolean;
  lessonHrefs?: Readonly<Record<string, string>>;
}) {
  const queue = section.id === "queue";
  const active = queue ? section.items : section.items.filter((item) => !isShippedLive(item, now));
  const shipped = queue ? [] : section.items.filter((item) => isShippedLive(item, now));
  return (
    <div className={`build-floor ${styles.floor}`}>
      <header className={styles.heading}>
        <h2 className={styles.sectionName}>{section.label}</h2>
        <p className={styles.total}>{section.percent === null ? "—" : `${section.percent}%`}</p>
      </header>
      {active.length > 0 ? (
        <ItemList items={active} showPr={showPr} showSection={queue} lessonHrefs={lessonHrefs} />
      ) : shipped.length === 0 ? (
        <p className={styles.note}>{queue ? "Nothing queued." : "No items in this section."}</p>
      ) : null}
      {shipped.length > 0 ? (
        <details className={styles.shipped}>
          <summary>Shipped</summary>
          <ItemList items={shipped} showPr={showPr} showSection={false} lessonHrefs={lessonHrefs} />
        </details>
      ) : null}
    </div>
  );
}
