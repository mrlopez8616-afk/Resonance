import Link from "next/link";
import { NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import type { NodePart } from "@/lib/node-layout";
import {
  BRICK_STATUSES,
  brickCounts,
  brickFiltersVisible,
  brickGroups,
  brickHref,
  brickListHref,
  brickStatusLabel,
  type BrickRow,
  type BrickStatus,
} from "@/lib/youtube-bricks";

function BrickLinks({ row }: { row: BrickRow }) {
  return (
    <p className="brick-links">
      <Link href={row.buildHref}>Build</Link>
      {row.prHref && row.prNumber != null ? (
        <a href={row.prHref} rel="noreferrer">
          PR {row.prNumber}
        </a>
      ) : null}
      {row.lessonHref ? <Link href={row.lessonHref}>{row.lessonLabel}</Link> : <span>{row.lessonLabel}</span>}
    </p>
  );
}

function BrickSummary({ row }: { row: BrickRow }) {
  if (row.summary === row.title) return null;
  return <p className="brick-summary">{row.summary}</p>;
}

export function YouTubeBrickList({
  rows,
  filter,
}: {
  rows: readonly BrickRow[] | null;
  filter: BrickStatus | "all";
}) {
  if (!rows) {
    return (
      <NodeLayout>
        <NodeHeader name="Brick Tracker" parts={["missing"]} backHref="/n/youtube" />
        <NodeSections>
          <NodeSection kind="lists" empty />
        </NodeSections>
      </NodeLayout>
    );
  }
  const counts = brickCounts(rows);
  const groups = brickGroups(rows, filter);
  const showFilters = brickFiltersVisible(counts, filter);
  const countLabel = counts.total === 1 ? "1 brick" : `${counts.total} bricks`;
  const parts: NodePart[] = rows.length > 0 ? ["live"] : ["missing"];
  return (
    <NodeLayout>
      <NodeHeader name="Brick Tracker" parts={parts} backHref="/n/youtube" />
      <NodeSections>
        <NodeSection kind="lists" empty={rows.length === 0}>
          {rows.length === 0 ? null : (
            <>
              <p className="node-note">{countLabel}</p>
              {showFilters ? (
                <nav className="brick-filters" aria-label="Episode status">
                  <Link
                    href={brickListHref("all")}
                    className={filter === "all" ? "brick-filter is-on" : "brick-filter"}
                    aria-current={filter === "all" ? "page" : undefined}
                  >
                    All {counts.total}
                  </Link>
                  {BRICK_STATUSES.filter((status) => counts[status] > 0 || status === filter).map((status) => (
                    <Link
                      key={status}
                      href={brickListHref(status)}
                      className={filter === status ? "brick-filter is-on" : "brick-filter"}
                      aria-current={filter === status ? "page" : undefined}
                    >
                      {brickStatusLabel(status)} {counts[status]}
                    </Link>
                  ))}
                </nav>
              ) : null}
              {groups.length === 0 ? (
                <p className="node-note">{`No ${filter} episodes.`}</p>
              ) : (
                <NodeGrid>
                  {groups.flatMap((group) => {
                    const cards = group.rows.map((row) => (
                      <StatCard
                        key={row.id}
                        span="list"
                        label={brickStatusLabel(row.status)}
                        value={row.title}
                        titleHref={brickHref(row.id)}
                      >
                        <BrickSummary row={row} />
                        <BrickLinks row={row} />
                      </StatCard>
                    ));
                    if (filter !== "all" || groups.length < 2) return cards;
                    return [
                      <h3 key={`${group.status}-label`} className="brick-group node-span-12">
                        {group.label}
                      </h3>,
                      ...cards,
                    ];
                  })}
                </NodeGrid>
              )}
            </>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function YouTubeBrickDetail({ row }: { row: BrickRow | null }) {
  if (!row) {
    return (
      <NodeLayout>
        <NodeHeader name="Brick" parts={["missing"]} backHref="/n/youtube/bricks" />
        <NodeSections>
          <NodeSection kind="numbers" empty />
        </NodeSections>
      </NodeLayout>
    );
  }
  return (
    <NodeLayout>
      <NodeHeader name={row.title} parts={["live"]} backHref="/n/youtube/bricks" />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            <StatCard label="Status" value={brickStatusLabel(row.status)} />
            {row.summary !== row.title ? (
              <StatCard span="list" label="Summary">
                <p className="node-card-detail">{row.summary}</p>
              </StatCard>
            ) : null}
            <StatCard span="list" label="Build">
              <p className="brick-links">
                <Link href={row.buildHref}>Open the build item</Link>
                {row.prHref && row.prNumber != null ? (
                  <a href={row.prHref} rel="noreferrer">
                    PR {row.prNumber}
                  </a>
                ) : null}
              </p>
            </StatCard>
            <StatCard span="list" label="Lesson">
              <p className="brick-links">
                {row.lessonHref ? <Link href={row.lessonHref}>{row.lessonLabel}</Link> : <span>{row.lessonLabel}</span>}
              </p>
            </StatCard>
            {row.videoUrl ? (
              <StatCard span="list" label="Video">
                <p className="brick-links">
                  <a href={row.videoUrl} rel="noreferrer">
                    {row.videoUrl}
                  </a>
                </p>
              </StatCard>
            ) : null}
            {row.note ? (
              <StatCard span="list" label="Note">
                <p className="node-card-detail">{row.note}</p>
              </StatCard>
            ) : null}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
