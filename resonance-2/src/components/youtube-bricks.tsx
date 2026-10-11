import Link from "next/link";
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
  rows: readonly BrickRow[];
  filter: BrickStatus | "all";
}) {
  const counts = brickCounts(rows);
  const groups = brickGroups(rows, filter);
  const showFilters = brickFiltersVisible(counts, filter);
  const countLabel = counts.total === 1 ? "1 brick" : `${counts.total} bricks`;
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">YouTube</p>
        <h2 className="log-title">Brick Tracker</h2>
        <p className="log-meta">{counts.total === 0 ? "No bricks yet." : countLabel}</p>
      </header>
      {showFilters ? (
        <nav className="brick-filters" aria-label="Episode status">
          <Link href={brickListHref("all")} className={filter === "all" ? "brick-filter is-on" : "brick-filter"} aria-current={filter === "all" ? "page" : undefined}>
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
        <p className="control-meta">{filter === "all" ? "No bricks yet." : `No ${filter} episodes.`}</p>
      ) : (
        groups.map((group) => (
          <section key={group.status} aria-label={group.label}>
            {filter === "all" && groups.length > 1 ? <h3 className="brick-group">{group.label}</h3> : null}
            <ul className="control-list">
              {group.rows.map((row) => (
                <li key={row.id} className="control-row">
                  <div>
                    <Link href={brickHref(row.id)} className="brick-open">
                      <p className="control-name">{row.title}</p>
                      <p className="control-meta">{brickStatusLabel(row.status)}</p>
                      <BrickSummary row={row} />
                    </Link>
                    <BrickLinks row={row} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function YouTubeBrickDetail({ row }: { row: BrickRow }) {
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">Brick Tracker</p>
        <h2 className="log-title">{row.title}</h2>
      </header>
      <ul className="control-list">
        <li className="control-row">
          <div>
            <p className="control-name">Status</p>
            <p className="control-meta">{brickStatusLabel(row.status)}</p>
          </div>
        </li>
        {row.summary !== row.title ? (
          <li className="control-row">
            <div>
              <p className="control-name">Summary</p>
              <p className="control-meta">{row.summary}</p>
            </div>
          </li>
        ) : null}
        <li className="control-row">
          <div>
            <p className="control-name">Build</p>
            <p className="brick-links">
              <Link href={row.buildHref}>Open the build item</Link>
              {row.prHref && row.prNumber != null ? (
                <a href={row.prHref} rel="noreferrer">
                  PR {row.prNumber}
                </a>
              ) : null}
            </p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Lesson</p>
            <p className="brick-links">
              {row.lessonHref ? <Link href={row.lessonHref}>{row.lessonLabel}</Link> : <span>{row.lessonLabel}</span>}
            </p>
          </div>
        </li>
        {row.videoUrl ? (
          <li className="control-row">
            <div>
              <p className="control-name">Video</p>
              <p className="brick-links">
                <a href={row.videoUrl} rel="noreferrer">
                  {row.videoUrl}
                </a>
              </p>
            </div>
          </li>
        ) : null}
        {row.note ? (
          <li className="control-row">
            <div>
              <p className="control-name">Note</p>
              <p className="control-meta">{row.note}</p>
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
