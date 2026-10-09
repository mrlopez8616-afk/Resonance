import type { ReactNode } from "react";
import { formatCompactUsd } from "@/lib/live-face";
import {
  LOT_PREVIEW,
  formatLotPct,
  positionBookTotals,
  formatLotUsd,
  formatSignedUsd,
  type AgenticLotLine,
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

function shownUsd(usd: number | null): string | null {
  if (usd === null || !Number.isFinite(usd) || usd === 0) return null;
  const label = formatLotUsd(usd);
  if (!label || label === "$0.00" || label === "-$0.00") return null;
  return label;
}

function shownSignedUsd(usd: number | null): string | null {
  const label = formatSignedUsd(usd);
  if (!label || label === "$0.00" || label === "-$0.00") return null;
  return label;
}

function TotalsLine({ totals }: { totals: BookTotals }) {
  const cost = shownUsd(totals.costUsd);
  const value = shownUsd(totals.valueUsd);
  return (
    <p className="position-totals">
      {totals.partialLabel ? <span>{totals.partialLabel}</span> : null}
      {cost ? <span>cost {cost}</span> : null}
      {value ? <span>value {value}</span> : null}
      <Pnl usd={totals.pnlUsd} pct={totals.pnlPct} />
    </p>
  );
}

function Pnl({ usd, pct }: { usd: number | null; pct: number | null }) {
  if (usd === null || usd === 0) return null;
  const tone = toneOf(usd);
  return <span className={tone ? `is-${tone}` : undefined}>{pnlText(usd, pct)}</span>;
}

function lotRow(lot: OpenLot, name: string | null): ReactNode {
  const tone = toneOf(lot.pnlUsd);
  return (
    <li className="lot-row" key={`${name ?? ""}-${lot.time}-${lot.price}`}>
      <span className="lot-main">
        <span className="lot-date">{name ? `${name} · ${lot.day}` : lot.day}</span>
        <span>
          {lot.sharesLabel} @ {formatLotUsd(lot.entryUsd)}
        </span>
      </span>
      <span className="lot-side">
        {shownUsd(lot.valueUsd) ? <span>{shownUsd(lot.valueUsd)}</span> : null}
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
      <span className={`lot-side${tone ? ` is-${tone}` : ""}`}>{shownSignedUsd(lot.realizedPnlUsd)}</span>
    </li>
  );
}

function holdingTotalLine(totals: BookTotals): string {
  const value = formatCompactUsd(totals.valueUsd);
  const money = value === "—" || value === "~$0.00" ? null : value;
  return ["Total", "partial", totals.sharesLabel, money, "entry unknown"].filter((part) => part && part.trim()).join(" · ");
}

function knownShareText(totals: BookTotals): string | null {
  const shares = totals.sharesLabel.trim();
  if (!shares || shares === "0") return null;
  const numeric = Number(shares.replace(/,/g, ""));
  if (Number.isFinite(numeric) && numeric === 0) return null;
  if (totals.partial) return shares;
  const average = totals.averageUsd !== null && totals.averageUsd > 0 ? shownUsd(totals.averageUsd) : null;
  return average ? `${shares} @ ${average}` : shares;
}

export function LotsTable({
  ledger,
  totals,
  liveLabel,
  vaultLine,
  unknownHolding = null,
  agenticLines = null,
  books = null,
}: {
  ledger: LotsLedger;
  totals: BookTotals;
  liveLabel: string | null;
  vaultLine: string | null;
  unknownHolding?: { name: string; shares: string; valueLabel: string | null } | null;
  agenticLines?: readonly AgenticLotLine[] | null;
  books?: readonly { name: string | null; ledger: LotsLedger }[] | null;
}) {
  const listed = books && books.length > 0 ? books : [{ name: null, ledger }];
  const openRows = listed.flatMap((book) =>
    book.ledger.openLots.map((lot) => ({ name: book.name, lot })),
  );
  const gaps = listed.flatMap((book) =>
    book.ledger.gapShares ? [{ name: book.name, shares: book.ledger.gapShares }] : [],
  );
  const closed = listed.flatMap((book) => book.ledger.closedLots);
  const preview = openRows.slice(0, LOT_PREVIEW);
  const rest = openRows.slice(LOT_PREVIEW);
  const cost = shownUsd(totals.costUsd);
  const value = shownUsd(totals.valueUsd);
  const shares = knownShareText(totals);
  const gapValue = liveLabel === "$0.00" || liveLabel === "-$0.00" ? null : liveLabel;
  const over = listed.find((book) => book.ledger.status === "over");
  return (
    <section className="lot-book" aria-label="Lots">
      {over ? (
        <p className="lot-note">
          entry unknown · {over.ledger.note}
        </p>
      ) : null}
      <ul className="lot-list">
        {preview.map((row) => lotRow(row.lot, row.name))}
        {rest.length > 0 ? (
          <li className="lot-more">
            <details>
              <summary>Show all {openRows.length} open lots</summary>
              <ul className="lot-list">{rest.map((row) => lotRow(row.lot, row.name))}</ul>
            </details>
          </li>
        ) : null}
        {agenticLines
          ? agenticLines.map((line) => (
              <li className="lot-row lot-gap" key={`${line.primary}-${line.secondary}`}>
                <span className="lot-main">
                  <span>{line.primary}</span>
                  <span>{line.secondary}</span>
                </span>
                <span className="lot-side">
                  {shownUsd(line.valueUsd) ? <span>{shownUsd(line.valueUsd)}</span> : null}
                  <Pnl usd={line.pnlUsd} pct={line.pnlPct} />
                </span>
              </li>
            ))
          : unknownHolding ? (
          <li className="lot-row lot-gap">
            <span className="lot-main">
              <span>{`${unknownHolding.name} · entry unknown`}</span>
              <span>{`${unknownHolding.shares} shares`}</span>
            </span>
            {unknownHolding.valueLabel ? <span className="lot-side">{unknownHolding.valueLabel}</span> : null}
          </li>
        ) : null}
        {gaps.map((gap) => (
          <li className="lot-row lot-gap" key={`${gap.name ?? "gap"}-${gap.shares}`}>
            <span className="lot-main">
              <span>{gap.name ? `${gap.name} · entry unknown` : "entry unknown"}</span>
              <span>{gap.shares} shares</span>
            </span>
            {gapValue && gaps.length === 1 ? <span className="lot-side">{gapValue}</span> : null}
          </li>
        ))}
      </ul>
      {totals.presentation === "holding" ? (
        <div className="lot-total is-holding">
          <span className="lot-main">
            <span>{holdingTotalLine(totals)}</span>
          </span>
        </div>
      ) : (
        <div className="lot-total">
          <span className="lot-main">
            <span>{totals.partialLabel ? `Total · ${totals.partialLabel}` : "Total"}</span>
            {shares ? <span>{shares}</span> : null}
          </span>
          <span className="lot-side">
            {cost ? <span>cost {cost}</span> : null}
            {value ? <span>{value}</span> : null}
            <Pnl usd={totals.pnlUsd} pct={totals.pnlPct} />
          </span>
        </div>
      )}
      {closed.length > 0 ? (
        <details className="lot-closed">
          <summary>Closed lots</summary>
          <ul className="lot-list">{closed.map((lot) => closedRow(lot))}</ul>
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
  unknownShares = null,
  vaultShares = null,
  agenticLines = null,
  books = null,
  holdingUnits = null,
  addedCostUsd = null,
  unexplained = false,
}: {
  ledger: LotsLedger;
  chart: PositionChart | null;
  quantity: string;
  livePrice: number | null;
  vaultLine: string | null;
  unknownShares?: string | null;
  vaultShares?: string | null;
  agenticLines?: readonly AgenticLotLine[] | null;
  books?: readonly { name: string | null; ledger: LotsLedger }[] | null;
  holdingUnits?: number | null;
  addedCostUsd?: number | null;
  unexplained?: boolean;
}) {
  const totals = positionBookTotals({
    ledger,
    livePrice,
    sleeveShares: quantity,
    unknownShares,
    vaultShares,
    holdingUnits,
    addedCostUsd,
    unexplained,
  });
  const gapValue =
    ledger.gapShares && livePrice && livePrice > 0
      ? shownUsd(Number(ledger.gapShares) * livePrice)
      : null;
  const unknownValue =
    unknownShares && livePrice && livePrice > 0 ? shownUsd(Number(unknownShares) * livePrice) : null;
  return (
    <div className="position-book">
      {chart ? <PositionChartView chart={chart} totals={chart.mode === "matched" ? totals : null} /> : null}
      <LotsTable
        ledger={ledger}
        totals={totals}
        liveLabel={gapValue}
        vaultLine={vaultLine}
        unknownHolding={
          agenticLines
            ? null
            : unknownShares
              ? { name: "Coinbase Agentic", shares: unknownShares, valueLabel: unknownValue }
              : null
        }
        agenticLines={agenticLines}
        books={books}
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
            value: shownUsd(row.valueUsd),
            usd: row.pnlUsd,
            pct: row.pnlPct,
          }),
        )}
        {rollupLine({
          total: true,
          label: rollup.partial ? "Total · partial" : "Total",
          note:
            rollup.costUsd === null || rollup.costUsd === 0
              ? rollup.partial
                ? "entry unknown"
                : null
              : costNote(rollup.costUsd),
          value: shownUsd(rollup.valueUsd),
          usd: rollup.pnlUsd,
          pct: rollup.pnlPct,
        })}
      </div>
    </section>
  );
}

function costNote(usd: number | null): string | null {
  const label = shownUsd(usd);
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
  const priced = usd !== null && usd !== 0;
  const tone = priced ? toneOf(usd) : null;
  const percent = priced ? formatLotPct(pct) : null;
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
