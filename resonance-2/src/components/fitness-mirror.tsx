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

function RangeNav({ label, span, base }: { label: string; span: StepSpan; base: string }) {
  return (
    <nav className="lot-range fitness-span" aria-label={label}>
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

export function FitnessTabs({ tab, span = "w" }: { tab: FitnessTab; span?: StepSpan }) {
  const tabs: readonly { id: FitnessTab; label: string }[] = [
    { id: "steps", label: "Steps" },
    { id: "runs", label: "Runs" },
  ];
  return (
    <nav className="lot-range fitness-activity-tabs" aria-label="Activity">
      {tabs.map((item) => {
        const selected = tab === item.id;
        return (
          <Link
            key={item.id}
            href={fitnessTabHref(item.id, span)}
            className={selected ? "is-selected" : undefined}
            aria-current={selected ? "page" : undefined}
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
    <section className="fitness-totals" aria-label="Records">
      <h3>Records</h3>
      <ul className="fitness-pr-grid">
        {records.map((record) => (
          <li key={record.id}>
            <span>{record.label}</span>
            <strong>{record.value}</strong>
            <em>{record.when}</em>
          </li>
        ))}
      </ul>
      {note ? <p className="fitness-how">{note}</p> : null}
    </section>
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

function HistoryMonthBlock({ month }: { month: HistoryMonth }) {
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

function HistoryYearBlock({ year }: { year: HistoryYear }) {
  return (
    <details className="fitness-history-year">
      <summary>
        <span>{year.label}</span>
        <strong>{year.summary}</strong>
      </summary>
      {year.months.map((month) => (
        <HistoryMonthBlock key={month.id} month={month} />
      ))}
    </details>
  );
}

function hasHistory(history: ActivityHistory): boolean {
  return history.weeks.length > 0 || history.months.length > 0 || history.years.length > 0;
}

function ActivityHistoryView({ history }: { history: ActivityHistory }) {
  if (!hasHistory(history)) return null;
  return (
    <section className="fitness-history" aria-label="History">
      <h3>History</h3>
      {history.monthLabel ? <h4>{history.monthLabel}</h4> : null}
      <HistoryWeeks weeks={history.weeks} />
      {history.months.map((month) => (
        <HistoryMonthBlock key={month.id} month={month} />
      ))}
      {history.years.map((year) => (
        <HistoryYearBlock key={year.id} year={year} />
      ))}
    </section>
  );
}

export function StepsMirror({ view, rangeBase = "/n/fitness/steps" }: { view: StepsView; rangeBase?: string }) {
  return (
    <section className="fitness-mirror" aria-label="Steps">
      <header className="fitness-chart-head">
        <h2 className="node-ticker">Steps</h2>
        <RangeNav label="Step range" span={view.span} base={rangeBase} />
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
      <Records records={view.records} />
      <ActivityHistoryView history={view.history} />
    </section>
  );
}

export function RunsMirror({
  view,
  rangeBase = "/n/fitness?tab=runs",
}: {
  view: RunsView;
  rangeBase?: string;
}) {
  return (
    <section className="fitness-mirror" aria-label="Runs">
      <header className="fitness-chart-head">
        <h2 className="node-ticker">Runs</h2>
        <RangeNav label="Run range" span={view.span} base={rangeBase} />
      </header>
      {view.average ? (
        <>
          <p className="fitness-kicker">{view.averageLabel}</p>
          <p className="fitness-average">{view.average}</p>
          {view.trend ? <p className={`fitness-trend is-${view.trendTone}`}>{view.trend}</p> : null}
        </>
      ) : null}
      {view.hourlyNote ? <p className="fitness-empty">{view.hourlyNote}</p> : null}
      {view.bars.length > 0 ? <FitnessBars bars={view.bars} label="Runs" /> : null}
      {view.empty ? (
        <p className="fitness-empty" role="status">
          {view.empty}
        </p>
      ) : null}
      {view.rangeEmpty ? (
        <p className="fitness-empty" role="status">
          {view.rangeEmpty}
        </p>
      ) : null}
      <Records records={view.prs} note={view.prNote} />
      <ActivityHistoryView history={view.history} />
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
              <span>{"How it's calculated. "}</span>
              {metric.how}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
