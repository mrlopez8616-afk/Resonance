import {
  FITNESS_EMPTY,
  FITNESS_RUNS_EMPTY,
  type FitnessDistanceTotal,
  type FitnessNodeDetail,
  type FitnessPacePoint,
} from "@/lib/fitness-board";

function Totals({ title, rows }: { title: string; rows: readonly FitnessDistanceTotal[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="fitness-totals" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <strong>{row.distance}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaceTrend({ points }: { points: readonly FitnessPacePoint[] }) {
  if (points.length < 2) return null;
  const width = 320;
  const height = 72;
  const values = points.map((point) => point.secPerMile);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xAt = (index: number) => (index / (points.length - 1)) * (width - 8) + 4;
  const yAt = (value: number) => 46 - ((value - min) / span) * 36;
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(point.secPerMile).toFixed(2)}`)
    .join(" ");
  const showLabel = (index: number) => points.length <= 6 || index === 0 || index === points.length - 1;
  return (
    <section className="fitness-totals" aria-label="Pace">
      <h3>Pace</h3>
      <div className="home-visual">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pace in seconds per mile, oldest to newest">
          <path d={line} className="home-bankroll-line" />
          {points.map((point, index) => (
            <g key={point.id}>
              <title>{`${point.label} ${formatPaceLabel(point.secPerMile)}`}</title>
              <circle cx={xAt(index)} cy={yAt(point.secPerMile)} r="2" className="home-step" />
              {showLabel(index) ? (
                <text x={xAt(index)} y={66} textAnchor="middle" className="home-tick">
                  {point.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function formatPaceLabel(secPerMile: number): string {
  const total = Math.round(secPerMile);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

export function FitnessDetail({ detail }: { detail: FitnessNodeDetail }) {
  const empty = detail.rows.length === 0;
  return (
    <section className="fitness-detail" aria-label={`${detail.title} detail`}>
      <header className="live-head">
        <h2 className="node-ticker">{detail.title}</h2>
        {detail.headline ? <p className="value-headline">{detail.headline}</p> : null}
        {detail.headline && detail.detail ? <p className="value-price">{detail.detail}</p> : null}
      </header>
      {detail.id === "runs" ? (
        <>
          <Totals title="Weeks" rows={detail.weeks} />
          <Totals title="Months" rows={detail.months} />
          <PaceTrend points={detail.pace} />
        </>
      ) : null}
      {empty ? (
        <p className="fitness-empty" role="status">
          {detail.id === "runs" ? FITNESS_RUNS_EMPTY : (detail.detail ?? FITNESS_EMPTY)}
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
