import { FITNESS_EMPTY, type FitnessNodeDetail } from "@/lib/fitness-board";

export function FitnessDetail({ detail }: { detail: FitnessNodeDetail }) {
  return (
    <section className="fitness-detail" aria-label={`${detail.title} detail`}>
      <header className="live-head">
        <h2 className="node-ticker">{detail.title}</h2>
        {detail.headline ? <p className="value-headline">{detail.headline}</p> : null}
        {detail.headline && detail.detail ? <p className="value-price">{detail.detail}</p> : null}
      </header>
      {detail.rows.length === 0 ? (
        <p className="fitness-empty" role="status">
          {detail.detail ?? FITNESS_EMPTY}
        </p>
      ) : (
        <ol className="fitness-log">
          {detail.rows.map((row) => (
            <li key={row.id}>
              <strong>{row.primary}</strong>
              {row.secondary ? <p>{row.secondary}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
