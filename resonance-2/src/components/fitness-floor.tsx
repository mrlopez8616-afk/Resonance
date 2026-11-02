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
import type { AnalyticsMetric, RunDetailView, RunsView, StepBarModel, StepSpan, StepsView } from "@/lib/fitness-present";

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

function StepsBlock({ steps }: { steps: StepsView }) {
  return (
    <div id="steps">
      <NodeSection kind="numbers" label="Steps">
        <div className="fitness-block-top">
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
      </NodeSection>
    </div>
  );
}

function ActivityBlock({ runs, publicMode }: { runs: RunsView; publicMode: boolean }) {
  const month = runs.months[0];
  return (
    <div id="activity">
      <NodeSection kind="trends" label="Activity">
        {month ? <p className="node-note">{month.label}</p> : null}
        {month ? (
          <NodeGrid>
            <NumberCard label="Runs" value={month.runs} />
            <NumberCard label="Distance" value={month.miles} />
            <NumberCard label="Time" value={month.time} />
            <NumberCard label="Pace" value={month.pace} />
          </NodeGrid>
        ) : null}
        {runs.months.length > 1 ? (
          <NodeGrid>
            <StatCard span="list" label="Earlier months">
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
            </StatCard>
          </NodeGrid>
        ) : null}
        {runs.empty ? (
          <NodeGrid>
            <EmptyCard label="Activity" />
          </NodeGrid>
        ) : (
          <NodeGrid>
            <StatCard span="list" label="Runs">
              <ol className="fitness-activity">
                {runs.cards.map((run) => (
                  <li key={run.id}>
                    <Link href={run.href}>
                      <span>{run.date}</span>
                      <strong>{run.distance}</strong>
                      <em>
                        {[run.duration, run.pace, run.energy, publicMode ? null : run.avgHeart].filter(Boolean).join(" · ")}
                      </em>
                    </Link>
                  </li>
                ))}
              </ol>
            </StatCard>
          </NodeGrid>
        )}
        {runs.prs.length > 0 ? (
          <div className="fitness-records" aria-label="Records">
            <h3>Records</h3>
            <NodeGrid>
              {runs.prs.map((pr) => (
                <StatCard key={pr.id} label={pr.label} value={pr.value} detail={pr.when} />
              ))}
            </NodeGrid>
            {runs.prNote ? <p className="node-note">{runs.prNote}</p> : null}
          </div>
        ) : null}
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

/** One Fitness screen: steps chart, activity, and analytics. Run detail is the drill-down. */
export function FitnessFloor({
  steps,
  runs,
  analytics,
  publicMode = false,
  updatedAt = null,
}: {
  steps: StepsView;
  runs: RunsView;
  analytics: readonly AnalyticsMetric[];
  publicMode?: boolean;
  updatedAt?: string | null;
}) {
  return (
    <NodeLayout>
      <NodeHeader name="Fitness" parts={floorParts(steps, runs, analytics, publicMode)} updatedAt={updatedAt} backHref="/" />
      <div className="fitness-board">
        <StepsBlock steps={steps} />
        <ActivityBlock runs={runs} publicMode={publicMode} />
        <AnalyticsBlock metrics={analytics} publicMode={publicMode} />
      </div>
    </NodeLayout>
  );
}

function runParts(detail: RunDetailView, publicMode: boolean): NodePart[] {
  return [
    fitnessPart(detail.distance),
    fitnessPart(detail.duration),
    fitnessPart(detail.pace),
    detail.energy ? "live" : "missing",
    publicMode ? "missing" : detail.avgHeart ? "live" : "missing",
    publicMode ? "missing" : detail.maxHeart ? "live" : "missing",
    detail.splits.length > 0 ? "live" : "missing",
  ];
}

export function RunDetailMirror({
  detail,
  publicMode = false,
  updatedAt = null,
  backHref = "/n/fitness#activity",
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
          {publicMode ? (
            <StatCard label="Average heart rate" locked />
          ) : (
            <NumberCard label="Average heart rate" value={detail.avgHeart} />
          )}
          {publicMode ? <StatCard label="Max heart rate" locked /> : <NumberCard label="Max heart rate" value={detail.maxHeart} />}
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
    </NodeLayout>
  );
}
