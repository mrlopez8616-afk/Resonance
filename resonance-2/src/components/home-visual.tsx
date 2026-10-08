import type { ChangeBar } from "@/lib/home-lines";
import type { StepSlot, TierSegment, XrpSpark } from "@/lib/home-visuals";

function scale(values: readonly number[], extra: number): { min: number; max: number } {
  let min = Math.min(...values, extra);
  let max = Math.max(...values, extra);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) {
    min -= Math.abs(min) * 0.02 || 0.01;
    max += Math.abs(max) * 0.02 || 0.01;
  }
  const pad = (max - min) * 0.14;
  return { min: min - pad, max: max + pad };
}

export function XrpSparkVisual({ spark }: { spark: XrpSpark }) {
  const width = 160;
  const height = 36;
  const { min, max } = scale(spark.prices, spark.referenceUsd);
  const span = max - min || 1;
  const xAt = (index: number) =>
    spark.prices.length === 1 ? width / 2 : (index / (spark.prices.length - 1)) * width;
  const yAt = (value: number) => height - ((value - min) / span) * height;
  const line = spark.prices
    .map((price, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(price).toFixed(2)}`)
    .join(" ");
  const last = spark.prices.length - 1;
  const area = `${line} L${xAt(last).toFixed(2)} ${height} L0 ${height} Z`;
  const refY = yAt(spark.referenceUsd);
  return (
    <div className="home-visual">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="XRP over 7 days, with a $1.55 reference">
        <path d={area} className="home-spark-fill" />
        <path d={line} className="home-spark-line" />
        <line x1="0" x2={width} y1={refY} y2={refY} className="home-spark-ref" />
      </svg>
    </div>
  );
}

export function AiChangeVisual({ bars }: { bars: readonly ChangeBar[] }) {
  const width = 168;
  const height = 52;
  const labelY = 48;
  const mid = 24;
  const room = 18;
  const max = Math.max(1, ...bars.map((bar) => Math.abs(bar.changePct)));
  const slot = width / bars.length;
  return (
    <div className="home-visual">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Day change by ticker">
        <line x1="0" x2={width} y1={mid} y2={mid} className="home-zero" />
        {bars.map((bar, index) => {
          const magnitude = (Math.abs(bar.changePct) / max) * room;
          const heightPx = bar.changePct === 0 ? 1.5 : Math.max(magnitude, 1.5);
          const y = bar.changePct >= 0 ? mid - heightPx : mid;
          const tone = bar.changePct > 0 ? "is-up" : bar.changePct < 0 ? "is-down" : "is-flat";
          const x = index * slot + slot * 0.22;
          return (
            <g key={bar.ticker}>
              <title>{`${bar.ticker} ${bar.changePct > 0 ? "+" : ""}${bar.changePct.toFixed(1)}%`}</title>
              <rect x={x} y={y} width={slot * 0.56} height={heightPx} rx="1.2" className={tone} />
              <text x={index * slot + slot / 2} y={labelY} textAnchor="middle" className="home-tick">
                {bar.ticker}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FitnessStepVisual({ slots }: { slots: readonly StepSlot[] }) {
  const width = 168;
  const height = 52;
  const max = Math.max(1, ...slots.map((slot) => slot.steps ?? 0));
  const slotW = width / slots.length;
  const room = 28;
  return (
    <div className="home-visual">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Steps this week, Monday through Sunday">
        {slots.map((slot, index) => {
          const x = index * slotW + slotW * 0.22;
          const barW = slotW * 0.56;
          const filled = slot.steps !== null;
          const heightPx = filled ? Math.max(((slot.steps ?? 0) / max) * room, slot.steps === 0 ? 1.5 : 2) : 0;
          const y = 32 - heightPx;
          return (
            <g key={slot.day}>
              <title>
                {filled ? `${slot.day} ${Math.round(slot.steps ?? 0).toLocaleString("en-US")} steps` : `${slot.day} no steps`}
              </title>
              {filled ? (
                <rect x={x} y={y} width={barW} height={heightPx} rx="1.2" className="home-step" />
              ) : (
                <line x1={x} x2={x + barW} y1={32} y2={32} className="home-step-empty" />
              )}
              <text x={index * slotW + slotW / 2} y={46} textAnchor="middle" className="home-tick">
                {slot.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PredictionsVisual({
  segments,
  bankroll,
}: {
  segments: readonly TierSegment[] | null;
  bankroll: readonly number[] | null;
}) {
  if ((!segments || segments.length === 0) && (!bankroll || bankroll.length < 2)) return null;
  return (
    <div className="home-visual">
      {bankroll && bankroll.length >= 2 ? <BankrollLine points={bankroll} /> : null}
      {segments && segments.length > 0 ? (
        <>
          <div className="home-tier-bar" aria-hidden="true">
            {segments.map((segment) => (
              <span
                key={segment.id}
                className={`home-tier is-${segment.id.toLowerCase()}`}
                style={{ flexGrow: Math.max(segment.share, 0.04) }}
              />
            ))}
          </div>
          <ul className="home-tier-labels">
            {segments.map((segment) => (
              <li key={segment.id} className={`is-${segment.id.toLowerCase()}`}>
                {segment.label} {segment.atRiskLabel}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function BankrollLine({ points }: { points: readonly number[] }) {
  const width = 160;
  const height = 28;
  const { min, max } = scale(points, points[0] ?? 0);
  const span = max - min || 1;
  const xAt = (index: number) => (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
  const yAt = (value: number) => height - ((value - min) / span) * height;
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(point).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bankroll after settled bets">
      <path d={line} className="home-bankroll-line" />
    </svg>
  );
}
