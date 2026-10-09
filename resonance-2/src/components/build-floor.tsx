import {
  formatUpdatedCt,
  pullHref,
  statusLabel,
  stepPercent,
  type BuildBoard,
  type BuildItem,
} from "@/lib/build-tracker";
import styles from "@/components/build-tracker.module.css";

function BuildItemCard({ item }: { item: BuildItem }) {
  const percent = stepPercent(item.steps);
  const width = percent ?? 0;
  const updated = formatUpdatedCt(item.updatedAt);
  return (
    <article className={styles.item}>
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
        {item.prNumber != null ? (
          <a href={pullHref(item.prNumber)}>#{item.prNumber}</a>
        ) : null}
        {updated ? <span>Updated {updated}</span> : null}
      </p>
      {item.nextStep ? <p className={styles.next}>{item.nextStep}</p> : null}
    </article>
  );
}

export function BuildFloor({ board }: { board: BuildBoard }) {
  const total = board.totalPercent;
  return (
    <div className={`build-floor ${styles.floor}`}>
      <header className={styles.heading}>
        <p className={styles.total}>{total === null ? "—" : `${total}%`}</p>
        <p className={styles.totalNote}>complete</p>
      </header>
      {board.githubFresh ? null : (
        <p className={styles.note}>GitHub didn&apos;t answer. Showing the last stored steps.</p>
      )}
      {board.groups.map((group) => (
        <section key={group.node} className={styles.group} aria-label={group.label}>
          <div className={styles.groupHead}>
            <h2>{group.label}</h2>
            <span className={styles.groupPercent}>
              {group.percent === null ? "no steps" : `${group.percent}%`}
            </span>
          </div>
          {group.active.length > 0 ? (
            <div className={styles.items}>
              {group.active.map((item) => (
                <BuildItemCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {group.shipped.length > 0 ? (
            <details className={styles.shipped}>
              <summary>Shipped</summary>
              <div className={styles.items}>
                {group.shipped.map((item) => (
                  <BuildItemCard key={item.id} item={item} />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ))}
    </div>
  );
}
