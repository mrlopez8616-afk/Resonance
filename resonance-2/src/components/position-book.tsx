import type { ReactNode } from "react";
import {
  LOT_PREVIEW,
  bookTotals,
  formatLotPct,
  totalsWithUnknownHolding,
  formatLotUsd,
  formatSignedUsd,
  type BookTotals,
  type ClosedLot,
  type FillMarker,
  type LotsLedger,
  type OpenLot,
  type PositionChart,
  type PositionRollup,
} from "@/lib/position-lots";

function toneOf(value: number | null): "up" | "down" | "flat" | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function arrow(tone: "up" | "down" | "flat" | null): string {
  if (tone === "up") return "↑";
  if (tone === "down") return "↓";
  return "";
}

function pnlText(usd: number | null, pct: number | null): string {
  const money = formatSignedUsd(usd);
  const percent = formatLotPct(pct);
  const tone = toneOf(usd);
  const mark = arrow(tone);
  return [money, percent ? `${mark} ${percent}`.trim() : null].filter(Boolean).join(" · ");
}

function chartPaths(chart: PositionChart): { value: string; area: string; cost: string | null; markers: { x: number; y: number; marker: FillMarker }[] } | null {
  const points = chart.points;
  if (points.length < 2) return null;
  const width = 640;
  const height = 168;
  const pad = 8;
  const values = points.flatMap((point) => [point.valueUsd, point.costUsd ?? point.valueUsd]);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const room = Math.abs(min) * 0.02 || 1;
    min -= room;
    max += room;
  }
  const span = max - min || 1;
  const xAt = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const yAt = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(point.valueUsd).toFixed(2)}`)
    .join(" ");
  const baseline = height.toFixed(2);
  const area = `${line} L${xAt(points.length - 1).toFixed(2)} ${baseline} L${xAt(0).toFixed(2)} ${baseline} Z`;
  const costPoints = points.flatMap((point, index) =>
    point.costUsd === null ? [] : [{ index, cost: point.costUsd }],
  );
  let cost: string | null = null;
  const firstCost = costPoints[0];
  if (firstCost && costPoints.length >= 2) {
    let path = `M${xAt(firstCost.index).toFixed(2)} ${yAt(firstCost.cost).toFixed(2)}`;
    for (let index = 1; index < costPoints.length; index += 1) {
      const prev = costPoints[index - 1];
      const next = costPoints[index];
      if (!prev || !next) continue;
      path += ` L${xAt(next.index).toFixed(2)} ${yAt(prev.cost).toFixed(2)} L${xAt(next.index).toFixed(2)} ${yAt(next.cost).toFixed(2)}`;
    }
    cost = path;
  }
  const byDay = new Map(points.map((point, index) => [point.day, index]));
  const markers = chart.markers.flatMap((marker) => {
    const index = byDay.get(marker.day);
    const point = index === undefined ? undefined : points[index];
    if (index === undefined || !point) return [];
    return [{ x: xAt(index), y: yAt(point.valueUsd), marker }];
  });
  return { value: line, area, cost, markers };
}

export function PositionChartView({
  chart,
  totals,
}: {
  chart: PositionChart;
  totals: BookTotals | null;
}) {
  const drawn = chartPaths(chart);
  if (!drawn) return null;
  const first = chart.points[0]?.valueUsd ?? 0;
  const last = chart.points.at(-1)?.valueUsd ?? first;
  const tone = last > first ? "up" : last < first ? "down" : "flat";
  return (
    <figure className="position-chart">
      <div className="home-visual">
        <svg viewBox="0 0 640 168" role="img" aria-label="Position over time">
          <path d={drawn.area} className={`position-area is-${tone}`} />
          <path d={drawn.value} className={`position-value is-${tone}`} />
          {drawn.cost ? <path d={drawn.cost} className="position-cost" /> : null}
          {drawn.markers.map((mark, index) => (
            <circle
              key={`${mark.marker.time}-${mark.marker.side}-${index}`}
              cx={mark.x.toFixed(2)}
              cy={mark.y.toFixed(2)}
              r="4.5"
              className={`position-mark is-${mark.marker.side}`}
              data-day={mark.marker.day}
              data-side={mark.marker.side}
            >
              <title>
                {`${mark.marker.day} · ${mark.marker.side} · ${mark.marker.quantity} · ${mark.marker.price}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <figcaption className="position-caption">
        {chart.caption ? <span>{chart.caption}</span> : <span>value</span>}
        {drawn.cost ? <span>cost basis</span> : null}
        {chart.entry ? <span>{chart.entry}</span> : null}
      </figcaption>
      {totals && chart.mode === "matched" ? <TotalsLine totals={totals} /> : null}
    </figure>
  );
}

function TotalsLine({ totals }: { totals: BookTotals }) {
  return (
    <p className="position-totals">
      {totals.partialLabel ? <span>{totals.partialLabel}</span> : null}
      {totals.costUsd !== null ? <span>cost {formatLotUsd(totals.costUsd)}</span> : null}
      {totals.valueUsd !== null ? <span>value {formatLotUsd(totals.valueUsd)}</span> : null}
      <Pnl usd={totals.pnlUsd} pct={totals.pnlPct} />
    </p>
  );
}

function Pnl({ usd, pct }: { usd: number | null; pct: number | null }) {
  if (usd === null && pct === null) return null;
  const tone = toneOf(usd);
  return <span className={tone ? `is-${tone}` : undefined}>{pnlText(usd, pct)}</span>;
}

function lotRow(lot: OpenLot): ReactNode {
  const tone = toneOf(lot.pnlUsd);
  return (
    <li className="lot-row" key={`${lot.time}-${lot.price}`}>
      <span className="lot-main">
        <span className="lot-date">{lot.day}</span>
        <span>
          {lot.sharesLabel} @ {formatLotUsd(lot.entryUsd)}
        </span>
      </span>
      <span className="lot-side">
        {lot.valueUsd !== null ? <span>{formatLotUsd(lot.valueUsd)}</span> : null}
        <span className={tone ? `is-${tone}` : undefined}>
          {arrow(tone)} {formatLotPct(lot.pnlPct) ?? ""}
        </span>
      </span>
    </li>
  );
}

function closedRow(lot: ClosedLot): ReactNode {
  const tone = toneOf(lot.realizedPnlUsd);
  return (
    <li className="lot-row is-closed" key={`closed-${lot.time}-${lot.price}`}>
      <span className="lot-main">
        <span className="lot-date">{lot.day}</span>
        <span>
          {lot.originalQty} @ {formatLotUsd(Number(lot.price))}
        </span>
      </span>
      <span className={`lot-side${tone ? ` is-${tone}` : ""}`}>{formatSignedUsd(lot.realizedPnlUsd)}</span>
    </li>
  );
}

export function LotsTable({
  ledger,
  totals,
  liveLabel,
  vaultLine,
  unknownLine = null,
}: {
  ledger: LotsLedger;
  totals: BookTotals;
  liveLabel: string | null;
  vaultLine: string | null;
  unknownLine?: string | null;
}) {
  const preview = ledger.openLots.slice(0, LOT_PREVIEW);
  const rest = ledger.openLots.slice(LOT_PREVIEW);
  return (
    <section className="lot-book" aria-label="Lots">
      {ledger.status === "over" ? (
        <p className="lot-note">
          entry unknown · {ledger.note}
        </p>
      ) : null}
      <ul className="lot-list">
        {preview.map((lot) => lotRow(lot))}
        {rest.length > 0 ? (
          <li className="lot-more">
            <details>
              <summary>Show all {ledger.openLots.length} open lots</summary>
              <ul className="lot-list">{rest.map((lot) => lotRow(lot))}</ul>
            </details>
          </li>
        ) : null}
        {unknownLine ? (
          <li className="lot-row lot-gap">
            <span className="lot-main">
              <span>{unknownLine}</span>
            </span>
          </li>
        ) : null}
        {ledger.gapShares ? (
          <li className="lot-row lot-gap">
            <span className="lot-main">
              <span>entry unknown</span>
              <span>{ledger.gapShares} shares</span>
            </span>
            <span className="lot-side">{liveLabel}</span>
          </li>
        ) : null}
      </ul>
      <div className="lot-total">
        <span className="lot-main">
          <span>{totals.partialLabel ? `Total · ${totals.partialLabel}` : "Total"}</span>
          <span>
            {totals.sharesLabel}
            {totals.averageUsd !== null ? ` @ ${formatLotUsd(totals.averageUsd)}` : ""}
          </span>
        </span>
        <span className="lot-side">
          {totals.costUsd !== null ? <span>cost {formatLotUsd(totals.costUsd)}</span> : null}
          {totals.valueUsd !== null ? <span>{formatLotUsd(totals.valueUsd)}</span> : null}
          <Pnl usd={totals.pnlUsd} pct={totals.pnlPct} />
        </span>
      </div>
      {ledger.closedLots.length > 0 ? (
        <details className="lot-closed">
          <summary>Closed lots</summary>
          <ul className="lot-list">{ledger.closedLots.map((lot) => closedRow(lot))}</ul>
        </details>
      ) : null}
      {vaultLine ? <p className="lot-vault">{vaultLine}</p> : null}
    </section>
  );
}

export function PositionBook({
  ledger,
  chart,
  quantity,
  livePrice,
  vaultLine,
  unknownLine = null,
}: {
  ledger: LotsLedger;
  chart: PositionChart | null;
  quantity: string;
  livePrice: number | null;
  vaultLine: string | null;
  unknownLine?: string | null;
}) {
  const totals = totalsWithUnknownHolding(bookTotals(ledger, livePrice, quantity), unknownLine);
  const gapValue =
    ledger.gapShares && livePrice && livePrice > 0
      ? formatLotUsd(Number(ledger.gapShares) * livePrice)
      : null;
  return (
    <div className="position-book">
      {chart ? <PositionChartView chart={chart} totals={chart.mode === "matched" ? totals : null} /> : null}
      {chart?.mode === "holdings" ? (
        <p className="position-totals">
          <span>{chart.caption}</span>
          <span>{chart.entry}</span>
        </p>
      ) : null}
      <LotsTable
        ledger={ledger}
        totals={totals}
        liveLabel={gapValue}
        vaultLine={vaultLine}
        unknownLine={unknownLine}
      />
    </div>
  );
}

export function PositionRollupView({ rollup }: { rollup: PositionRollup }) {
  if (rollup.rows.length === 0) return null;
  const chart: PositionChart | null =
    rollup.points.length >= 2
      ? {
          mode: rollup.partial ? "holdings" : "matched",
          caption: rollup.partial ? "partial" : null,
          entry: null,
          points: rollup.points,
          markers: [],
        }
      : null;
  return (
    <section className="position-rollup" aria-label="Holdings roll-up">
      {chart ? <PositionChartView chart={chart} totals={null} /> : null}
      <div className="rollup-list">
        {rollup.rows.map((row) =>
          rollupLine({
            key: row.ticker,
            label: row.ticker,
            note: row.partial ? "entry unknown" : costNote(row.costUsd),
            value: formatLotUsd(row.valueUsd),
            usd: row.pnlUsd,
            pct: row.pnlPct,
          }),
        )}
        {rollupLine({
          total: true,
          label: rollup.partial ? "Total · partial" : "Total",
          note: costNote(rollup.costUsd),
          value: formatLotUsd(rollup.valueUsd),
          usd: rollup.pnlUsd,
          pct: rollup.pnlPct,
        })}
      </div>
    </section>
  );
}

function costNote(usd: number | null): string | null {
  const label = formatLotUsd(usd);
  return label ? `cost ${label}` : null;
}

function rollupLine({
  key,
  label,
  note,
  value,
  usd,
  pct,
  total = false,
}: {
  key?: string;
  label: string;
  note: string | null;
  value: string | null;
  usd: number | null;
  pct: number | null;
  total?: boolean;
}): ReactNode {
  const tone = toneOf(usd);
  const percent = formatLotPct(pct);
  const mark = arrow(tone);
  return (
    <div key={key} className={total ? "rollup-line is-total" : "rollup-line"}>
      <span className="rollup-label">
        <span className="rollup-name">{label}</span>
        {note ? <span className="rollup-note">{note}</span> : null}
      </span>
      <span className="rollup-figures">
        {value ? <span>{value}</span> : null}
        {percent ? <span className={tone ? `is-${tone}` : undefined}>{`${mark} ${percent}`.trim()}</span> : null}
      </span>
    </div>
  );
}
