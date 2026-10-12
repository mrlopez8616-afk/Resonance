import type { FitnessHeartPoint, FitnessRunBar } from "@/lib/fitness-board";

function scale(values: readonly number[]): { min: number; max: number } {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.16;
  return { min: min - pad, max: max + pad };
}

export function RunBars({ bars, compact = false }: { bars: readonly FitnessRunBar[]; compact?: boolean }) {
  const shown = compact ? bars.slice(-8) : bars;
  if (shown.length === 0) return null;
  const width = compact ? 168 : 320;
  const height = compact ? 52 : 96;
  const labelY = height - 4;
  const baseline = compact ? 32 : 68;
  const room = compact ? 26 : 56;
  const max = Math.max(...shown.map((bar) => bar.miles), 0.1);
  const slot = width / shown.length;
  const tickClass = shown.length > 8 ? "home-tick home-tick-compact" : "home-tick";
  const label = shown.map((bar) => `${bar.label} ${bar.caption}`).join(", ");
  return (
    <div className="home-visual fitness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Runs, ${label}`}>
        {shown.map((bar, index) => {
          const barW = slot * 0.56;
          const x = index * slot + (slot - barW) / 2;
          const heightPx = Math.max((bar.miles / max) * room, 2);
          const y = baseline - heightPx;
          const showLabel = !compact && (shown.length <= 8 || index === 0 || index === shown.length - 1);
          return (
            <g key={bar.id}>
              <title>{`${bar.label} ${bar.caption}`}</title>
              <rect x={x} y={y} width={barW} height={heightPx} rx="1.2" className="home-step" />
              {showLabel ? (
                <text x={index * slot + slot / 2} y={labelY} textAnchor="middle" className={tickClass}>
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

function lineSegments(
  points: readonly FitnessHeartPoint[],
  pick: (point: FitnessHeartPoint) => number | null,
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    const value = pick(point);
    if (value === null) {
      if (current.length > 0) paths.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(value).toFixed(2)}`);
  });
  if (current.length > 0) paths.push(current.join(" "));
  return paths;
}

export function HeartTrend({
  points,
  compact = false,
}: {
  points: readonly FitnessHeartPoint[];
  compact?: boolean;
}) {
  const shown = compact ? points.slice(-8) : points;
  const values = shown.flatMap((point) => [point.resting, point.avg].filter((value): value is number => value !== null));
  if (shown.length === 0 || values.length === 0) return null;
  const width = compact ? 168 : 320;
  const height = compact ? 52 : 96;
  const { min, max } = scale(values);
  const span = max - min || 1;
  const top = compact ? 6 : 10;
  const bottom = compact ? 32 : 68;
  const xAt = (index: number) =>
    shown.length === 1 ? width / 2 : (index / (shown.length - 1)) * (width - 16) + 8;
  const yAt = (value: number) => bottom - ((value - min) / span) * (bottom - top);
  const resting = lineSegments(shown, (point) => point.resting, xAt, yAt);
  const avg = lineSegments(shown, (point) => point.avg, xAt, yAt);
  const hasResting = shown.some((point) => point.resting !== null);
  const hasAvg = shown.some((point) => point.avg !== null);
  const caption = shown
    .map((point) => {
      const parts = [point.label];
      if (point.resting !== null) parts.push(`${Math.round(point.resting)} resting`);
      if (point.avg !== null) parts.push(`${Math.round(point.avg)} avg`);
      return parts.join(" ");
    })
    .join(", ");
  const tickClass = shown.length > 8 ? "home-tick home-tick-compact" : "home-tick";
  return (
    <div className="home-visual fitness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Heart rate, ${caption}`}>
        {resting.map((path, index) => (
          <path key={`resting-${index}`} d={path} className="fitness-hr-resting" />
        ))}
        {avg.map((path, index) => (
          <path key={`avg-${index}`} d={path} className="fitness-hr-avg" />
        ))}
        {shown.map((point, index) => {
          const showLabel = !compact && (shown.length <= 8 || index === 0 || index === shown.length - 1);
          return (
            <g key={point.id}>
              <title>
                {point.label}
                {point.resting !== null ? ` ${Math.round(point.resting)} resting` : ""}
                {point.avg !== null ? ` ${Math.round(point.avg)} avg` : ""}
              </title>
              {point.resting !== null ? (
                <circle cx={xAt(index)} cy={yAt(point.resting)} r="2.2" className="fitness-hr-resting-dot" />
              ) : null}
              {point.avg !== null ? (
                <circle cx={xAt(index)} cy={yAt(point.avg)} r="2.2" className="fitness-hr-avg-dot" />
              ) : null}
              {showLabel ? (
                <text x={xAt(index)} y={height - 4} textAnchor="middle" className={tickClass}>
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {compact ? null : (
        <p className="fitness-legend">
          {[hasResting ? "resting" : null, hasAvg ? "avg" : null].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
