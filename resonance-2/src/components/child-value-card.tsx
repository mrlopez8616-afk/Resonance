import type { ReactNode } from "react";
import type { ChildCardLine, ChildCardModel, ChildCardSpark } from "@/lib/child-card";

function lineList(lines: readonly ChildCardLine[]): ReactNode {
  if (lines.length === 0) return null;
  return (
    <ul className="parent-lines">
      {lines.map((line, index) => (
        <li key={`${line.text}-${index}`} className={line.tone ? `is-${line.tone}` : undefined}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}

function sparkLine(spark: ChildCardSpark, wide: boolean, label: string): ReactNode {
  const width = wide ? 320 : 168;
  const height = wide ? 64 : 44;
  const pad = 3;
  const values = spark.prices;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    const room = Math.abs(min) * 0.02 || 0.01;
    min -= room;
    max += room;
  }
  const span = max - min || 1;
  const xAt = (index: number) =>
    values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
  const yAt = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const line = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(value).toFixed(2)}`)
    .join(" ");
  const baseline = height.toFixed(2);
  const area = `${line} L${xAt(values.length - 1).toFixed(2)} ${baseline} L${xAt(0).toFixed(2)} ${baseline} Z`;
  const tone = `is-${spark.tone}`;
  return (
    <div className="home-visual">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <path d={area} className={`price-spark-area ${tone}`} />
        <path d={line} className={`price-spark ${tone}`} />
      </svg>
    </div>
  );
}

/**
 * Shared child card. Headline is the position value. The live price, the day
 * move, a catalyst, and a real price history sit under it. Callers omit any
 * line they do not have.
 */
export function ChildValueCard({
  model,
  wide = false,
}: {
  model: ChildCardModel;
  wide?: boolean;
}) {
  return (
    <div className={`live-face value-card parent-face child-card${wide ? " is-wide" : ""}`}>
      <header className="live-head">
        <h2 className="node-ticker">{model.ticker}</h2>
        {model.headline ? (
          <p className="value-headline">{model.headline}</p>
        ) : model.label ? (
          <p className="node-note value-status">{model.label}</p>
        ) : null}
        {model.priceLine ? <p className="value-price">{model.priceLine}</p> : null}
      </header>
      {lineList(model.lines)}
      {model.spark ? sparkLine(model.spark, wide, `${model.ticker} price history`) : null}
      {lineList(model.footerLines)}
      {model.role ? <p className="child-role">{model.role}</p> : null}
    </div>
  );
}
