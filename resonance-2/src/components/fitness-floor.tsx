import Link from "next/link";
import {
  fitnessRangeHref,
  fitnessTabHref,
  type ActivityHistory,
  type AnalyticsMetric,
  type FitnessTab,
  type HistoryDay,
  type HistoryMonth,
  type HistoryWeek,
  type HistoryYear,
  type PrModel,
  type RunDetailView,
  type RunsView,
  type StepBarModel,
  type StepSpan,
  type StepsView,
} from "@/lib/fitness-present";

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

function RangeNav({ label, span, base }: { label: string; span: StepSpan; base: string }) {
  return (
    <nav className="fitness-segments" aria-label={label}>
      {SPANS.map((item) => {
        const selected = span === item.id;
        return (
          <Link
            key={item.id}
            href={fitnessRangeHref(base, item.id)}
            className={selected ? "is-selected" : undefined}
            aria-current={selected ? "true" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Records({ records, note }: { records: readonly PrModel[]; note?: string | null }) {
  if (records.length === 0) return null;
  return (
    <div className="fitness-records" aria-label="Records">
      <h3>Records</h3>
      <ul>
        {records.map((record) => (
          <li key={record.id}>
            <span>{record.label}</span>
            <strong>{record.value}</strong>
            <em>{record.when}</em>
          </li>
        ))}
      </ul>
      {note ? <p className="fitness-quiet">{note}</p> : null}
    </div>
  );
}

function HistoryDayRow({ day }: { day: HistoryDay }) {
  return (
    <li>
      <span>{day.href ? <Link href={day.href}>{day.label}</Link> : day.label}</span>
      <strong>{day.value}</strong>
      {day.lines && day.lines.length > 0 ? (
        <ol>
          {day.lines.map((line) => (
            <li key={line.id}>{line.href ? <Link href={line.href}>{line.value}</Link> : line.value}</li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function HistoryWeeks({ weeks }: { weeks: readonly HistoryWeek[] }) {
  return weeks.map((week) => (
    <details key={week.id} className="fitness-history-week">
      <summary>
        <span>{week.label}</span>
        <strong>{week.summary}</strong>
      </summary>
      <ol className="fitness-history-days">
        {week.days.map((day) => (
          <HistoryDayRow key={day.id} day={day} />
        ))}
      </ol>
    </details>
  ));
}

function HistoryMonth({ month }: { month: HistoryMonth }) {
  return (
    <details className="fitness-history-month">
      <summary>
        <span>{month.label}</span>
        <strong>{month.summary}</strong>
      </summary>
      <HistoryWeeks weeks={month.weeks} />
    </details>
  );
}

function HistoryYear({ year }: { year: HistoryYear }) {
  return (
    <details className="fitness-history-year">
      <summary>
        <span>{year.label}</span>
        <strong>{year.summary}</strong>
      </summary>
      {year.months.map((month) => (
        <HistoryMonth key={month.id} month={month} />
      ))}
    </details>
  );
}

function History({ history }: { history: ActivityHistory }) {
  if (history.weeks.length === 0 && history.months.length === 0 && history.years.length === 0) return null;
  return (
    <section className="fitness-history" aria-label="History">
      <h3>History</h3>
      {history.monthLabel ? <h4>{history.monthLabel}</h4> : null}
      <HistoryWeeks weeks={history.weeks} />
      {history.months.map((month) => (
        <HistoryMonth key={month.id} month={month} />
      ))}
      {history.years.map((year) => (
        <HistoryYear key={year.id} year={year} />
      ))}
    </section>
  );
}

function StepsBlock({ steps }: { steps: StepsView }) {
  return (
    <section className="fitness-block" id="steps" aria-label="Steps">
      <div className="fitness-block-top">
        <h2>Steps</h2>
        <RangeNav label="Step range" span={steps.span} base="/n/fitness" />
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
      <Records records={steps.records} />
      <History history={steps.history} />
    </section>
  );
}

function RunsBlock({ runs }: { runs: RunsView }) {
  return (
    <section className="fitness-block" id="runs" aria-label="Runs">
      <div className="fitness-block-top">
        <h2>Runs</h2>
        <RangeNav label="Run range" span={runs.span} base="/n/fitness?tab=runs" />
      </div>
      {runs.average ? (
        <p className="fitness-hero">
          <strong>{runs.average}</strong>
          <span>{runs.averageLabel}</span>
        </p>
      ) : (
        <p className="fitness-quiet" role="status">
          {runs.empty ?? runs.rangeEmpty}
        </p>
      )}
      {runs.trend ? <p className={`fitness-delta is-${runs.trendTone}`}>{runs.trend}</p> : null}
      {runs.hourlyNote ? <p className="fitness-quiet">{runs.hourlyNote}</p> : null}
      <Bars bars={runs.bars} label="Runs" tall />
      <Records records={runs.prs} note={runs.prNote} />
      <History history={runs.history} />
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

/** Steps and Runs share one screen. A run detail is the drill-down. */
export function FitnessFloor({
  tab = "steps",
  steps,
  runs,
  analytics,
}: {
  tab?: FitnessTab;
  steps: StepsView;
  runs: RunsView;
  analytics: readonly AnalyticsMetric[];
}) {
  const span = tab === "runs" ? runs.span : steps.span;
  return (
    <div className="fitness-board">
      <nav className="fitness-segments fitness-tabs" aria-label="Activity">
        <Link
          href={fitnessTabHref("steps", span)}
          className={tab === "steps" ? "is-selected" : undefined}
          aria-current={tab === "steps" ? "page" : undefined}
        >
          Steps
        </Link>
        <Link
          href={fitnessTabHref("runs", span)}
          className={tab === "runs" ? "is-selected" : undefined}
          aria-current={tab === "runs" ? "page" : undefined}
        >
          Runs
        </Link>
      </nav>
      {tab === "runs" ? <RunsBlock runs={runs} /> : <StepsBlock steps={steps} />}
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
