import Link from "next/link";
import type { AnalyticsMetric, RunDetailView, RunsView, StepBarModel, StepSpan, StepsView } from "@/lib/fitness-present";

const SPANS: readonly { id: StepSpan; label: string }[] = [
  { id: "d", label: "D" },
  { id: "w", label: "W" },
  { id: "m", label: "M" },
  { id: "6m", label: "6M" },
  { id: "y", label: "Y" },
];

function Bars({ bars, label, tall = false }: { bars: readonly StepBarModel[]; label: string; tall?: boolean }) {
  if (bars.length === 0) return null;
  const width = 640;
  const height = tall ? 148 : 86;
  const max = Math.max(...bars.map((bar) => bar.value), 0.1);
  const slot = width / bars.length;
  const room = tall ? 108 : 58;
  const baseline = tall ? 118 : 68;
  const caption = bars.map((bar) => `${bar.label} ${bar.caption}`).join(", ");
  return (
    <div className="fitness-plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. ${caption}`}>
        {bars.map((bar, index) => {
          const barW = Math.max(Math.min(slot * 0.72, 22), 2);
          const x = index * slot + (slot - barW) / 2;
          const heightPx = bar.value <= 0 ? 2 : Math.max((bar.value / max) * room, 2);
          const y = baseline - heightPx;
          const last = index === bars.length - 1;
          const showLabel = bars.length <= 8 || index === 0 || last || index % Math.ceil(bars.length / 5) === 0;
          return (
            <g key={bar.id}>
              <title>{`${bar.label} ${bar.caption}`}</title>
              <rect x={x} y={y} width={barW} height={heightPx} rx="1.2" className={last ? "fitness-bar is-now" : "fitness-bar"} />
              {showLabel ? (
                <text x={index * slot + slot / 2} y={height - 4} textAnchor="middle" className="fitness-tick">
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

function StepsBlock({ steps }: { steps: StepsView }) {
  return (
    <section className="fitness-block" id="steps" aria-label="Steps">
      <div className="fitness-block-top">
        <h2>Steps</h2>
        <nav className="fitness-segments" aria-label="Step range">
          {SPANS.map((span) => {
            const selected = steps.span === span.id;
            return (
              <Link
                key={span.id}
                href={`/n/fitness?span=${span.id}#steps`}
                className={selected ? "is-selected" : undefined}
                aria-current={selected ? "true" : undefined}
              >
                {span.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {steps.average ? (
        <p className="fitness-hero">
          <strong>{steps.average}</strong>
          <span>{steps.averageLabel}</span>
        </p>
      ) : (
        <p className="fitness-quiet" role="status">
          {steps.empty}
        </p>
      )}
      {steps.trend ? <p className={`fitness-delta is-${steps.trendTone}`}>{steps.trend}</p> : null}
      {steps.hourlyNote ? <p className="fitness-quiet">{steps.hourlyNote}</p> : null}
      <Bars bars={steps.bars} label="Steps" tall />
      {steps.highlights.length > 0 ? (
        <ul className="fitness-notes" aria-label="Highlights">
          {steps.highlights.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      ) : null}
      {steps.days.length > 0 ? (
        <details className="fitness-days">
          <summary>
            {steps.days.length} {steps.days.length === 1 ? "day" : "days"}
          </summary>
          <ol>
            {steps.days.map((day) => (
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

function ActivityBlock({ runs }: { runs: RunsView }) {
  const month = runs.months[0];
  return (
    <section className="fitness-block" id="activity" aria-label="Activity">
      <div className="fitness-block-top">
        <h2>Activity</h2>
        {month ? <p className="fitness-quiet">{month.label}</p> : null}
      </div>
      {month ? (
        <dl className="fitness-statline">
          <div>
            <dt>Runs</dt>
            <dd>{month.runs}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{month.miles}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{month.time}</dd>
          </div>
          <div>
            <dt>Pace</dt>
            <dd>{month.pace}</dd>
          </div>
        </dl>
      ) : null}
      {runs.months.length > 1 ? (
        <ul className="fitness-month-rows" aria-label="Earlier months">
          {runs.months.slice(1, 4).map((row) => (
            <li key={row.id}>
              <span>{row.label}</span>
              <strong>
                {row.runs} · {row.miles} · {row.pace}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
      {runs.empty ? (
        <p className="fitness-quiet" role="status">
          {runs.empty}
        </p>
      ) : (
        <ol className="fitness-activity">
          {runs.cards.map((run) => (
            <li key={run.id}>
              <Link href={run.href}>
                <span>{run.date}</span>
                <strong>{run.distance}</strong>
                <em>{[run.duration, run.pace, run.energy, run.avgHeart].filter(Boolean).join(" · ")}</em>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {runs.prs.length > 0 ? (
        <div className="fitness-records" aria-label="Records">
          <h3>Records</h3>
          <ul>
            {runs.prs.map((pr) => (
              <li key={pr.id}>
                <span>{pr.label}</span>
                <strong>{pr.value}</strong>
                <em>{pr.when}</em>
              </li>
            ))}
          </ul>
          {runs.prNote ? <p className="fitness-quiet">{runs.prNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function AnalyticsBlock({ metrics }: { metrics: readonly AnalyticsMetric[] }) {
  return (
    <section className="fitness-block fitness-analytics-block" id="analytics" aria-label="Resonance Analytics">
      <h2>Resonance Analytics</h2>
      <ul className="fitness-metrics">
        {metrics.map((metric) => (
          <li key={metric.id}>
            <div className="fitness-metric-head">
              <span>{metric.title}</span>
              <strong>{metric.value}</strong>
            </div>
            {metric.detail ? <p>{metric.detail}</p> : null}
            <Bars bars={metric.bars} label={metric.title} />
            <p className="fitness-how">
              <span>How it's calculated. </span>
              {metric.how}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One Fitness screen: steps chart, activity, and analytics. Run detail is the drill-down. */
export function FitnessFloor({
  steps,
  runs,
  analytics,
}: {
  steps: StepsView;
  runs: RunsView;
  analytics: readonly AnalyticsMetric[];
}) {
  return (
    <div className="fitness-board">
      <StepsBlock steps={steps} />
      <ActivityBlock runs={runs} />
      <AnalyticsBlock metrics={analytics} />
    </div>
  );
}

export function RunDetailMirror({ detail }: { detail: RunDetailView }) {
  return (
    <section className="fitness-block" aria-label="Run">
      <p className="fitness-quiet">{detail.date}</p>
      <p className="fitness-hero">
        <strong>{detail.distance}</strong>
        <span>{[detail.duration, detail.pace, detail.energy, detail.avgHeart, detail.maxHeart].filter(Boolean).join(" · ")}</span>
      </p>
      <h2>Splits</h2>
      {detail.splits.length > 0 ? (
        <ol className="fitness-splits">
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
        <p className="fitness-quiet">{detail.splitsNote}</p>
      )}
    </section>
  );
}
