import type { ReactNode } from "react";
import { LotBarChart } from "@/components/lot-bar-chart";
import {
  barsFromClosedLots,
  barsFromOpenLots,
  barsFromRollup,
  unknownEntryCaption,
  type ClosedLotBarInput,
  type OpenLotBarInput,
} from "@/lib/lot-bars";
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
  type LotsLedger,
  type OpenLot,
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

function listedBooks(
  books: readonly { name: string | null; ledger: LotsLedger }[] | null,
  ledger: LotsLedger,
): readonly { name: string | null; ledger: LotsLedger }[] {
  const listed = books && books.length > 0 ? books : [{ name: null, ledger }];
  if (listed.some((book) => book.ledger === ledger)) return listed;
  return [...listed, { name: null, ledger }];
}

function openLotInputs(listed: readonly { ledger: LotsLedger }[]): OpenLotBarInput[] {
  return listed.flatMap((book) =>
    book.ledger.openLots.map((lot) => ({
      time: lot.time,
      day: lot.day,
      remainingQty: lot.remainingQty,
      originalQty: lot.originalQty,
      price: lot.price,
      entryUsd: lot.entryUsd,
      valueUsd: lot.valueUsd,
      pnlUsd: lot.pnlUsd,
      pnlPct: lot.pnlPct,
    })),
  );
}

function closedLotInputs(listed: readonly { ledger: LotsLedger }[]): ClosedLotBarInput[] {
  return listed.flatMap((book) =>
    book.ledger.closedLots.flatMap((lot) => {
      const entry = Number(lot.price);
      if (lot.exitUsd === null || lot.soldDay === null || !(entry > 0)) return [];
      return [
        {
          time: lot.time,
          day: lot.day,
          soldDay: lot.soldDay,
          originalQty: lot.originalQty,
          price: lot.price,
          entryUsd: entry,
          exitUsd: lot.exitUsd,
          realizedPnlUsd: lot.realizedPnlUsd,
          realizedPct: lot.realizedPct,
        },
      ];
    }),
  );
}

export function PositionBook({
  ledger,
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
  ticker = "",
  publicMode = false,
}: {
  ledger: LotsLedger;
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
  ticker?: string;
  publicMode?: boolean;
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
  const listed = listedBooks(books, ledger);
  const openCount = listed.reduce((count, book) => count + book.ledger.openLots.length, 0);
  const lotModel = {
    bars:
      openCount > 0
        ? barsFromOpenLots(openLotInputs(listed), publicMode)
        : barsFromClosedLots(closedLotInputs(listed), publicMode),
    caption: unknownEntryCaption(ticker, [ledger.gapShares, unknownShares, vaultShares]),
  };
  return (
    <div className="position-book">
      <LotBarChart model={lotModel} publicMode={publicMode} label={`${ticker || "Position"} lots`} />
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

export function PositionRollupView({
  rollup,
  parentId = "node",
  publicMode = false,
}: {
  rollup: PositionRollup;
  parentId?: string;
  publicMode?: boolean;
}) {
  if (rollup.rows.length === 0) return null;
  const lotModel = barsFromRollup(rollup.rows, parentId, publicMode);
  return (
    <section className="position-rollup" aria-label="Holdings roll-up">
      <LotBarChart model={lotModel} publicMode={publicMode} label="Holdings" />
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
