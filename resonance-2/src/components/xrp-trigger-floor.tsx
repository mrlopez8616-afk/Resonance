import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import { formatSpotPrice } from "@/lib/live-face";
import {
  XRP_TRIGGER_HREF,
  type TriggerBar,
  type XrpTriggerStatus,
} from "@/lib/xrp-trigger";

function linePrice(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function distanceCopy(view: XrpTriggerStatus, publicMode: boolean): string {
  if (!view.distanceLabel) return "no close";
  return publicMode
    ? `${view.distanceLabel} from the line`
    : `${view.distanceLabel} from ${linePrice(view.lineUsd)}`;
}

function TriggerBars({
  bars,
  line,
  publicMode,
}: {
  bars: readonly TriggerBar[];
  line: number;
  publicMode: boolean;
}) {
  if (bars.length === 0) return <p className="node-note">no closes</p>;
  const width = 320;
  const height = 64;
  const top = 6;
  const base = 52;
  let min = Math.min(line, ...bars.map((bar) => bar.close));
  let max = Math.max(line, ...bars.map((bar) => bar.close));
  if (min === max) {
    min -= 0.05;
    max += 0.05;
  }
  const pad = (max - min) * 0.16;
  min -= pad;
  max += pad;
  const span = max - min || 1;
  const yAt = (value: number) => base - ((value - min) / span) * (base - top);
  const lineY = yAt(line);
  const slot = width / bars.length;
  const label = publicMode
    ? `Last ${bars.length} daily closes versus the line`
    : `Last ${bars.length} daily closes versus ${linePrice(line)}`;
  return (
    <div className="home-visual trigger-bars">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1="0" x2={width} y1={lineY} y2={lineY} className="trigger-line" />
        {bars.map((bar, index) => {
          const y = yAt(bar.close);
          const x = index * slot + slot * 0.22;
          const barW = Math.max(slot * 0.56, 1.5);
          const topY = Math.min(y, lineY);
          const barH = Math.max(Math.abs(lineY - y), 1.5);
          const place = bar.above ? "above" : "below";
          const name = publicMode ? `${bar.ctLabel}, ${place}` : `${bar.ctLabel} ${formatSpotPrice(bar.close)}, ${place}`;
          return (
            <rect
              key={bar.day}
              x={x}
              y={topY}
              width={barW}
              height={barH}
              rx="1.2"
              className={bar.above ? "is-up" : "is-down"}
            >
              <title>{name}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/** Child card on the Crypto parent. Public copy leaves the ticker and dollar close off. */
export function XrpTriggerCard({
  view,
  publicMode,
}: {
  view: XrpTriggerStatus;
  publicMode: boolean;
}) {
  const title = publicMode ? "Trigger" : "XRP Trigger";
  return (
    <NodeSquare parent home live label={title}>
      <Link href={XRP_TRIGGER_HREF} className="node-log-link" title={`Open ${title}`}>
        <div className="live-face parent-face">
          <h2 className="node-ticker">{title}</h2>
          <p className="trigger-state">{view.stateLabel}</p>
          <ul className="parent-lines">
            <li>{distanceCopy(view, publicMode)}</li>
            <li>{`${view.streak} of ${view.holdDays}`}</li>
          </ul>
        </div>
      </Link>
    </NodeSquare>
  );
}

/** Checklist page. Prices on this page are the public market line, not a holding. */
export function XrpTriggerFloor({
  view,
  publicMode,
}: {
  view: XrpTriggerStatus;
  publicMode: boolean;
}) {
  const line = linePrice(view.lineUsd);
  return (
    <section className="trigger-watch" aria-label="XRP Trigger">
      <h2>XRP Trigger</h2>
      <p className="trigger-state">{view.stateLabel}</p>
      {view.distanceLabel ? (
        <p className="trigger-distance">{distanceCopy(view, publicMode)}</p>
      ) : (
        <p className="node-note">no close</p>
      )}
      {publicMode ? <p className="node-note">Line {line}</p> : null}
      {!publicMode && view.lastClose !== null && view.ctLabel ? (
        <p className="node-note">
          {formatSpotPrice(view.lastClose)} close · {view.ctLabel}
        </p>
      ) : null}
      <ol className="trigger-check">
        <li>{view.checklist.dailyClose}</li>
        <li>{view.checklist.holds}</li>
        <li>{view.checklist.founderGo}</li>
      </ol>
      <TriggerBars bars={view.bars} line={view.lineUsd} publicMode={publicMode} />
      <p className="trigger-note">Status only. Nothing here trades.</p>
    </section>
  );
}
