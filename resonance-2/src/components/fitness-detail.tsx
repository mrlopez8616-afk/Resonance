import { HeartTrend, RunBars } from "@/components/fitness-charts";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, StatCard } from "@/components/node-layout";
import {
  type FitnessDistanceTotal,
  type FitnessNodeDetail,
  type FitnessPacePoint,
} from "@/lib/fitness-board";
import { fitnessMetricEmpty, fitnessPart } from "@/lib/fitness-layout";
import type { NodePart } from "@/lib/node-layout";

function Totals({ title, rows }: { title: string; rows: readonly FitnessDistanceTotal[] }) {
  if (rows.length === 0) return null;
  return (
    <StatCard span="list" label={title}>
      <ul className="fitness-month-rows">
        {rows.map((row) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <strong>{row.distance}</strong>
          </li>
        ))}
      </ul>
    </StatCard>
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
    <StatCard span="trend" label="Pace">
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
    </StatCard>
  );
}

function formatPaceLabel(secPerMile: number): string {
  const total = Math.round(secPerMile);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function detailParts(detail: FitnessNodeDetail, locked: boolean): NodePart[] {
  if (locked) return ["missing"];
  return [fitnessPart(detail.headline), detail.rows.length > 0 ? "live" : "missing"];
}

export function FitnessDetail({
  detail,
  publicMode = false,
  updatedAt = null,
}: {
  detail: FitnessNodeDetail;
  publicMode?: boolean;
  updatedAt?: string | null;
}) {
  const locked = publicMode && detail.id === "heart";
  const rows = locked ? [] : detail.rows;
  const headline = locked || fitnessMetricEmpty(detail.headline) ? null : detail.headline;
  const bars = locked ? [] : (detail.bars ?? []);
  const heart = locked ? [] : (detail.heart ?? []);
  const weeks = locked ? [] : detail.weeks;
  const months = locked ? [] : detail.months;
  const pace = locked ? [] : detail.pace;
  const hasTrend = detail.id === "runs" ? bars.length > 0 || pace.length >= 2 : heart.length > 0;
  const hasList = rows.length > 0 || weeks.length > 0 || months.length > 0;
  return (
    <NodeLayout>
      <NodeHeader
        name={detail.title}
        parts={detailParts(detail, locked)}
        updatedAt={updatedAt}
        backHref="/n/fitness"
      />
      <NodeSection kind="numbers">
        <NodeGrid>
          {locked ? (
            <StatCard label={detail.title} locked />
          ) : headline ? (
            <StatCard label={detail.title} value={headline} detail={detail.detail} />
          ) : (
            <EmptyCard label={detail.title} />
          )}
        </NodeGrid>
      </NodeSection>
      <NodeSection kind="trends" empty={!hasTrend}>
        {hasTrend ? (
          <NodeGrid>
            {detail.id === "runs" && bars.length > 0 ? (
              <StatCard span="trend" label="Runs">
                <RunBars bars={bars} />
              </StatCard>
            ) : null}
            {detail.id === "runs" ? <PaceTrend points={pace} /> : null}
            {detail.id === "heart" && heart.length > 0 ? (
              <StatCard span="trend" label="Heart">
                <HeartTrend points={heart} />
              </StatCard>
            ) : null}
          </NodeGrid>
        ) : null}
      </NodeSection>
      <NodeSection kind="lists" empty={!hasList}>
        {hasList ? (
          <NodeGrid>
            {rows.length > 0 ? (
              <StatCard span="list" label={detail.title}>
                <ol className="fitness-log">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <strong>{row.primary}</strong>
                      {row.secondary ? <p>{row.secondary}</p> : null}
                    </li>
                  ))}
                </ol>
              </StatCard>
            ) : null}
            {detail.id === "runs" ? <Totals title="Weeks" rows={weeks} /> : null}
            {detail.id === "runs" ? <Totals title="Months" rows={months} /> : null}
          </NodeGrid>
        ) : null}
      </NodeSection>
    </NodeLayout>
  );
}
