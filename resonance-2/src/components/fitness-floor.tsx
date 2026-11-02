import type { ReactNode } from "react";
import Link from "next/link";
import {
  EmptyCard,
  NodeGrid,
  NodeHeader,
  NodeLayout,
  NodeSection,
  StatCard,
} from "@/components/node-layout";
import { fitnessMetricEmpty, fitnessPart } from "@/lib/fitness-layout";
import type { NodePart } from "@/lib/node-layout";
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

const HEART_LOCKS = [
  { id: "resting-heart", title: "Resting heart rate" },
  { id: "average-heart", title: "Average heart rate" },
] as const;

function isHeartMetric(id: string): boolean {
  return HEART_LOCKS.some((heart) => heart.id === id);
}

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

function NumberCard({
  label,
  value,
  detail,
  locked = false,
  span = "stat",
  children,
}: {
  label: string;
  value?: string | null;
  detail?: string | null;
  locked?: boolean;
  span?: "stat" | "trend" | "list";
  children?: ReactNode;
}) {
  if (locked) return <StatCard label={label} span={span} locked />;
  if (fitnessMetricEmpty(value)) return <EmptyCard label={label} span={span} />;
  return (
    <StatCard label={label} value={value} detail={detail} span={span}>
      {children}
    </StatCard>
  );
}

function floorParts(steps: StepsView, runs: RunsView, analytics: readonly AnalyticsMetric[], publicMode: boolean): NodePart[] {
  const parts: NodePart[] = [steps.average ? "live" : "missing", runs.cards.length > 0 ? "live" : "missing"];
  const seen = new Set<string>();
  for (const metric of analytics) {
    seen.add(metric.id);
    parts.push(publicMode && isHeartMetric(metric.id) ? "missing" : fitnessPart(metric.value));
  }
  if (publicMode) {
    for (const heart of HEART_LOCKS) {
      if (!seen.has(heart.id)) parts.push("missing");
    }
  }
  return parts;
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

function ActivityTabs({ tab, span }: { tab: FitnessTab; span: StepSpan }) {
  const tabs: readonly { id: FitnessTab; label: string }[] = [
    { id: "steps", label: "Steps" },
    { id: "runs", label: "Runs" },
  ];
  return (
    <nav className="fitness-segments fitness-tabs" aria-label="Activity">
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
    <div className="fitness-records" aria-label="Records">
      <h3>Records</h3>
      <NodeGrid>
        {records.map((record) => (
          <StatCard key={record.id} label={record.label} value={record.value} detail={record.when} />
        ))}
      </NodeGrid>
      {note ? <p className="node-note">{note}</p> : null}
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

function HistoryBlock({ history }: { history: ActivityHistory }) {
  if (!hasHistory(history)) return null;
  return (
    <NodeGrid>
      <StatCard span="list" label="History">
        <div className="fitness-history">
          {history.monthLabel ? <h4>{history.monthLabel}</h4> : null}
          <HistoryWeeks weeks={history.weeks} />
          {history.months.map((month) => (
            <HistoryMonthBlock key={month.id} month={month} />
          ))}
          {history.years.map((year) => (
            <HistoryYearBlock key={year.id} year={year} />
          ))}
        </div>
      </StatCard>
    </NodeGrid>
  );
}

function StepsBlock({ steps }: { steps: StepsView }) {
  return (
    <div id="steps">
      <NodeSection kind="numbers" label="Steps">
        <div className="fitness-block-top">
          <RangeNav label="Step range" span={steps.span} base="/n/fitness" />
        </div>
        <NodeGrid>
          {steps.average ? (
            <StatCard label="Steps" value={steps.average} detail={steps.averageLabel}>
              {steps.trend ? <p className={`fitness-delta is-${steps.trendTone}`}>{steps.trend}</p> : null}
              {steps.hourlyNote ? <p className="node-note">{steps.hourlyNote}</p> : null}
            </StatCard>
          ) : (
            <EmptyCard label="Steps" />
          )}
          {steps.bars.length > 0 ? (
            <StatCard span="trend" label="Steps" detail={steps.averageLabel}>
              <Bars bars={steps.bars} label="Steps" tall />
            </StatCard>
          ) : null}
        </NodeGrid>
        {steps.average ? null : steps.hourlyNote ? <p className="node-note">{steps.hourlyNote}</p> : null}
        {steps.highlights.length > 0 ? (
          <NodeGrid>
            <StatCard span="list" label="Highlights">
              <ul className="fitness-notes" aria-label="Highlights">
                {steps.highlights.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </StatCard>
          </NodeGrid>
        ) : null}
        <Records records={steps.records} />
        <HistoryBlock history={steps.history} />
      </NodeSection>
    </div>
  );
}

function RunsBlock({ runs }: { runs: RunsView }) {
  return (
    <div id="runs">
      <NodeSection kind="numbers" label="Runs">
        <div className="fitness-block-top">
          <RangeNav label="Run range" span={runs.span} base="/n/fitness?tab=runs" />
        </div>
        <NodeGrid>
          {runs.average ? (
            <StatCard label="Runs" value={runs.average} detail={runs.averageLabel}>
              {runs.trend ? <p className={`fitness-delta is-${runs.trendTone}`}>{runs.trend}</p> : null}
              {runs.hourlyNote ? <p className="node-note">{runs.hourlyNote}</p> : null}
            </StatCard>
          ) : (
            <EmptyCard label="Runs" />
          )}
          {runs.bars.length > 0 ? (
            <StatCard span="trend" label="Runs" detail={runs.averageLabel}>
              <Bars bars={runs.bars} label="Runs" tall />
            </StatCard>
          ) : null}
        </NodeGrid>
        {runs.average ? null : runs.hourlyNote ? <p className="node-note">{runs.hourlyNote}</p> : null}
        <Records records={runs.prs} note={runs.prNote} />
        <HistoryBlock history={runs.history} />
      </NodeSection>
    </div>
  );
}

function AnalyticsBlock({ metrics, publicMode }: { metrics: readonly AnalyticsMetric[]; publicMode: boolean }) {
  const shown = publicMode ? metrics.filter((metric) => !isHeartMetric(metric.id)) : metrics;
  const charts = shown.filter((metric) => metric.bars.length > 0 && !fitnessMetricEmpty(metric.value));
  return (
    <div id="analytics">
      <NodeSection kind="lists" label="Resonance Analytics">
        <NodeGrid>
          {shown.map((metric) =>
            fitnessMetricEmpty(metric.value) ? (
              <EmptyCard key={metric.id} label={metric.title} />
            ) : (
              <StatCard key={metric.id} label={metric.title} value={metric.value} detail={metric.detail}>
                <p className="fitness-how">
                  <span>How it's calculated. </span>
                  {metric.how}
                </p>
              </StatCard>
            ),
          )}
          {publicMode ? HEART_LOCKS.map((heart) => <StatCard key={heart.id} label={heart.title} locked />) : null}
        </NodeGrid>
        {charts.length > 0 ? (
          <NodeGrid>
            {charts.map((metric) => (
              <StatCard key={`${metric.id}-trend`} span="trend" label={metric.title} detail={metric.detail}>
                <Bars bars={metric.bars} label={metric.title} />
              </StatCard>
            ))}
          </NodeGrid>
        ) : null}
      </NodeSection>
    </div>
  );
}

/** Steps and Runs share one screen. A run detail is the drill-down. */
export function FitnessFloor({
  tab = "steps",
  steps,
  runs,
  analytics,
  publicMode = false,
  updatedAt = null,
}: {
  tab?: FitnessTab;
  steps: StepsView;
  runs: RunsView;
  analytics: readonly AnalyticsMetric[];
  publicMode?: boolean;
  updatedAt?: string | null;
}) {
  const span = tab === "runs" ? runs.span : steps.span;
  return (
    <NodeLayout>
      <NodeHeader name="Fitness" parts={floorParts(steps, runs, analytics, publicMode)} updatedAt={updatedAt} backHref="/" />
      <ActivityTabs tab={tab} span={span} />
      <div className="fitness-board">
        {tab === "runs" ? <RunsBlock runs={runs} /> : <StepsBlock steps={steps} />}
        <AnalyticsBlock metrics={analytics} publicMode={publicMode} />
      </div>
    </NodeLayout>
  );
}

function HeartLine({ points }: { points: readonly { minute: number; bpm: number }[] }) {
  if (points.length === 0) return null;
  const width = 640;
  const height = 148;
  const values = points.map((point) => point.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const low = min - span * 0.16;
  const high = max + span * 0.16;
  const top = 16;
  const bottom = 118;
  const last = points[points.length - 1]?.minute ?? 0;
  const xAt = (minute: number) => (last === 0 ? width / 2 : (minute / last) * (width - 24) + 12);
  const yAt = (value: number) => bottom - ((value - low) / (high - low || 1)) * (bottom - top);
  const paths: string[] = [];
  let current = "";
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && point.minute - previous.minute > 1 && current) {
      paths.push(current.trim());
      current = "";
    }
    current += `${current ? "L" : "M"}${xAt(point.minute).toFixed(2)} ${yAt(point.bpm).toFixed(2)} `;
  });
  if (current) paths.push(current.trim());
  const caption = points.map((point) => `${point.minute} min ${Math.round(point.bpm)} bpm`).join(", ");
  return (
    <div className="fitness-plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Heart rate. ${caption}`}>
        {paths.map((path, index) => (
          <path key={index} d={path} className="fitness-hr-line" />
        ))}
        {points.map((point) => (
          <g key={point.minute}>
            <title>{`${point.minute} min ${Math.round(point.bpm)} bpm`}</title>
            <circle cx={xAt(point.minute)} cy={yAt(point.bpm)} r="2.2" className="fitness-hr-line-dot" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function runParts(detail: RunDetailView, publicMode: boolean): NodePart[] {
  const heartPoints = publicMode ? 0 : (detail.heart?.length ?? 0);
  return [
    fitnessPart(detail.distance),
    fitnessPart(detail.duration),
    fitnessPart(detail.pace),
    detail.energy ? "live" : "missing",
    fitnessPart(detail.elevation),
    publicMode ? "missing" : detail.avgHeart ? "live" : "missing",
    publicMode ? "missing" : detail.maxHeart ? "live" : "missing",
    publicMode ? "missing" : heartPoints > 0 ? "live" : "missing",
    detail.splits.length > 0 ? "live" : "missing",
  ];
}

function HeartRateCard({ detail, publicMode }: { detail: RunDetailView; publicMode: boolean }) {
  if (publicMode) return <StatCard span="trend" label="Heart rate" locked />;
  const points = detail.heart ?? [];
  if (points.length === 0) return <EmptyCard span="trend" label="Heart rate" />;
  return (
    <StatCard span="trend" label="Heart rate">
      <HeartLine points={points} />
    </StatCard>
  );
}

export function RunDetailMirror({
  detail,
  publicMode = false,
  updatedAt = null,
  backHref = "/n/fitness?tab=runs",
}: {
  detail: RunDetailView;
  publicMode?: boolean;
  updatedAt?: string | null;
  backHref?: string;
}) {
  return (
    <NodeLayout>
      <NodeHeader name="Run" parts={runParts(detail, publicMode)} updatedAt={updatedAt} backHref={backHref} />
      <p className="node-note">{detail.date}</p>
      <NodeSection kind="numbers" label="Run">
        <NodeGrid>
          <NumberCard label="Distance" value={detail.distance} />
          <NumberCard label="Time" value={detail.duration} />
          <NumberCard label="Pace" value={detail.pace} />
          <NumberCard label="Energy" value={detail.energy} />
          <NumberCard label="Elevation" value={detail.elevation} span="trend" />
          {publicMode ? (
            <StatCard label="Average heart rate" locked />
          ) : (
            <NumberCard label="Average heart rate" value={detail.avgHeart} />
          )}
          {publicMode ? <StatCard label="Max heart rate" locked /> : <NumberCard label="Max heart rate" value={detail.maxHeart} />}
        </NodeGrid>
      </NodeSection>
      <NodeSection kind="trends" label="Heart rate">
        <NodeGrid>
          <HeartRateCard detail={detail} publicMode={publicMode} />
        </NodeGrid>
      </NodeSection>
      <NodeSection kind="lists" label="Splits">
        {detail.splits.length > 0 ? (
          <NodeGrid>
            <StatCard span="list" label="Splits">
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
            </StatCard>
          </NodeGrid>
        ) : (
          <NodeGrid>
            <EmptyCard label="Splits" span="list" />
          </NodeGrid>
        )}
      </NodeSection>
      <p className="node-note">{detail.route}</p>
    </NodeLayout>
  );
}
