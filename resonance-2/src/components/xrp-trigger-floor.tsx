import { NodeFace } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { tileFace } from "@/lib/home-faces";
import type { NodePart } from "@/lib/node-layout";
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
  staleLabel = null,
}: {
  view: XrpTriggerStatus;
  publicMode: boolean;
  staleLabel?: string | null;
}) {
  const title = publicMode ? "Trigger" : "XRP Trigger";
  const distance = `${distanceCopy(view, publicMode)} · ${view.streak} of ${view.holdDays}`;
  return (
    <NodeFace
      face={tileFace({
        id: "xrp-trigger",
        glyph: "crypto",
        href: XRP_TRIGGER_HREF,
        name: title,
        headline: view.stateLabel,
        status: staleLabel ? `${distance} · ${staleLabel}` : distance,
        live: true,
        publicMode,
      })}
    />
  );
}

/** Checklist page. Prices on this page are the public market line, not a holding. */
export function XrpTriggerFloor({
  view,
  publicMode,
  staleLabel = null,
  updatedAt = null,
}: {
  view: XrpTriggerStatus;
  publicMode: boolean;
  staleLabel?: string | null;
  updatedAt?: string | null;
}) {
  const line = linePrice(view.lineUsd);
  const distance = view.distanceLabel ? distanceCopy(view, publicMode) : null;
  const parts: NodePart[] = view.lastClose === null ? ["missing"] : staleLabel ? ["partial"] : ["live"];
  return (
    <NodeLayout>
      <NodeHeader name="XRP Trigger" parts={parts} updatedAt={updatedAt} backHref="/n/crypto" />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            <StatCard label="State" value={view.stateLabel} />
            {distance ? <StatCard label="Distance" value={distance} /> : <EmptyCard label="no close" />}
            {publicMode ? <StatCard label="Line" value={line} /> : null}
            {!publicMode && view.lastClose !== null && view.ctLabel ? (
              <StatCard label="Close" value={`${formatSpotPrice(view.lastClose)} close`} detail={view.ctLabel} />
            ) : null}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="trends">
          <NodeGrid>
            {view.bars.length === 0 ? (
              <EmptyCard span="trend" label="no closes" />
            ) : (
              <StatCard span="trend" label="Closes">
                <TriggerBars bars={view.bars} line={view.lineUsd} publicMode={publicMode} />
              </StatCard>
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeGrid>
            <StatCard span="list" label="Daily close" value={view.checklist.dailyClose} />
            <StatCard span="list" label="Holds" value={view.checklist.holds} />
            <StatCard span="list" label="Founder" value={view.checklist.founderGo} />
          </NodeGrid>
        </NodeSection>
      </NodeSections>
      {staleLabel ? <p className="node-note">{staleLabel}</p> : null}
      <p className="trigger-note">Status only. Nothing here trades.</p>
    </NodeLayout>
  );
}
