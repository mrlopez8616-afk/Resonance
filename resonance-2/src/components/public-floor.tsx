import type { ReactNode } from "react";
import { LotBarChart } from "@/components/lot-bar-chart";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { EmptyCard, NodeGrid, StatCard } from "@/components/node-layout";
import type { BuildHomeCard } from "@/lib/build-tracker";
import { bookHomeFace, buildHomeFace, fightHomeFace, fitnessHomeFace, tileFace, type HomeFace } from "@/lib/home-faces";
import { publicLotChartModel, type PublicLotBar } from "@/lib/lot-bars";
import { nodeShelved } from "@/lib/node-visibility";
import {
  TREASURY_LINE,
  type PublicGroup,
  type PublicHolding,
} from "@/lib/public-mode";

export function PublicHoldingFace({
  holding,
  bars = [],
  compact = false,
  range,
}: {
  holding: PublicHolding;
  bars?: readonly PublicLotBar[];
  /** Parent card: mini bars in the spark slot. The node page keeps the full chart. */
  compact?: boolean;
  /** Full chart only. Compact cards ignore it. */
  range?: string | null;
}) {
  const chart = publicLotChartModel(bars);
  if (chart.bars.length === 0) return <EmptyCard span={compact ? "stat" : "trend"} label="Lots" />;
  return (
    <StatCard span={compact ? "stat" : "trend"} label="Lots">
      <LotBarChart
        model={chart}
        publicMode
        compact={compact}
        range={compact ? undefined : range}
        label={`${holding.ticker} lots`}
      />
    </StatCard>
  );
}

export function TreasuryCard() {
  return (
    <NodeFace
      face={tileFace({
        id: "treasury",
        glyph: "crypto",
        href: "",
        name: "Treasury",
        headline: TREASURY_LINE,
        status: "manual",
        live: true,
        publicMode: true,
      })}
    />
  );
}

export function PublicHome({
  crypto,
  aiStocks,
  fitness,
  fightRecord,
  buildHome,
  finance = null,
}: {
  crypto: PublicGroup;
  aiStocks: PublicGroup;
  fitness: { headline: string | null; unit: string | null; lines: readonly string[] };
  fightRecord: string | null;
  buildHome: BuildHomeCard | null;
  finance?: HomeFace | null;
}) {
  const fight = fightHomeFace({
    publicMode: true,
    headline: null,
    priceLine: null,
    record: fightRecord,
  });
  return (
    <>
      <NodeFace
        face={bookHomeFace({
          id: "crypto",
          name: "Crypto",
          href: "/n/crypto",
          publicMode: true,
          summary: null,
          connected: crypto.weightLabel !== null,
          mover: null,
          weightLabel: crypto.weightLabel,
          growthLabel: crypto.growthLabel,
        })}
      />
      <NodeFace
        face={bookHomeFace({
          id: "ai-stocks",
          name: "AI Stocks",
          href: "/n/ai-stocks",
          publicMode: true,
          summary: null,
          connected: aiStocks.weightLabel !== null,
          mover: null,
          weightLabel: aiStocks.weightLabel,
          growthLabel: aiStocks.growthLabel,
        })}
      />
      {finance ? <NodeFace face={finance} /> : null}
      {nodeShelved("fitness") ? null : (
        <NodeFace
          face={fitnessHomeFace({
            value: fitness.headline,
            unit: fitness.unit,
            lines: fitness.lines,
            publicMode: true,
          })}
        />
      )}
      {fight ? <NodeFace face={fight} /> : null}
      {buildHome ? (
        <NodeFace
          face={buildHomeFace({
            unavailable: buildHome.unavailable,
            percentLabel: buildHome.percentLabel,
            lines: buildHome.lines,
            publicMode: true,
          })}
        />
      ) : null}
    </>
  );
}

export function PublicGroupFloor({
  group,
  bars = [],
  treasury = false,
  extra = null,
  range,
}: {
  group: PublicGroup;
  bars?: readonly PublicLotBar[];
  treasury?: boolean;
  extra?: ReactNode;
  /** Holdings chart window. Child faces stay the weight and the gain. */
  range?: string | null;
}) {
  const chart = publicLotChartModel(bars);
  return (
    <>
      <NodeFaceGrid label={`${group.label} nodes`}>
        {group.holdings.map((holding) => (
          <NodeFace
            key={holding.id}
            face={tileFace({
              id: holding.id,
              glyph: group.id,
              href: `/n/${group.id}/${holding.id}`,
              name: holding.ticker,
              headline: holding.weightLabel,
              status: holding.gainLabel ? `${holding.gainLabel} since first buy` : null,
              live: Boolean(holding.weightLabel),
              publicMode: true,
            })}
          />
        ))}
        {extra}
        {treasury ? <TreasuryCard /> : null}
      </NodeFaceGrid>
      {chart.bars.length > 0 ? (
        <div className="public-lot-bars">
          <LotBarChart model={chart} publicMode range={range} label={`${group.label} holdings`} />
        </div>
      ) : null}
    </>
  );
}

export function PublicNodePage({
  ticker,
  holding,
  bars = [],
  range,
}: {
  ticker: string;
  holding: PublicHolding | null;
  bars?: readonly PublicLotBar[];
  range?: string | null;
}) {
  if (!holding) {
    return (
      <NodeGrid>
        <EmptyCard label={ticker} />
      </NodeGrid>
    );
  }
  const gain = holding.gainLabel ? `${holding.gainLabel} since first buy` : null;
  return (
    <NodeGrid>
      {holding.weightLabel ? (
        <StatCard label={holding.ticker} value={holding.weightLabel} detail={gain} />
      ) : (
        <EmptyCard label={holding.ticker} />
      )}
      <PublicHoldingFace holding={holding} bars={bars} range={range} />
    </NodeGrid>
  );
}

export function PublicFightRecord({ record }: { record: string | null }) {
  return (
    <NodeFaceGrid label="Fight Desk">
      <NodeFace
        face={tileFace({
          id: "fight-desk",
          href: "",
          name: "Fight Desk",
          headline: record ?? "unavailable",
          status: record ? "record" : null,
          live: record !== null,
          publicMode: true,
        })}
      />
    </NodeFaceGrid>
  );
}
