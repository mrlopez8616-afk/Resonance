import Link from "next/link";
import { LotBarChart } from "@/components/lot-bar-chart";
import { NodeSquare } from "@/components/node-square";
import type { BuildHomeCard } from "@/lib/build-tracker";
import { publicLotChartModel, type PublicLotBar } from "@/lib/lot-bars";
import {
  TREASURY_LINE,
  type PublicGroup,
  type PublicHolding,
  type PublicSeriesPoint,
} from "@/lib/public-mode";

function IndexChart({ points }: { points: readonly PublicSeriesPoint[] }) {
  if (points.length < 2) return null;
  const width = 320;
  const height = 72;
  const pad = 6;
  const indexes = points.map((point) => point.index);
  let min = Math.min(...indexes);
  let max = Math.max(...indexes);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min || 1;
  const xAt = (index: number) =>
    pad + (index / (points.length - 1)) * (width - pad * 2);
  const yAt = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const first = points[0];
  if (!first) return null;
  let path = `M${xAt(0).toFixed(2)} ${yAt(first.index).toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const prev = points[index - 1];
    if (!point || !prev) continue;
    const x = xAt(index).toFixed(2);
    path += ` L${x} ${yAt(prev.index).toFixed(2)} L${x} ${yAt(point.index).toFixed(2)}`;
  }
  const last = points.at(-1)?.index ?? first.index;
  const tone = last > first.index ? "up" : last < first.index ? "down" : "flat";
  return (
    <div className="home-visual">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Indexed growth">
        <path d={path} className={`position-value is-${tone}`} />
        {points.map((point, index) =>
          point.buy ? (
            <circle
              key={`${point.day}-${index}`}
              cx={xAt(index).toFixed(2)}
              cy={yAt(point.index).toFixed(2)}
              r="3.5"
              className="position-mark is-buy"
            >
              <title>Buy</title>
            </circle>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function PublicHoldingFace({
  holding,
  bars = [],
}: {
  holding: PublicHolding;
  bars?: readonly PublicLotBar[];
}) {
  const chart = publicLotChartModel(bars);
  return (
    <div className="live-face value-card parent-face child-card">
      <header className="live-head">
        <h2 className="node-ticker">{holding.ticker}</h2>
        <p className="value-headline">{holding.weightLabel}</p>
        {holding.gainLabel ? (
          <p className="value-price">{holding.gainLabel} since first buy</p>
        ) : null}
      </header>
      {chart.bars.length > 0 ? (
        <LotBarChart model={chart} publicMode label={`${holding.ticker} lots`} />
      ) : null}
    </div>
  );
}

export function TreasuryCard() {
  return (
    <NodeSquare parent home live label="Digital asset treasury">
      <div className="live-face parent-face">
        <p className="node-note">{TREASURY_LINE}</p>
      </div>
    </NodeSquare>
  );
}

function ParentFace({
  label,
  weightLabel,
  growthLabel,
  series,
}: {
  label: string;
  weightLabel: string | null;
  growthLabel: string | null;
  series: readonly PublicSeriesPoint[];
}) {
  return (
    <div className="live-face parent-face">
      <h2 className="node-ticker">{label}</h2>
      {weightLabel ? <p className="live-units">{weightLabel}</p> : null}
      {growthLabel ? <p className="value-price">{growthLabel}</p> : null}
      <IndexChart points={series} />
    </div>
  );
}

export function PublicHome({
  crypto,
  aiStocks,
  fitness,
  fightRecord,
  buildHome,
}: {
  crypto: PublicGroup;
  aiStocks: PublicGroup;
  fitness: { headline: string | null; unit: string | null; lines: readonly string[] };
  fightRecord: string | null;
  buildHome: BuildHomeCard | null;
}) {
  return (
    <section className="node-grid home-floor" aria-label="Node floor">
      <NodeSquare parent home wide={false} live={crypto.weightLabel !== null} label="Crypto">
        <Link href="/n/crypto" className="node-log-link" title="Open Crypto">
          <ParentFace
            label="Crypto"
            weightLabel={crypto.weightLabel}
            growthLabel={crypto.growthLabel}
            series={crypto.series}
          />
        </Link>
      </NodeSquare>
      <NodeSquare parent home wide live={aiStocks.weightLabel !== null} label="AI Stocks">
        <Link href="/n/ai-stocks" className="node-log-link" title="Open AI Stocks">
          <ParentFace
            label="AI Stocks"
            weightLabel={aiStocks.weightLabel}
            growthLabel={aiStocks.growthLabel}
            series={aiStocks.series}
          />
        </Link>
      </NodeSquare>
      <NodeSquare parent home live={fitness.headline !== null || fitness.lines.length > 0} label="Fitness">
        <Link href="/n/fitness" className="node-log-link" title="Open Fitness">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Fitness</h2>
            {fitness.headline ? (
              <p className="live-units">
                {fitness.headline}
                {fitness.unit ? <span> {fitness.unit}</span> : null}
              </p>
            ) : (
              <p className="node-note">not connected yet</p>
            )}
            {fitness.lines.length > 0 ? (
              <ul className="parent-lines">
                {fitness.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Link>
      </NodeSquare>
      {fightRecord ? (
        <NodeSquare parent home live label="Fight Desk">
          <Link href="/n/fight-desk" className="node-log-link" title="Open Fight Desk">
            <div className="live-face parent-face">
              <h2 className="node-ticker">Fight Desk</h2>
              <p className="value-headline">{fightRecord}</p>
            </div>
          </Link>
        </NodeSquare>
      ) : null}
      {buildHome ? (
        <NodeSquare
          parent
          home
          live={!buildHome.unavailable && buildHome.percentLabel !== null}
          dashed={buildHome.unavailable || buildHome.percentLabel === null}
          label="Build"
        >
          <Link href="/n/build" className="node-log-link" title="Open Build">
            <div className="live-face parent-face">
              <h2 className="node-ticker">Build</h2>
              {buildHome.unavailable || buildHome.percentLabel === null ? (
                <p className="node-note">unavailable</p>
              ) : (
                <p className="live-units">{buildHome.percentLabel}</p>
              )}
              {buildHome.lines.length > 0 ? (
                <ul className="parent-lines">
                  {buildHome.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Link>
        </NodeSquare>
      ) : null}
    </section>
  );
}

export function PublicGroupFloor({
  group,
  bars = [],
  treasury = false,
}: {
  group: PublicGroup;
  bars?: readonly PublicLotBar[];
  treasury?: boolean;
}) {
  const chart = publicLotChartModel(bars);
  return (
    <section className="node-grid child-floor" aria-label={`${group.label} nodes`}>
      {group.holdings.map((holding) => (
        <NodeSquare key={holding.id} parent home live label={`${holding.ticker} node`}>
          <Link
            href={`/n/${group.id}/${holding.id}`}
            className="node-log-link"
            title={`Open ${holding.ticker}`}
          >
            <PublicHoldingFace holding={holding} />
          </Link>
        </NodeSquare>
      ))}
      {chart.bars.length > 0 ? (
        <div className="public-lot-bars">
          <LotBarChart model={chart} publicMode label={`${group.label} holdings`} />
        </div>
      ) : null}
      {treasury ? <TreasuryCard /> : null}
    </section>
  );
}

export function PublicNodePage({
  ticker,
  holding,
  bars = [],
}: {
  ticker: string;
  holding: PublicHolding | null;
  bars?: readonly PublicLotBar[];
}) {
  if (!holding) {
    return (
      <section className="node-grid node-detail" aria-label={`${ticker} node`}>
        <NodeSquare dashed label={`${ticker} node`}>
          <div className="live-face">
            <h2 className="node-ticker">{ticker}</h2>
          </div>
        </NodeSquare>
      </section>
    );
  }
  return (
    <section className="node-grid node-detail" aria-label={`${ticker} node`}>
      <NodeSquare parent home live wide label={`${ticker} node`}>
        <PublicHoldingFace holding={holding} bars={bars} />
      </NodeSquare>
    </section>
  );
}

export function PublicFightRecord({ record }: { record: string | null }) {
  return (
    <section className="node-grid node-detail" aria-label="Fight Desk">
      <NodeSquare parent home live={record !== null} label="Fight Desk">
        <div className="live-face parent-face">
          <h2 className="node-ticker">Fight Desk</h2>
          <p className={record ? "value-headline" : "node-note"}>{record ?? "unavailable"}</p>
        </div>
      </NodeSquare>
    </section>
  );
}
