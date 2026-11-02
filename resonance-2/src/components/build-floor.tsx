import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import {
  EmptyCard,
  NodeGrid,
  NodeHeader,
  NodeLayout,
  NodeSection,
  NodeSections,
  StatCard,
} from "@/components/node-layout";
import { cwrBuildFace } from "@/lib/crawl-walk-run-faces";
import { tileFace, type HomeFace } from "@/lib/home-faces";
import { headlineIsEmpty, latestTimestamp, type NodePart } from "@/lib/node-layout";
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

function sectionPart(section: BuildSectionView): NodePart {
  if (section.items.length === 0 || section.percent === null) return "missing";
  return "live";
}

function buildParentParts(
  totalPercent: number | null,
  githubFresh: boolean,
  sections: readonly BuildSectionView[],
  backup: HomeFace,
): NodePart[] {
  const parts: NodePart[] = [totalPercent === null ? "missing" : "live"];
  if (!githubFresh) parts.push("partial");
  const withItems = sections.filter((section) => section.items.length > 0);
  if (withItems.length === 0) parts.push("missing");
  else parts.push(withItems.every((section) => section.percent !== null) ? "live" : "partial");
  if (backup.live) parts.push("live");
  else if (headlineIsEmpty(backup.headline) || backup.headline === "unavailable") parts.push("missing");
  else parts.push("partial");
  return parts;
}

function buildUpdated(sections: readonly BuildSectionView[]): string | null {
  return latestTimestamp(sections.flatMap((section) => section.items.map((item) => item.updatedAt)));
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
  const bits = [
    percent === null ? "no steps" : `${percent}%`,
    sectionLabel,
    updated ? `Updated ${updated}` : null,
  ].filter((bit): bit is string => Boolean(bit));
  const hidePull = !showPr && item.prNumber != null;
  return (
    <StatCard id={item.id} span="list" label={statusLabel(item.status)} value={item.title} detail={bits.join(" · ")}>
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
      {item.nextStep ? <p className={styles.next}>{item.nextStep}</p> : null}
      {lessonHref ? (
        <p className={styles.meta}>
          <Link href={lessonHref}>Lesson</Link>
        </p>
      ) : null}
      {showPr && item.prNumber != null ? (
        <p className={styles.meta}>
          <a href={pullHref(item.prNumber)}>#{item.prNumber}</a>
        </p>
      ) : null}
      {hidePull ? <StatCard label="Pull request" locked /> : null}
    </StatCard>
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
    <>
      {items.map((item) => (
        <BuildItemCard
          key={item.id}
          item={item}
          showPr={showPr}
          sectionLabel={showSection ? buildSectionLabel(item.node) : undefined}
          lessonHref={lessonHrefs[item.id] ?? null}
        />
      ))}
    </>
  );
}

export function BuildParent({
  totalPercent,
  githubFresh,
  sections,
  notes = [],
  backup,
}: {
  totalPercent: number | null;
  githubFresh: boolean;
  sections: readonly BuildSectionView[];
  /** Home-tile lines that do not fit the one status slot, such as the next queued title. */
  notes?: readonly string[];
  backup: HomeFace;
}) {
  return (
    <NodeLayout>
      <NodeHeader
        name="Build"
        parts={buildParentParts(totalPercent, githubFresh, sections, backup)}
        updatedAt={buildUpdated(sections)}
        backHref="/"
      />
      {notes.map((line) => (
        <p key={line} className="node-note">
          {line}
        </p>
      ))}
      {githubFresh ? null : (
        <p className="node-note">GitHub didn&apos;t answer. Showing the last stored steps.</p>
      )}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {totalPercent === null ? (
              <EmptyCard label="Complete" />
            ) : (
              <StatCard label="Complete" value={`${totalPercent}%`} detail="all tracked steps" />
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeFaceGrid label="Build sections">
            {sections.map((section) => {
              const lines = [
                countLine(section.counts.live, "live"),
                countLine(section.counts.inProgress, "in progress"),
                countLine(section.counts.queued, "queued"),
              ];
              return (
                <NodeFace
                  key={section.id}
                  face={tileFace({
                    id: section.id,
                    glyph: "build",
                    href: `/n/build/${section.id}`,
                    name: section.label,
                    headline: section.percent === null ? "no steps" : `${section.percent}%`,
                    status: lines.join(" · "),
                    live: section.percent !== null,
                  })}
                />
              );
            })}
            <NodeFace
              face={tileFace({
                id: "ideas",
                glyph: "build",
                href: "/n/ideas",
                name: "Future Ideas",
                headline: "Board",
                status: "What comes next",
                live: true,
              })}
            />
            <NodeFace face={cwrBuildFace()} />
            <NodeFace face={backup} />
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
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
  const empty = active.length === 0 && shipped.length === 0;
  const updatedAt = latestTimestamp(section.items.map((item) => item.updatedAt));
  const countDetail = [
    countLine(section.counts.live, "live"),
    countLine(section.counts.inProgress, "in progress"),
    countLine(section.counts.queued, "queued"),
  ].join(" · ");
  return (
    <NodeLayout>
      <NodeHeader
        name={section.label}
        parts={[sectionPart(section), empty ? "missing" : "live"]}
        updatedAt={updatedAt}
        backHref="/n/build"
      />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {section.percent === null ? (
              <EmptyCard label="Complete" />
            ) : (
              <StatCard label="Complete" value={`${section.percent}%`} detail={countDetail} />
            )}
            <StatCard label="Live" value={String(section.counts.live)} />
            <StatCard label="In progress" value={String(section.counts.inProgress)} />
            <StatCard label="Queued" value={String(section.counts.queued)} />
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeGrid>
            {empty ? (
              <EmptyCard label={section.label} span="list" />
            ) : active.length > 0 ? (
              <ItemList items={active} showPr={showPr} showSection={queue} lessonHrefs={lessonHrefs} />
            ) : null}
          </NodeGrid>
          {shipped.length > 0 ? (
            <details className={styles.shipped}>
              <summary>Shipped</summary>
              <NodeGrid>
                <ItemList items={shipped} showPr={showPr} showSection={false} lessonHrefs={lessonHrefs} />
              </NodeGrid>
            </details>
          ) : null}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
