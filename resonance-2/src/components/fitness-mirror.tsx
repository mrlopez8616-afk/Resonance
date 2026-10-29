import Link from "next/link";
import type { AnalyticsMetric, RunDetailView, RunsView, StepBarModel, StepSpan, StepsView } from "@/lib/fitness-present";

const SPANS: readonly { id: StepSpan; label: string }[] = [
  { id: "d", label: "D" },
  { id: "w", label: "W" },
  { id: "m", label: "M" },
  { id: "6m", label: "6M" },
  { id: "y", label: "Y" },
];

function FitnessBars({ bars, label }: { bars: readonly StepBarModel[]; label: string }) {
  if (bars.length === 0) return null;
  const width = 640;
  const height = 168;
  const max = Math.max(...bars.map((bar) => bar.value), 0.1);
  const slot = width / bars.length;
  const room = 112;
  const baseline = 128;
  const tickClass = bars.length > 12 ? "home-tick home-tick-compact" : "home-tick";
  const caption = bars.map((bar) => `${bar.label} ${bar.caption}`).join(", ");
  return (
    <div className="home-visual fitness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. ${caption}`}>
        {bars.map((bar, index) => {
          const barW = Math.min(slot * 0.62, 28);
          const x = index * slot + (slot - barW) / 2;
          const heightPx = bar.value <= 0 ? 2 : Math.max((bar.value / max) * room, 2);
          const y = baseline - heightPx;
          const showLabel = bars.length <= 8 || index === 0 || index === bars.length - 1 || index % Math.ceil(bars.length / 6) === 0;
          return (
            <g key={bar.id}>
              <title>{`${bar.label} ${bar.caption}`}</title>
              <rect x={x} y={y} width={barW} height={heightPx} rx="1.5" className="home-step" />
              {showLabel ? (
                <text x={index * slot + slot / 2} y={height - 8} textAnchor="middle" className={tickClass}>
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function StepsMirror({ view }: { view: StepsView }) {
  return (
    <section className="fitness-mirror" aria-label="Steps">
      <header className="fitness-chart-head">
        <h2 className="node-ticker">Steps</h2>
        <nav className="lot-range fitness-span" aria-label="Step range">
          {SPANS.map((span) => {
            const selected = view.span === span.id;
            return (
              <Link
                key={span.id}
                href={`/n/fitness/steps?span=${span.id}`}
                className={selected ? "is-selected" : undefined}
                aria-current={selected ? "true" : undefined}
              >
                {span.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {view.average ? (
        <>
          <p className="fitness-kicker">{view.averageLabel}</p>
          <p className="fitness-average">{view.average}</p>
          {view.trend ? <p className={`fitness-trend is-${view.trendTone}`}>{view.trend}</p> : null}
        </>
      ) : null}
      {view.hourlyNote ? <p className="fitness-empty">{view.hourlyNote}</p> : null}
      {view.bars.length > 0 ? <FitnessBars bars={view.bars} label="Steps" /> : null}
      {view.empty ? (
        <p className="fitness-empty" role="status">
          {view.empty}
        </p>
      ) : null}
      {view.highlights.length > 0 ? (
        <ul className="fitness-highlights">
          {view.highlights.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      ) : null}
      {view.days.length > 0 ? (
        <details className="fitness-days">
          <summary>
            {view.days.length} {view.days.length === 1 ? "day" : "days"}
          </summary>
          <ol>
            {view.days.map((day) => (
              <li key={day.id}>
                <span>{day.label}</span>
                <strong>{day.steps}</strong>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function RunFacts({
  distance,
  duration,
  pace,
  energy,
  avgHeart,
}: {
  distance: string;
  duration: string;
  pace: string;
  energy: string | null;
  avgHeart?: string;
}) {
  return (
    <>
      <strong className="fitness-run-distance">{distance}</strong>
      <p className="fitness-run-meta">
        {[duration, pace, energy, avgHeart].filter(Boolean).join(" · ")}
      </p>
    </>
  );
}

export function RunsMirror({ view }: { view: RunsView }) {
  return (
    <section className="fitness-mirror" aria-label="Runs">
      <header className="live-head">
        <h2 className="node-ticker">Runs</h2>
      </header>
      {view.empty ? (
        <p className="fitness-empty" role="status">
          {view.empty}
        </p>
      ) : (
        <ol className="fitness-run-list">
          {view.cards.map((run) => (
            <li key={run.id}>
              <Link href={run.href} className="fitness-run-card">
                <span className="fitness-run-date">{run.date}</span>
                <RunFacts
                  distance={run.distance}
                  duration={run.duration}
                  pace={run.pace}
                  energy={run.energy}
                  avgHeart={run.avgHeart}
                />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {view.months.length > 0 ? (
        <section className="fitness-totals" aria-label="Monthly totals">
          <h3>Months</h3>
          <ul className="fitness-month-list">
            {view.months.map((month) => (
              <li key={month.id}>
                <span>{month.label}</span>
                <strong>
                  {month.runs} {month.runs === "1" ? "run" : "runs"} · {month.miles} · {month.time} · {month.pace}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {view.prs.length > 0 ? (
        <section className="fitness-totals" aria-label="Personal records">
          <h3>Records</h3>
          <ul className="fitness-pr-grid">
            {view.prs.map((pr) => (
              <li key={pr.id}>
                <span>{pr.label}</span>
                <strong>{pr.value}</strong>
                <em>{pr.when}</em>
              </li>
            ))}
          </ul>
          {view.prNote ? <p className="fitness-how">{view.prNote}</p> : null}
        </section>
      ) : null}
    </section>
  );
}

export function RunDetailMirror({ detail }: { detail: RunDetailView }) {
  return (
    <section className="fitness-mirror" aria-label="Run">
      <header className="live-head">
        <h2 className="node-ticker">{detail.date}</h2>
        <p className="fitness-average">{detail.distance}</p>
        <p className="fitness-run-meta">
          {[detail.duration, detail.pace, detail.energy, detail.avgHeart, detail.maxHeart].filter(Boolean).join(" · ")}
        </p>
      </header>
      <section className="fitness-totals" aria-label="Splits">
        <h3>Splits</h3>
        {detail.splits.length > 0 ? (
          <ol className="fitness-split-list">
            {detail.splits.map((split) => (
              <li key={split.id}>
                <span>{split.label}</span>
                <strong>
                  {split.distance} · {split.pace}
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="fitness-empty">{detail.splitsNote}</p>
        )}
      </section>
    </section>
  );
}

export function AnalyticsMirror({ metrics }: { metrics: readonly AnalyticsMetric[] }) {
  return (
    <section className="fitness-mirror" aria-label="Resonance Analytics">
      <header className="live-head">
        <h2 className="node-ticker">Resonance Analytics</h2>
      </header>
      <div className="fitness-analytics-list">
        {metrics.map((metric) => (
          <article key={metric.id} className="fitness-analytics-card" aria-label={metric.title}>
            <h3>{metric.title}</h3>
            <p className="fitness-average">{metric.value}</p>
            {metric.detail ? <p className="fitness-trend">{metric.detail}</p> : null}
            {metric.bars.length > 0 ? <FitnessBars bars={metric.bars} label={metric.title} /> : null}
            <p className="fitness-how">
              <span>How it's calculated. </span>
              {metric.how}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
